// Visual stage, fix round 9, area V1-closing-rules (held-out round 5, cause
// 3): the rule that closes a table fragment at the foot of a page, at a page
// break that moved, was listed twice, as "Underline removed" (or
// "Underlined") on the fragment's last row and as "Graphic or image
// removed" (or added). It is now shown with the header row repeated at the
// next page top (consequence 'closingRule', counted in the same notice),
// when the other version has no line under that row and closes the same
// table further down with a rule of the same extent, weight and hue. A line
// item now also takes in the graphic region of its own line.
// Fixtures test/fixtures/probe9-V1-closing-rules-*.pdf are SYNTHETIC
// (Typst 0.15, as the round-5 case; lines drawn over with PyMuPDF), made by
// test/fixtures/gen9/v1-closing-rules.py. "before" starts the table at the
// foot of page 1 with its header and January, and goes on under a repeated
// header on page 2; "after" has a paragraph inserted above, which pushes the
// whole table onto page 2.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openPdf } from '../src/node/pdf.ts';
import { renderPage, canRender } from '../src/node/render.ts';
import { extractText } from '../src/pdf/extract.ts';
import { buildDocModel } from '../src/core/tokenize.ts';
import { compareDocs } from '../src/core/compare.ts';
import { addVisualChanges } from '../src/core/pipeline.ts';
import { describeChange } from '../src/core/describe.ts';
import { reportNotices } from '../src/core/report.ts';
import type { Change, CompareResult } from '../src/core/types.ts';

const fixtures = new URL('./fixtures/', import.meta.url).pathname;
const cases = new URL('../eval/cases/', import.meta.url).pathname;
const skip = !(await canRender()) && 'no canvas';

async function run(before: string, after: string): Promise<CompareResult> {
  const pa = await openPdf(before);
  const pb = await openPdf(after);
  const r = compareDocs(buildDocModel(await extractText(pa, 'old')), buildDocModel(await extractText(pb, 'new')));
  await addVisualChanges(r, (p) => renderPage(pa, p, 1.5), (p) => renderPage(pb, p, 1.5));
  return r;
}
const probe = (a: string, b: string) => run(fixtures + `probe9-V1-closing-rules-${a}.pdf`, fixtures + `probe9-V1-closing-rules-${b}.pdf`);
const list = (cs: Change[]) => cs.map((c) => describeChange('en', c));
const rules = (r: CompareResult) => r.minor.filter((c) => c.consequence === 'closingRule');
/** The change has a place on `page` (1-based) of `side` that takes in the point. */
const at = (c: Change, side: 'old' | 'new', page: number, x: number, y: number) =>
  c[side].rects.some((q) => q.page === page - 1 && x >= q.rect.x - 2 && x <= q.rect.x + q.rect.w + 2 && y >= q.rect.y - 2 && y <= q.rect.y + q.rect.h + 2);
// The rule that closes the fragment on page 1 of "before" (PyMuPDF: y 757.2, x 84.6–510.7).
const RULE_Y = 757.2;

test('V1-closing-rules: the rule closing a table fragment at a moved page break is shown with the repeated header row', { skip }, async () => {
  // Before: "Underline removed: “January 88.6 58.7 37.7 70.8 62.9”" and
  // "Graphic or image removed" (reversed: "Underlined" and "Graphic or image added").
  const r = await probe('before', 'after');
  assert.deepEqual(list(r.changes), ['Added 49 words']);
  assert.equal(r.ignored.repeatedLines, 1);
  assert.equal(r.ignored.closingRules, 1);
  const [c] = rules(r);
  assert.ok(c && at(c, 'old', 1, 300, RULE_Y) && !c.new.rects.length, JSON.stringify(c?.old.rects));
  assert.equal(describeChange('en', c), 'Table no longer closed at the page foot by a rule under “January 88.6 58.7 37.7 70.8 62.9” after the page break moved');
  assert.ok(describeChange('zh', c).includes('收尾线'));
  assert.ok(
    reportNotices('en', r).some((n) => n.action === 'minor' && n.text.startsWith('1 line repeated at the top of a page (such as a table’s header row), and 1 rule closing a table at the foot of the page before,')),
    JSON.stringify(reportNotices('en', r)),
  );
  // Shown on request, in the order of the pages.
  assert.deepEqual(
    r.minor.map((m) => m.consequence),
    ['closingRule', 'repeatedLine'],
  );

  const back = await probe('after', 'before');
  assert.deepEqual(list(back.changes), ['Deleted 49 words']);
  assert.equal(back.ignored.closingRules, 1);
  const [d] = rules(back);
  assert.ok(d && at(d, 'new', 1, 300, RULE_Y) && !d.old.rects.length, JSON.stringify(d?.new.rects));
  assert.ok(describeChange('en', d).startsWith('Table closed at the page foot by a rule under “January'));
});

test('V1-closing-rules: an underline put on the last row before the moved break stays listed, on its word only', { skip }, async () => {
  // Before: the underline was named only within the rule's item for the whole
  // row ("Underline removed: “January … 62.9”"), next to a graphic item.
  for (const [a, b, want] of [
    ['before-ul', 'after', ['Added 49 words', 'Underline removed: “62.9”']],
    ['after', 'before-ul', ['Deleted 49 words', 'Underlined: “62.9”']],
    // The underline in the version without the break, under the same row.
    ['before', 'after-ul', ['Added 49 words', 'Underlined: “62.9”']],
  ] as const) {
    const r = await probe(a, b);
    assert.deepEqual(list(r.changes), want, `${a} → ${b}`);
    assert.equal(r.ignored.closingRules, 1, `${a} → ${b}`);
  }
});

