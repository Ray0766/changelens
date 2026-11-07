// Visual stage, fix round 9, fifth pass: what the second verifier of the
// fourth pass still found.
// - A small page graphic recoloured under a new or removed highlight across
//   a long row (a status dot turned from red to green or orange in a
//   highlighted table row) was hidden on both sides: its pixels, which the
//   highlight's multiply model rejects, were under 3 % of the row's. A
//   block of 2 × 2 pt of pixels lighter than the other version's, which no
//   highlight draws, now keeps the region listed whatever its share.
// - A dash in pale orange, yellow or pink 2.5–4 pt below the rule that
//   closes a table fragment at a moved page break, or a light grey tick
//   across it over a tinted last row, was folded with the rule: such marks
//   take little of the paper's luminance, which is what was measured.
//   Beside a black or grey rule, what a pixel gains in the channel it
//   darkens most now counts as well.
// - A hand strike rising across a short figure that overshoots it by
//   13–18 pt over the next word was taken for a turned stamp's border and
//   dropped with no item and no count, at the word's box or at a box
//   placed beside it. Only a slanted line that goes on so 3.5–30 pt past
//   the word, as every stamp border in the probes does, is dropped; one
//   that goes on 10–30 pt is weighed as a fainter line (counted where it
//   is not listed), at either placement.
// - A grey strike through a bold heading in Office's light green #92d050
//   was silent, with no item and no count: the glyphs' lowest channel (80)
//   was above the bound under which they are looked at by luminance.
// Fixtures test/fixtures/probe9-V3-fifth-SYNTHETIC-*.pdf are SYNTHETIC:
// fpdf2 2.9, PyMuPDF 2.1 and pypdf 6 (test/fixtures/gen9/v3-markup-fifth-*.py);
// probe9-V1-fifth-SYNTHETIC-*.pdf: reportlab 5.0, Typst 0.15 and PyMuPDF 2.1
// (v1-closing-rules-fifth-*.py); probe9-V2-fifth-SYNTHETIC-stm-*.pdf and -tint*.pdf:
// reportlab 5.0 (v2-steep-fifth.py, v2-tinted-fifth-*.py).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openPdf } from '../src/node/pdf.ts';
import { renderPage, canRender } from '../src/node/render.ts';
import { extractText } from '../src/pdf/extract.ts';
import { buildDocModel } from '../src/core/tokenize.ts';
import { compareDocs } from '../src/core/compare.ts';
import { addVisualChanges } from '../src/core/pipeline.ts';
import { describeChange } from '../src/core/describe.ts';
import type { Change, CompareResult } from '../src/core/types.ts';

const fixtures = new URL('./fixtures/', import.meta.url).pathname;
const skip = !(await canRender()) && 'no canvas';

async function run(before: string, after: string): Promise<CompareResult> {
  const pa = await openPdf(fixtures + before);
  const pb = await openPdf(fixtures + after);
  const r = compareDocs(buildDocModel(await extractText(pa, 'old')), buildDocModel(await extractText(pb, 'new')));
  await addVisualChanges(r, (p) => renderPage(pa, p, 1.5), (p) => renderPage(pb, p, 1.5));
  return r;
}
const list = (cs: Change[]) => cs.map((c) => describeChange('en', c));
const lines = (r: CompareResult) => list(r.changes.filter((c) => c.format?.decoration));
const counted = (r: CompareResult) => (r.coverage?.new.partlyCompared ?? []).reduce((n, u) => n + u.count, 0);
/** Whether a rect of `side` of the change takes in the point (x, y) on page 1. */
const at = (c: Change, side: 'old' | 'new', x: number, y: number) => c[side].rects.some((q) => q.page === 0 && q.rect.x <= x && q.rect.x + q.rect.w >= x && q.rect.y <= y && q.rect.y + q.rect.h >= y);

test('visual9 fifth pass: a status dot recoloured under a highlight across its whole row is listed', { skip }, async () => {
  // Before: only the highlight item (the dot's 82 pixels were under 3 % of
  // the row's), on both sides. The dot lies at (202, 136) on both pages.
  const H = 'probe9-V3-fifth-SYNTHETIC-';
  const HL = 'Highlighted (annotation): “Dock B lighting Checked by L. B…”';
  for (const after of ['hl-dot-green-Y40', 'hl-dot-orange-Y', 'hl-dot-orange-PP']) {
    const r = await run(H + 'hl-base.pdf', H + after + '.pdf');
    assert.deepEqual(list(r.changes), ['Graphic or image changed', HL], after);
    assert.ok(at(r.changes[0], 'old', 202, 136) && at(r.changes[0], 'new', 202, 136), after);
  }
  // The highlight removed, the dot back to red.
  const rev = await run(H + 'hl-dot-orange-Y.pdf', H + 'hl-base.pdf');
  assert.deepEqual(list(rev.changes), ['Graphic or image changed', HL.replace('Highlighted', 'Highlight removed')]);
  // A 12 pt dot under a highlight over a 372 pt row.
  const big = await run(H + 'hs-r6.0-base.pdf', H + 'hs-r6.0-green-row.pdf');
  assert.deepEqual(list(big.changes), ['Graphic or image changed', HL]);
  // Controls: the same highlights over the unchanged dots give the highlight only.
  assert.deepEqual(list((await run(H + 'hl-base.pdf', H + 'hl-base-Y40.pdf')).changes), [HL, 'Highlighted (annotation): “Fire doors east Two closers to …”']);
  assert.deepEqual(list((await run(H + 'hs-r6.0-base.pdf', H + 'hs-r6.0-base-row.pdf')).changes), [HL]);
});

