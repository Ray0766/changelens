// Visual stage, fix round 8: a line or a colour put on the words of a
// running header (review round 7, finding R5-07). Header and footer words
// are left out of the text comparison by default, and their glyphs are
// masked in the pixel comparison, so a strike through "Confidential" or a
// highlight on "Revision" gave "No differences found" with nothing
// counted. Such a difference is now counted with the other header and
// footer differences, which are shown on request. Fixtures
// test/fixtures/probe8-R5-07-*.pdf are copies of the SYNTHETIC probe and
// verifier PDFs of round 7 (reportlab; python-docx → LibreOffice Writer).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openPdf } from '../src/node/pdf.ts';
import { renderPage, canRender } from '../src/node/render.ts';
import { extractText } from '../src/pdf/extract.ts';
import { buildDocModel } from '../src/core/tokenize.ts';
import { compareDocs } from '../src/core/compare.ts';
import { addVisualChanges } from '../src/core/pipeline.ts';
import { describeChange, notices } from '../src/core/describe.ts';
import type { CompareResult } from '../src/core/types.ts';

const fixtures = new URL('./fixtures/', import.meta.url).pathname;
const skip = !(await canRender()) && 'no canvas';

async function run(before: string, after: string, opts: { ignoreFurniture?: boolean } = {}): Promise<CompareResult> {
  const pa = await openPdf(fixtures + before);
  const pb = await openPdf(fixtures + after);
  const r = compareDocs(buildDocModel(await extractText(pa, 'old')), buildDocModel(await extractText(pb, 'new')), opts);
  await addVisualChanges(r, (p) => renderPage(pa, p, 1.5), (p) => renderPage(pb, p, 1.5));
  return r;
}

test('R5-07: a strike or a highlight on running-header words is counted with the ignored header and footer differences', { skip }, async () => {
  // "Service contract SC-2207 … Revision B - Confidential" on every page;
  // on p. 2 "Confidential" is struck in red, or "Revision" highlighted.
  // The red line starts halfway through the "B": one strike over "B
  // Confidential" since fix round 8 (before, the "B" was a colour change
  // of its own).
  for (const [file, n] of [
    ['probe8-R5-07-strike.pdf', 1],
    ['probe8-R5-07-highlight.pdf', 1],
  ] as const) {
    const r = await run('probe8-R5-07-before.pdf', file);
    assert.deepEqual(r.changes.map((c) => describeChange('en', c)), [], file);
    assert.equal(r.ignored.furniture, n, file);
    assert.ok(notices('en', r).some((x) => x.action === 'furniture'), file);
    // Shown on request: compared with the headers included, as before.
    const all = await run('probe8-R5-07-before.pdf', file, { ignoreFurniture: false });
    assert.equal(all.changes.filter((c) => c.format?.appearanceChanged).length, n, file);
    assert.equal(all.ignored.furniture, 0, file);
  }
  // A real page header in LibreOffice Writer, "Restricted" struck on all 3 pages.
  const w = await run('probe8-R5-07-writer-before.pdf', 'probe8-R5-07-writer-strike.pdf');
  assert.deepEqual(w.changes, []);
  assert.equal(w.ignored.furniture, 3);
  // Control: the same strike on a body line is listed, nothing is counted.
  const c = await run('probe8-R5-07-before.pdf', 'probe8-R5-07-strike-body.pdf');
  assert.deepEqual(c.changes.map((x) => describeChange('en', x)), ['Struck through: “priority class”']);
  assert.equal(c.ignored.furniture, 0);
});