test('V1-closing-rules: a colour, a highlight or a strike put on the last row stays listed', { skip }, async () => {
  // Before the rule was folded, the recoloured or highlighted word was only
  // inside the rule's "Underline removed: “January … 62.9”" item, and the
  // strike was not found at all (the rule's rows, in one version only, read
  // as a change of the glyphs). Folding the rule must not drop them: the
  // rule is no graphic next to the words, and a line is looked for above it.
  for (const [b, want] of [
    ['before-red-text', 'Text colour or weight changed'],
    ['before-hl', 'Text colour or weight changed'],
    ['before-strike', 'Strikethrough removed: “62.9”'],
  ] as const) {
    const r = await probe(b, 'after');
    assert.deepEqual(list(r.changes), ['Added 49 words', want], b);
    assert.ok(at(r.changes[1], 'old', 1, 498, 751), `${b}: ${JSON.stringify(r.changes[1].old.rects)}`);
    assert.equal(r.ignored.closingRules, 1, b);
  }
});

test('V1-closing-rules: a number edited in the last row stays listed; the rule under it is still a consequence', { skip }, async () => {
  const r = await probe('before-num', 'after');
  assert.deepEqual(list(r.changes), ['Added 49 words', 'Number changed: 86.6 → 88.6 (+2.3%)']);
  assert.equal(r.ignored.closingRules, 1);
});

test('V1-closing-rules: a closing rule recoloured, thickened or doubled stays listed, as one item', { skip }, async () => {
  // The other version closes the table (at its end) with a black 0.9 pt
  // rule: one drawn red or 2.4 pt thick at the moved break is a change.
  // Before: an underline item and a graphic item for the one rule.
  for (const b of ['before-red', 'before-thick']) {
    const r = await probe(b, 'after');
    const all = list(r.changes);
    assert.deepEqual(all, ['Added 49 words', 'Underline removed: “January 88.6 58.7 37.7 70.8 62.9”'], b);
    assert.ok(at(r.changes[1], 'old', 1, 300, RULE_Y), `${b}: ${JSON.stringify(r.changes[1].old.rects)}`);
    assert.equal(r.ignored.closingRules ?? 0, 0, b);
  }
  // A second rule drawn 4.2 pt below the closing rule: listed at its place.
  const r = await probe('before-double', 'after');
  assert.deepEqual(list(r.changes), ['Added 49 words', 'Graphic or image removed']);
  assert.ok(at(r.changes[1], 'old', 1, 300, RULE_Y + 4.2), JSON.stringify(r.changes[1].old.rects));
});

test('V1-closing-rules: where the other version closes the table with no rule, the rule at the moved break stays listed', { skip }, async () => {
  // "after-noend-rule" draws the table without its end rule, and a
  // full-width 0.9 pt rule a paragraph's space below the next paragraph,
  // which looks like the rule at the foot of page 1 of "before" but closes
  // no row of the table.
  const r = await probe('before', 'after-noend-rule');
  const lines = r.changes.filter((c) => c.format?.decoration);
  assert.ok(
    lines.some((c) => at(c, 'old', 1, 300, RULE_Y)),
    list(r.changes).join(' | '),
  );
  assert.equal(r.ignored.closingRules ?? 0, 0);
});

test('V1-closing-rules: a rule added at a page foot where no break moved stays listed', { skip }, async () => {
  // "after-rule" draws a 0.9 pt rule at the foot of page 1, which has no
  // table in that version; the closing rule of "before" is still folded.
  const r = await probe('before', 'after-rule');
  assert.deepEqual(list(r.changes), ['Added 49 words', 'Graphic or image added']);
  assert.ok(at(r.changes[1], 'new', 1, 300, 765.4), JSON.stringify(r.changes[1].new.rects));
  assert.equal(r.ignored.closingRules, 1);
  // The closing rule recoloured where no page break moved.
  const same = await probe('before', 'before-red');
  assert.deepEqual(list(same.changes), ['Graphic or image changed']);
  assert.equal(same.ignored.closingRules ?? 0, 0);
});

test('V1-closing-rules: round 5 annual report, the five moved table breaks give no underline or graphic item', { skip }, async () => {
  // holdout5-h-annual-technical-report (SYNTHETIC, Typst 0.15). Before: items
  // 2–11 of 21, an underline and a graphic item at each of the five rules
  // (old p. 4, 8, 10; new p. 12, 16).
  const dir = cases + 'holdout5-h-annual-technical-report/';
  const r = await run(dir + 'before.pdf', dir + 'after.pdf');
  const lines = r.changes.filter((c) => c.format?.decoration);
  assert.deepEqual(list(lines), []);
  // The rules at y 754.4, 726.3, 762.4 (old) and 762.4, 718.1 (new) are no
  // graphic item. (The footnote separator at y 732 on new p. 16, which the
  // regions took in with the rule there, is not looked at here.)
  const graphics = r.changes.filter((c) => c.kind === 'graphic' && !c.format && !c.pageChange);
  const places: [side: 'old' | 'new', page: number, y: number][] = [
    ['old', 4, 754.4],
    ['old', 8, 726.3],
    ['old', 10, 762.4],
    ['new', 12, 762.4],
    ['new', 16, 718.1],
  ];
  for (const [side, page, y] of places) assert.ok(!graphics.some((c) => at(c, side, page, 300, y)), `${side} p. ${page}: ${list(graphics).join(' | ')}`);
  assert.equal(r.ignored.repeatedLines, 5);
  assert.equal(r.ignored.closingRules, 5);
  const shown = rules(r);
  for (const [side, page, y] of places) assert.ok(shown.some((c) => at(c, side, page, 300, y)), `${side} p. ${page}`);
});
