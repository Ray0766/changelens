// Visual stage, fix round 9, third pass: what the re-verifiers found after
// the second pass (areas V1-closing-rules, V2-thin-light-lines and
// V3-markup-annotations).
// - A strike drawn by hand across a short word ("30", "12") rises as
//   steeply as the border of a turned stamp, and was dropped with no item
//   and no count. A slanted line is now no line of the word only where it
//   goes on past the word's box at the same slope, as a stamp's border does.
// Fixtures test/fixtures/probe9-V2-steep-SYNTHETIC-*.pdf are SYNTHETIC:
// fpdf2 2.9 and PyMuPDF 2.1 (test/fixtures/gen9/v2-steep-strikes.py).
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
