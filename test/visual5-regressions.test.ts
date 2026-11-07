// Visual stage, fix round 5 (after blind round 4): noise from table header
// rows repeated at moved page tops and from re-phased table rules; strike,
// underline, colour and weight checks on glyphs that only moved; ink under a
// removed watermark; and smaller items (a turned page, wrapped colour
// changes, change bars). Fixtures: test/fixtures/make-visual5-fixtures.mjs
// (Chromium, SYNTHETIC) and the blind round 4 cases in eval/cases/holdout4-*.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openPdf } from '../src/node/pdf.ts';
import { renderPage, canRender } from '../src/node/render.ts';
import { extractText } from '../src/pdf/extract.ts';
import { buildDocModel } from '../src/core/tokenize.ts';
import { compareDocs } from '../src/core/compare.ts';
import { addVisualChanges } from '../src/core/pipeline.ts';
import { compareRasters } from '../src/core/visual.ts';
import { describeChange } from '../src/core/describe.ts';
import type { Change, CompareResult } from '../src/core/types.ts';

const fixtures = new URL('./fixtures/', import.meta.url).pathname;
const cases = new URL('../eval/cases/', import.meta.url).pathname;
const skip = !(await canRender()) && 'no canvas';

type Docs = { r: CompareResult; pa: Awaited<ReturnType<typeof openPdf>>; pb: Awaited<ReturnType<typeof openPdf>> };
async function text(before: string, after: string): Promise<Docs> {
  const pa = await openPdf(before);
  const pb = await openPdf(after);
  const r = compareDocs(buildDocModel(await extractText(pa, 'old')), buildDocModel(await extractText(pb, 'new')));
  return { r, pa, pb };
}
async function run(before: string, after: string): Promise<CompareResult> {
  const { r, pa, pb } = await text(before, after);
  await addVisualChanges(r, (p) => renderPage(pa, p, 1.5), (p) => renderPage(pb, p, 1.5));
  return r;
}
const fixture = (a: string, b: string) => run(fixtures + a, fixtures + b);
const holdout = (id: string) => run(`${cases}${id}/before.pdf`, `${cases}${id}/after.pdf`);
const holdoutText = (id: string) => text(`${cases}${id}/before.pdf`, `${cases}${id}/after.pdf`);
/** Visual changes found on one page pair (1-based pages), as the pipeline compares it. */
async function onPair(d: Docs, oldPage: number, newPage: number): Promise<Change[]> {
  return compareRasters(d.r, oldPage - 1, newPage - 1, await renderPage(d.pa, oldPage - 1, 1.5), await renderPage(d.pb, newPage - 1, 1.5));
}

const list = (cs: Change[]) => cs.map((c) => describeChange('en', c)).join(' | ');
const visual = (r: CompareResult) => r.changes.filter((c) => c.category === 'visual');
const graphics = (cs: Change[]) => cs.filter((c) => c.kind === 'graphic' && !c.format && !c.pageChange && !c.minor);
const formats = (cs: Change[]) => cs.filter((c) => c.format);

let table: CompareResult | null = null;
const table5 = async () => (table ??= await fixture('table5-before.pdf', 'table5-after.pdf'));

test('the shading of a table header row repeated at a moved page top goes with that row', { skip }, async () => {
  // Before: three header bands at page tops and a re-phased rule were
  // listed as "Graphic or image added".
  const r = await table5();
  assert.deepEqual(list(visual(r)), '');
  // The header rows are still counted, and the bands are shown with them:
  // places added to the header row's own.
  assert.equal(r.ignored.repeatedLines, 7);
  const { r: plain } = await text(fixtures + 'table5-before.pdf', fixtures + 'table5-after.pdf');
  const places = (x: CompareResult) => x.minor.filter((c) => c.consequence === 'repeatedLine').map((c) => c.old.rects.length + c.new.rects.length);
  const before = places(plain);
  const after = places(r);
  assert.equal(after.length, before.length);
  assert.ok(after.filter((n, k) => n > before[k]).length >= 3, `${before} → ${after}`);
});

