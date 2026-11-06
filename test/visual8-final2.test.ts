// Visual stage, fix round 8, the last pass: what the independent verifier
// of the final engine found (ids V-V1… of its round-9 problems). Fixtures
// test/fixtures/probe8-V-V*-*.pdf are SYNTHETIC (reportlab, from the
// verifier's generators or the fixer's).
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

test('V-V3: a sloped strike followed within a point by a mark of another colour or course is listed', { skip }, async () => {
  // SYNTHETIC (reportlab): a black 0.8 pt strike rising 1.5 pt over
  // "agrees", and a 40 pt line drawn 1 pt after its end. Before: the strike
  // was taken for the line's stroke (a stroke followed out of the word into
  // a graphic that changed), and only the line was listed.
  for (const [after, what] of [
    ['probe8-V-V3-red-level.pdf', 'a red level line'],
    ['probe8-V-V3-black-level.pdf', 'a black level line'],
    ['probe8-V-V3-red-slope.pdf', 'a red line rising as the strike does'],
  ]) {
    const r = await run('probe8-V-V3-before.pdf', after);
    assert.deepEqual(list(r.changes).sort(), ['Graphic or image added', 'Struck through: “agrees”'], what);
  }
  // Control: a stamp's border drawn across words, in one colour and on one
  // course into the stamp, is still no line (R7-V01).
  const stamp = await run('probe8-R7-V01-before.pdf', 'probe8-R7-V01-after.pdf');
  assert.deepEqual(lines(stamp), []);
});
