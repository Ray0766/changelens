import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareDocs } from '../src/core/compare.ts';
import { describeChange } from '../src/core/describe.ts';
import { makeDoc, model } from './helpers.ts';

const P = (n: number) => [`Paragraph ${n} talks about topic number ${n} in some detail,`, `with a second line that mentions item ${n}-${n * 3} and more.`];
const footer = (p: number, n: number) => `Page ${p} of ${n}`;

test('identical documents produce no changes', () => {
  const pages = [[P(1), P(2)], [P(3)]];
  const r = compareDocs(model(makeDoc('a', pages, { footer })), model(makeDoc('b', pages, { footer })));
  assert.equal(r.changes.length, 0);
  assert.equal(r.stats.similarity, 1);
});

test('re-pagination alone is not a change', () => {
  const a = makeDoc('a', [[P(1), P(2), P(3)], [P(4), P(5)]], { footer });
  const b = makeDoc('b', [[P(1), P(2)], [P(3), P(4)], [P(5)]], { footer });
  const r = compareDocs(model(a), model(b));
  assert.equal(r.changes.length, 0, r.changes.map((c) => describeChange('en', c)).join('\n'));
  assert.deepEqual(r.oldToNew, [0, 1]);
  // New page 2 holds equal parts of old pages 1 and 2.
  assert.equal(r.newToOld[0], 0);
  assert.equal(r.newToOld[2], 1);
});

test('an inserted paragraph that shifts later pages yields exactly one change', () => {
  const a = makeDoc('a', [[P(1), P(2)], [P(3), P(4)], [P(5)]], { footer });
  const b = makeDoc('b', [[P(1), ['A brand new paragraph that was not here before at all.'], P(2)], [P(3)], [P(4), P(5)]], { footer });
  const r = compareDocs(model(a), model(b));
  assert.equal(r.changes.length, 1);
  assert.equal(r.changes[0].kind, 'insert');
  assert.equal(r.changes[0].wholeParagraphs, 1);
  assert.equal(describeChange('en', r.changes[0]), 'Added a paragraph');
  assert.equal(describeChange('zh', r.changes[0]), '新增一段');
});

test('a changed price is reported as a number change with location', () => {
  const a = makeDoc('a', [[P(1)], [['Design and prototyping costs 8,000 USD in total.']]]);
  const b = makeDoc('b', [[P(1)], [['Design and prototyping costs 9,500 USD in total.']]]);
  const r = compareDocs(model(a), model(b));
  assert.equal(r.changes.length, 1);
  const c = r.changes[0];
  assert.equal(c.kind, 'replace');
  assert.deepEqual(c.numeric, { from: '8,000', to: '9,500', fromValue: 8000, toValue: 9500 });
  assert.deepEqual(c.old.pages, [1]);
  assert.equal(describeChange('en', c), 'Number changed: 8,000 → 9,500 (+19%)');
  assert.ok(c.old.rects[0].rect.x > 56);
});

test('a deleted paragraph is described as such, with a caret on the new side', () => {
  const a = makeDoc('a', [[P(1), ['Late payment. Invoices that remain unpaid incur interest.'], P(2)]]);
  const b = makeDoc('b', [[P(1), P(2)]]);
  const r = compareDocs(model(a), model(b));
  assert.equal(r.changes.length, 1);
  assert.equal(r.changes[0].kind, 'delete');
  assert.equal(describeChange('en', r.changes[0]), 'Deleted a paragraph');
  assert.ok(r.changes[0].new.caret);
});

test('a moved paragraph is reported once as a move', () => {
  const a = makeDoc('a', [[P(1), P(2), P(3), P(4)]]);
  const b = makeDoc('b', [[P(1), P(3), P(4), P(2)]]);
  const r = compareDocs(model(a), model(b));
  assert.equal(r.changes.length, 1, r.changes.map((c) => c.kind).join());
  assert.equal(r.changes[0].kind, 'move');
});

test('headers and footers can be included on request', () => {
  const a = makeDoc('a', [[P(1)], [P(2)]], { footer });
  const b = makeDoc('b', [[P(1)], [P(2)], [P(3)]], { footer });
  const ignoring = compareDocs(model(a), model(b));
  assert.equal(ignoring.changes.length, 1);
  const including = compareDocs(model(a), model(b), { ignoreFurniture: false });
  assert.ok(including.changes.length > 1);
});

test('case can be ignored', () => {
  const a = makeDoc('a', [[['The Quick brown fox.']]]);
  const b = makeDoc('b', [[['The quick brown fox.']]]);
  assert.equal(compareDocs(model(a), model(b)).changes.length, 1);
  assert.equal(compareDocs(model(a), model(b), { ignoreCase: true }).changes.length, 0);
});

test('bold-only changes are reported as formatting', () => {
  const a = makeDoc('a', [[['Either party may cancel with 30 days notice.']]]);
  const b = makeDoc('b', [[['Either party may cancel with 30 days notice.']]], { font: 'Body-Bold' });
  const r = compareDocs(model(a), model(b));
  assert.equal(r.changes.length, 1);
  assert.equal(r.changes[0].kind, 'format');
  assert.ok(r.changes[0].format?.boldAdded);
  assert.equal(compareDocs(model(a), model(b), { detectFormatting: false }).changes.length, 0);
});