test('a header shading changed throughout a table, and a rule added elsewhere, are still reported', { skip }, async () => {
  const colour = await fixture('table5-before.pdf', 'table5-colour-after.pdf');
  // Every header copy that is matched in both versions is compared.
  assert.ok(graphics(visual(colour)).length >= 3, list(visual(colour)));
  const rule = await fixture('table5-before.pdf', 'table5-rule-after.pdf');
  const g = graphics(visual(rule));
  assert.equal(g.length, 1, list(visual(rule)));
  assert.ok(g[0].new.rects[0].rect.w > 300 && g[0].new.rects[0].rect.h <= 8, JSON.stringify(g[0].new.rects));
});

test('a header row repeated on most pages (a running header) is not compared with rows that came from the page before', { skip }, async () => {
  // Rows at the foot of p. 1 went to the top of p. 2 under the repeated
  // header; the header's band was compared with the place they came from.
  const r = await fixture('thead5-before.pdf', 'thead5-after.pdf');
  assert.deepEqual(list(visual(r)), '');
  assert.ok(r.changes.some((c) => c.kind === 'insert'));
});

test('header bands and table rules re-drawn after a re-flow are not graphic changes (asset plan, round 4)', { skip }, async () => {
  const d = await holdoutText('holdout4-f-en-asset-plan-long');
  // p5: the band of a header row no longer repeated there; p43: the header's
  // bottom rule 148.5 pt lower; p17 → p18: the same rule on the next page.
  for (const [o, n] of [
    [5, 5],
    [43, 43],
    [17, 18],
  ]) {
    const cs = await onPair(d, o, n);
    assert.deepEqual(list(cs.filter((c) => !c.minor)), '', `${o}:${n}`);
  }
});

test('the shading of a table row added with its text goes with that insertion', { skip }, async () => {
  // Before: the shaded heading row of the added group was also listed as
  // "Graphic or image added".
  const r = await fixture('row5-before.pdf', 'row5-after.pdf');
  assert.deepEqual(list(r.changes), 'Added “Valves VLV-2010 Gate valve, DN150 265.00”');
  assert.ok(r.changes[0].new.rects.some((x) => x.rect.w > 400), JSON.stringify(r.changes[0].new.rects));
  // Round 4: the shaded "Motors" group row that went to the next page.
  assert.deepEqual(list(graphics(visual(await holdout('holdout4-e-xlsx-spare-parts-prices')))), '');
});

test('CJK characters and figures that only moved are not taken for struck or underlined (round 4)', { skip }, async () => {
  // 重 (ja contract p. 3), 年 (zh-hant report p. 6), "4" and 装 (zh-en annex
  // p. 2), 一 主 查 (controller manual p. 7–8): each moved by a fraction of a
  // pixel, and its own horizontal stroke was read as a line.
  for (const [id, pairs] of [
    ['holdout4-f-ja-maintenance-contract', [[3, 3]]],
    ['holdout4-f-zh-hant-community-annual-report', [[6, 6]]],
    ['holdout4-e-docx-zh-en-supply-annex', [[2, 2]]],
    ['holdout4-f-zh-en-ja-controller-manual-long', [[7, 8], [8, 8]]],
  ] as const) {
    const d = await holdoutText(id);
    for (const [o, n] of pairs) assert.deepEqual(list(formats(await onPair(d, o, n))), '', `${id} ${o}:${n}`);
  }
});

test('a strike through a CJK word that moved is still found', { skip }, async () => {
  const r = await fixture('cjk5-before.pdf', 'cjk5-after.pdf');
  const v = visual(r);
  assert.equal(v.length, 1, list(v));
  assert.equal(v[0].format?.decoration?.line, 'strike');
  assert.equal(v[0].format?.decoration?.added, true);
  // 重 has a stroke of its own where the line runs, so it cannot be told
  // struck; the characters after it can.
  assert.ok(v[0].new.text.endsWith('大故障'), v[0].new.text);
});

