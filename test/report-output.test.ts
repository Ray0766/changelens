// The HTML report and the JSON export: notices, page numbering, print styles,
// excerpts and English count wording.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareDocs } from '../src/core/compare.ts';
import { notices } from '../src/core/describe.ts';
import { t } from '../src/core/i18n.ts';
import { buildJson, buildReport, excerptHtml } from '../src/core/report.ts';
import type { Change } from '../src/core/types.ts';
import { SHIFT_PT } from '../src/core/visual.ts';
import { makeDoc, model } from './helpers.ts';

const P1 = [['The supplier delivers the goods to the site within ten working days of the order.', 'Delivery is free of charge for orders above the agreed minimum.']];
const P3 = [['Invoices are due thirty days after delivery and are paid by bank transfer.']];

/** Three pages; page 2 has no text at all (an image-only page). */
function textlessResult() {
  const doc = () => model(makeDoc('x', [P1, [], P3]));
  return compareDocs(doc(), doc());
}

test('JSON coverage page numbers are 1-based like the notices and every other page number', () => {
  const r = textlessResult();
  const j = buildJson({ result: r, lang: 'en', oldName: 'a.pdf', newName: 'b.pdf' }) as {
    coverage: { old: { textless: number[] }; new: { textless: number[]; uncertain?: { page: number }[] } };
    notices: { text: string }[];
    pageMap: { oldToNew: number[] };
  };
  assert.deepEqual(j.coverage.old.textless, [2]);
  assert.deepEqual(j.coverage.new.textless, [2]);
  assert.match(j.notices[0].text, /^Old version p\. 2: no text layer/);
  assert.deepEqual(j.pageMap.oldToNew, [1, 2, 3]);
  // The core result itself stays 0-based.
  assert.deepEqual(r.coverage.old.textless, [1]);
});

test('JSON and report state that graphics were not compared, and the JSON names the tool version', () => {
  const r = textlessResult();
  const input = { result: r, lang: 'en' as const, oldName: 'a.pdf', newName: 'b.pdf', version: '9.9.9', visualCompared: false };
  const j = buildJson(input) as { tool: { name: string; version: string }; visualCompared: boolean; complete: boolean; notices: { level: string; text: string }[] };
  assert.deepEqual(j.tool, { name: 'ChangeLens', version: '9.9.9' });
  assert.equal(j.visualCompared, false);
  assert.equal(j.complete, false);
  const noVisual = t('en', 'noticeNoVisual');
  assert.ok(j.notices.some((n) => n.text === noVisual));
  const html = buildReport(input);
  assert.ok(html.includes(noVisual));
  // No bare "no differences" when part of the documents was not compared.
  assert.ok(!html.includes(`<p>${t('en', 'noChanges')}</p>`));
  assert.ok(html.includes(t('en', 'noChangesIncomplete')));
  // Everything compared: the plain message, and complete = true.
  const full = model(makeDoc('x', [P1, P3]));
  const r2 = compareDocs(full, model(makeDoc('x', [P1, P3])));
  const all = { result: r2, lang: 'en' as const, oldName: 'a.pdf', newName: 'b.pdf', visualCompared: true };
  assert.ok(buildReport(all).includes(`<p>${t('en', 'noChanges')}</p>`));
  assert.equal((buildJson(all) as { complete: boolean }).complete, true);
});

test('printed report uses light colours even under a dark colour scheme, and badges do not need backgrounds', () => {
  const html = buildReport({ result: textlessResult(), lang: 'en', oldName: 'a.pdf', newName: 'b.pdf' });
  const css = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));
  const print = css.slice(css.indexOf('@media print'));
  // Browsers drop backgrounds when printing, so text colours must suit white paper.
  const token = (name: string) => new RegExp(`--${name}:(#[0-9a-f]{6})`).exec(print)?.[1];
  const lum = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrastOnWhite = (hex: string) => 1.05 / (lum(hex) + 0.05);
  for (const name of ['ink', 'muted']) {
    const v = token(name);
    assert.ok(v, `print sets --${name}`);
    assert.ok(contrastOnWhite(v) >= 4.5, `--${name} ${v} on white`);
  }
  assert.match(print, /color-scheme:light/);
  assert.match(print, /\.badge\{background:none;[^}]*border:/);
  assert.match(print, /ins\{background:none;text-decoration:underline/);
});

test('a moved and edited paragraph shows its old wording as well as the new one', () => {
  const side = (text: string) => ({ pages: [0], rects: [], text });
  const move = {
    id: 'c1', kind: 'move', category: 'text', size: 9, cjk: false, contextBefore: '', contextAfter: '', order: 0,
    old: side('The monthly service fee is 100 dollars per seat.'),
    new: side('The monthly service fee is 900 dollars per seat.'),
  } as Change;
  const html = excerptHtml(move);
  assert.match(html, /<del>The monthly service fee is 100 dollars per seat\.<\/del>/);
  assert.match(html, /<mark class="mv">The monthly service fee is 900 dollars per seat\.<\/mark>/);
  // A plain move shows the text once.
  const plain = excerptHtml({ ...move, new: side(move.old.text) });
  assert.ok(!plain.includes('<del>'));
  assert.equal(plain.split('100 dollars').length, 2);
});

test('English counts use singular forms', () => {
  assert.equal(t('en', 'pagesLine', { old: 1, new: 1 }), '1 page → 1 page');
  assert.equal(t('en', 'pagesLine', { old: 1, new: 2 }), '1 page → 2 pages');
  assert.equal(t('en', 'pagesCount', { n: 1 }), '1 page');
  assert.equal(t('en', 'pagesCount', { n: 0 }), '0 pages');
  assert.equal(t('en', 'summaryLine', { text: 1, num: 1, visual: 0 }), '1 text · 1 number · 0 layout');
  assert.equal(t('en', 'addedWords', { n: 1 }), 'Added 1 word');
  assert.equal(t('en', 'inPlaces', { n: 2 }), 'in 2 places');
  assert.equal(t('zh', 'pagesLine', { old: 1, new: 2 }), '1 页 → 2 页');
  // Notices for a one-page pair with one ignored difference of each kind.
  const r = compareDocs(model(makeDoc('x', [P1])), model(makeDoc('x', [P1])));
  r.ignored = { furniture: 1, caseOnly: 1, minorShifts: 1, renumbered: 1 };
  r.coverage.old.unreadable = [{ page: 0, count: 1 }];
  const text = notices('en', r).map((n) => n.text);
  assert.deepEqual(text, [
    'Old version p. 1: 1 character could not be read as text; changes to it may be missed.',
    '1 difference in headers, footers or page numbers is ignored.',
    '1 list number changed only because items were added or removed above it; it is not listed.',
    `1 place where lines or graphics shifted slightly (≤ ${SHIFT_PT} pt) is not listed.`,
    '1 difference only in upper/lower case is ignored.',
  ]);
  for (const s of text) assert.doesNotMatch(s, /\b1 \w+s\b|  /, s);
  const html = buildReport({ result: r, lang: 'en', oldName: 'a.pdf', newName: 'b.pdf' });
  assert.ok(html.includes('1 page → 1 page'));
  assert.ok(html.includes('<b>a.pdf</b> · 1 page'));
});