test('visual9 fifth pass: a pale dash or a light grey tick by a folded closing rule is listed', { skip }, async () => {
  // Before: only the inserted words; the mark was counted with the rule as
  // a rule closing a table. The rules closing the first fragment lie at
  // y 749.27 (reportlab) and 757.16 (Typst) on page 1 of the old version.
  const F = 'probe9-V1-fifth-SYNTHETIC-';
  for (const [m, y] of [
    ['rl-zw-pale-dash25', 751.77],
    ['rl-zw-lgrey-tick3', 749.27],
  ] as const) {
    const r = await run(F + m + '.pdf', F + 'rl-zw-after.pdf');
    assert.deepEqual(list(r.changes), ['Added 39 words', 'Graphic or image removed'], m);
    assert.equal(r.ignored.closingRules, 1, m);
    assert.ok(at(r.changes[1], 'old', 310, y), `${m}: ${JSON.stringify(r.changes[1].old.rects)}`);
  }
  const yellow = await run(F + 'ty-yellow-25.pdf', 'probe9-V1-closing-rules-after.pdf');
  assert.deepEqual(list(yellow.changes), ['Added 49 words', 'Graphic or image removed']);
  assert.ok(at(yellow.changes[1], 'old', 310, 759.66), JSON.stringify(yellow.changes[1].old.rects));
  // Controls: the rules alone still fold, on the tinted rows and on the Typst table.
  const plain = await run(F + 'rl-zw-before.pdf', F + 'rl-zw-after.pdf');
  assert.deepEqual(list(plain.changes), ['Added 39 words']);
  assert.equal(plain.ignored.closingRules, 2);
  const ty = await run('probe9-V1-closing-rules-before.pdf', 'probe9-V1-closing-rules-after.pdf');
  assert.deepEqual(list(ty.changes), ['Added 49 words']);
});

test('visual9 fifth pass: a hand strike that overshoots a short figure by 13–18 pt over the next word is counted', { skip }, async () => {
  // Straight strikes rising 3 pt over "30", "12", "48" and "18", running on
  // 16 or 18 pt to the right, or 13 pt to the left. Before: r16 counted
  // "18" only, r18 nothing, l13 listed "12" and "48" and counted "18".
  const S = 'probe9-V2-fifth-SYNTHETIC-stm-';
  for (const after of ['r16', 'r18']) {
    const r = await run(S + 'before.pdf', S + after + '.pdf');
    assert.deepEqual(list(r.changes), [], after);
    assert.equal(counted(r), 4, after);
  }
  const left = await run(S + 'before.pdf', S + 'l13.pdf');
  assert.deepEqual(lines(left), ['Struck through: “12”', 'Struck through: “48”']);
  assert.equal(counted(left), 2);
  // Control: the border of a stamp turned by 18° goes on past the figures
  // it crosses: still no line, and the same three words counted.
  const stamp = await run('probe9-V2-refix-stamp-SYNTHETIC-before.pdf', 'probe9-V2-refix-stamp-SYNTHETIC-n25.pdf');
  assert.deepEqual(lines(stamp), []);
  assert.equal(counted(stamp), 3);
});

test('visual9 fifth pass: a grey strike through a heading in light green #92d050 is listed', { skip }, async () => {
  // Before: "Passed" neither listed nor counted, also after a 0.4 pt re-flow.
  const T = 'probe9-V2-fifth-SYNTHETIC-';
  const grey = await run(T + 'tint2-before.pdf', T + 'tint2-grey.pdf');
  assert.deepEqual(lines(grey), ['Struck through: “Passed”', 'Struck through: “Shipped”', 'Struck through: “Pending”', 'Struck through: “Delayed”']);
  const moved = await run(T + 'tint-before.pdf', T + 'tint-shift04-strike.pdf');
  assert.deepEqual(list(moved.changes), ['Struck through: “Passed”']);
  // Controls: black 0.4 pt strikes on the same headings are found as before
  // (on "Passed" as a colour change, as at base), and the 0.4 pt re-flow
  // alone gives nothing.
  const black = await run(T + 'tint2-before.pdf', T + 'tint2-k04.pdf');
  assert.deepEqual(list(black.changes), ['Text colour or weight changed', 'Struck through: “Shipped”', 'Struck through: “Pending”', 'Text colour or weight changed', 'Text colour or weight changed', 'Struck through: “Delayed”']);
  const shift = await run(T + 'tint-before.pdf', T + 'tint-shift04.pdf');
  assert.deepEqual(list(shift.changes), []);
  assert.equal(counted(shift), 0);
});