test('small katakana in a moved table row and red figures that moved under a header rule keep their weight and colour (round 4)', { skip }, async () => {
  // A table rule 1–2 pt from the glyphs fell inside the measured box in one
  // version only.
  const cm = await holdoutText('holdout4-f-zh-en-ja-controller-manual-long');
  for (const [o, n] of [
    [4, 4],
    [7, 7],
    [21, 21],
  ])
    assert.deepEqual(list(formats(await onPair(cm, o, n))), '', `${o}:${n}`);
  const budget = await holdoutText('holdout4-e-xlsx-facilities-budget');
  assert.deepEqual(list(formats(await onPair(budget, 2, 2))), '');
});

test('words that a removed watermark covered are not colour changes; a word elsewhere that turned red is', { skip }, async () => {
  const r = await fixture('mark5-before.pdf', 'mark5-after.pdf');
  assert.deepEqual(r.changes.map((c) => describeChange('en', c)).sort(), ['Deleted “DRAFT”', 'Text colour or weight changed']);
  assert.equal(formats(r.changes)[0].new.text, 'Thank');
  // Round 4: the 18 % grey DRAFT stamped over both pages of a letter.
  const d = await holdoutText('holdout4-g-draft-watermark');
  for (const p of [1, 2]) assert.deepEqual(list(formats(await onPair(d, p, p))), '', `p. ${p}`);
});

test('a highlight and a recoloured deletion that wrap are one change each; a change bar goes with its insertion', { skip }, async () => {
  const r = await fixture('bar5-before.pdf', 'bar5-after.pdf');
  const v = visual(r);
  assert.equal(graphics(v).length, 0, list(v));
  const fmt = formats(v);
  assert.equal(fmt.length, 2, list(v));
  for (const c of fmt) assert.equal(c.new.rects.length, 2, JSON.stringify(c.new.rects));
  assert.ok(fmt.some((c) => c.new.text.startsWith('Where the schedule') && c.new.text.endsWith('owner of the record')), fmt.map((c) => c.new.text).join(' | '));
  assert.ok(fmt.some((c) => c.new.text.startsWith('4.3 Paper records') && c.new.text.endsWith('legible')), fmt.map((c) => c.new.text).join(' | '));
  // The bar left of the inserted sentence is part of the insertion.
  const ins = r.changes.find((c) => c.kind === 'insert');
  assert.ok(ins && ins.new.rects.some((x) => x.rect.w <= 8 && x.rect.x + x.rect.w < 50), JSON.stringify(ins?.new.rects));
  // Round 4 (Word via LibreOffice): the change bars of the tracked insertion
  // and of the tracked deletion shown struck through in blue; the list
  // numbers shown as tracked changes ("[4.3]", "4.3[4.4]") are consequences
  // of the renumbering, so their colour is not a change of its own.
  const red = await holdoutText('holdout4-e-docx-retention-redline');
  const p1 = await onPair(red, 1, 1);
  assert.deepEqual(list(graphics(p1)), '');
  assert.equal(formats(p1).length, 1, list(p1));
  assert.ok(formats(p1)[0].new.text.startsWith('Paper records'), formats(p1)[0].new.text);
  assert.ok(formats(p1)[0].new.rects.some((x) => x.rect.w <= 8 && x.rect.x < 62), JSON.stringify(formats(p1)[0].new.rects));
});

test('a page turned by /Rotate is one page change, without a graphic change or overflow of its own (round 4)', { skip }, async () => {
  const r = await holdout('holdout4-g-crop-rotate');
  const p2 = r.changes.filter((c) => c.category === 'visual' && (c.new.pages.includes(1) || c.old.pages.includes(1)));
  assert.deepEqual(list(p2), 'Page size changed: 595 × 842 pt → 842 × 595 pt');
  // The cropped page 4 is still compared and reported; the table rules cut
  // off with the text go with the overflow item.
  const p4 = r.changes.filter((c) => c.category === 'visual' && (c.new.pages.includes(3) || c.old.pages.includes(3)));
  assert.deepEqual(list(p4).split(' | ').sort(), ['Content is cut off at the right edge of the page', 'Page size changed: 595 × 842 pt → 555 × 842 pt']);
});