test('text pushed past the page edge is reported as overflow', () => {
  const a = makeDoc('a', [[['Role  Rate']]]);
  const b = makeDoc('b', [[['Role  Rate']]]);
  b.pages[0].runs.push({ str: 'Weekend rate', x: 560, y: 120, w: 60, h: 12, baseline: 130, fontSize: 11, font: 'Body-Regular', family: 'sans-serif', eol: true, angle: 0 });
  const r = compareDocs(model(a), model(b));
  const o = r.changes.find((c) => c.kind === 'overflow');
  assert.ok(o);
  assert.equal(o.overflow?.edge, 'right');
});

test('a sign change is a number change, described as such', () => {
  const a = makeDoc('a', [[['Adjustment for unused visits: 500 USD this year.']]]);
  const b = makeDoc('b', [[['Adjustment for unused visits: −500 USD this year.']]]);
  const r = compareDocs(model(a), model(b));
  assert.equal(r.changes.length, 1);
  assert.ok(r.changes[0].numeric);
  assert.equal(describeChange('en', r.changes[0]), 'Number changed: 500 → −500 (sign changed)');
});

test('ignored header/footer differences are counted, not hidden silently', () => {
  const a = makeDoc('a', [[P(1)], [P(2)]], { footer });
  const b = makeDoc('b', [[P(1)], [P(2)], [P(3)]], { footer });
  const r = compareDocs(model(a), model(b));
  assert.ok(r.ignored.furniture > 0);
});

test('a page without text is reported as not covered', () => {
  const a = makeDoc('a', [[P(1)], [P(2)]]);
  const b = makeDoc('b', [[P(1)], []]);
  const r = compareDocs(model(a), model(b));
  assert.deepEqual(r.coverage.new.textless, [1]);
});

test('the same font change everywhere becomes one change', () => {
  const pages = [[P(1), P(2), P(3), P(4)]];
  const r = compareDocs(model(makeDoc('a', pages, { font: 'Serif-Regular' })), model(makeDoc('b', pages, { font: 'Sans-Regular' })));
  const fmt = r.changes.filter((c) => c.kind === 'format');
  assert.equal(fmt.length, 1);
  assert.equal(fmt[0].places, 4);
});

test('a minus in front of a currency sign belongs to the amount', () => {
  const a = makeDoc('a', [[['Loyalty discount −€62.40 applied to this invoice.']]]);
  const b = makeDoc('b', [[['Loyalty discount €62.40 applied to this invoice.']]]);
  const r = compareDocs(model(a), model(b));
  assert.equal(r.changes.length, 1);
  assert.equal(describeChange('en', r.changes[0]), 'Number changed: −€62.40 → €62.40 (sign changed)');
});

test('units written onto a number are part of the shown change', () => {
  const a = makeDoc('a', [[['The late fee is 4% of the amount due per month.']]]);
  const b = makeDoc('b', [[['The late fee is 8% of the amount due per month.']]]);
  const r = compareDocs(model(a), model(b));
  // A rate changes by percentage points, not by a relative percentage.
  assert.equal(describeChange('en', r.changes[0]), 'Number changed: 4% → 8% (+4 pp)');
});

test('the same replacement in many places is one change', () => {
  const para = (n: number) => [`Quillfield Ltd shall deliver item ${n} by the agreed date number ${n}.`];
  const a = makeDoc('a', [[para(1), para(2), para(3), para(4)]]);
  const b = makeDoc('b', [[para(1), para(2), para(3), para(4)].map((p) => p.map((l) => l.replace('Quillfield', 'Brackenridge')))]);
  const r = compareDocs(model(a), model(b));
  assert.equal(r.changes.length, 1);
  assert.equal(r.changes[0].places, 4);
  assert.equal(describeChange('en', r.changes[0]), 'Changed “Quillfield” → “Brackenridge” (in 4 places)');
});

test('list numbers that change because an item was inserted are a consequence, not edits', () => {
  const items = ['Isolate the power supply.', 'Check the gas detector.', 'Open the hatch.', 'Enter with a second person.', 'Record the entry time.'];
  const list = (xs: string[]) => [xs.map((x, k) => `${k + 1}. ${x}`)];
  const a = makeDoc('a', [list(items)]);
  const b = makeDoc('b', [list([...items.slice(0, 2), 'Ventilate the chamber for ten minutes.', ...items.slice(2)])]);
  const r = compareDocs(model(a), model(b));
  // Only the inserted step is listed; which label the diff gives to the
  // insertion can vary, so at least the following labels must be hidden.
  assert.deepEqual(r.changes.map((c) => c.kind), ['insert']);
  assert.ok(r.changes[0].new.text.includes('Ventilate the chamber'));
  assert.ok(r.ignored.renumbered >= 2);
  assert.ok(r.minor.every((c) => c.consequence === 'renumber'));
});
