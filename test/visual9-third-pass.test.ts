// Visual stage, fix round 9, third pass: what the re-verifiers found after
// the second pass (areas V1-closing-rules, V2-thin-light-lines and
// V3-markup-annotations).
// - A strike drawn by hand across a short word ("30", "12") rises as
//   steeply as the border of a turned stamp, and was dropped with no item
//   and no count. A slanted line is now no line of the word only where it
//   goes on past the word's box at the same slope, as a stamp's border does.
// - A graphic recoloured toward a highlight's colour under a new or removed
//   highlight annotation (a red status dot turned amber) was taken for the
//   highlight's tint and dropped on both sides. A highlight is drawn in
//   multiply blend: it explains only pixels that are the old ones times
//   its tint, never lighter ones.
// - Navy text under a new highlight in multiply blend at 50 %: the
//   see-through model told the glyphs apart, and the opaque path then
//   explained them by the tint. The see-through verdict now stands.
// Fixtures test/fixtures/probe9-V2-steep-SYNTHETIC-*.pdf and
// probe9-V3-markup-*.pdf are SYNTHETIC: fpdf2 2.9 and PyMuPDF 2.1
// (test/fixtures/gen9/v2-steep-strikes.py, v3-markup-refix.py and
// v3-markup-third.py).
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

test('visual9 third pass: a strike drawn by hand rising 3 pt across a two-digit number is listed', { skip }, async () => {
  // Before: "12" and "30" were neither listed nor counted (a slope of
  // 0.2–0.27 across a 7–11 pt word), while "minor" and "audited" were.
  const S = 'probe9-V2-steep-SYNTHETIC-';
  const ink = await run(S + 'before.pdf', S + 'ink30.pdf');
  assert.deepEqual(lines(ink), ['Struck through: “audited”', 'Struck through: “12”', 'Struck through: “minor”', 'Struck through: “30”']);
  const drawn = await run(S + 'before.pdf', S + 'rise30.pdf');
  assert.deepEqual(lines(drawn), ['Struck through: “12”', 'Struck through: “30”']);
  // Control: the border of a stamp turned by 18° that crosses the foot of
  // "253.86" goes on past the figure, and is still no underline of it.
  const stamp = await run('probe9-V2-refix-stamp-SYNTHETIC-before.pdf', 'probe9-V2-refix-stamp-SYNTHETIC-n25.pdf');
  assert.deepEqual(lines(stamp), []);
});

test('visual9 third pass: a dot recoloured toward a highlight’s yellow under a new or removed highlight is listed', { skip }, async () => {
  // Before: only the highlight item, on both sides.
  const M = 'probe9-V3-markup-';
  const HL = 'Highlighted (annotation): “Calibration records for two tor…”';
  for (const after of ['dot-amber-hl', 'dot-yellow-hl']) {
    const r = await run(M + 'dot-red.pdf', M + after + '.pdf');
    assert.deepEqual(list(r.changes), ['Graphic or image changed', HL], after);
    assert.ok(r.changes[0].old.rects.length > 0 && r.changes[0].new.rects.length > 0, after);
  }
  const removed = await run(M + 'dot-amber-hl.pdf', M + 'dot-red.pdf');
  assert.deepEqual(list(removed.changes), ['Graphic or image changed', 'Highlight removed (annotation): “Calibration records for two tor…”']);
  // Controls: the unchanged dot under the same highlight gives the
  // highlight only; recoloured red → green it stays listed.
  assert.deepEqual(list((await run(M + 'dot-red.pdf', M + 'dot-red-hl.pdf')).changes), [HL]);
  assert.deepEqual(list((await run(M + 'dot-red.pdf', M + 'dot-green-hl.pdf')).changes), ['Graphic or image changed', HL]);
});

test('visual9 third pass: text recoloured under a see-through highlight in multiply blend is listed', { skip }, async () => {
  // Before: only the highlight item.
  const M = 'probe9-V3-markup-';
  const HL = 'Highlighted (annotation): “Calibration records for two tor…”';
  assert.deepEqual(list((await run(M + 'before.pdf', M + 'navy-hl-m50.pdf')).changes), ['Text colour or weight changed', HL]);
  // Control: the same highlight over the black phrase.
  assert.deepEqual(list((await run(M + 'before.pdf', M + 'hl-m50.pdf')).changes), [HL]);
});
