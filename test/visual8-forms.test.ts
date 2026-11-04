// Form fields, visual stage (fix round 8). Fixtures test/fixtures/probe8-R3-*
// are copies of SYNTHETIC review-round-7 probes (reportlab AcroForms filled
// and flattened by pypdf).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openPdf } from '../src/node/pdf.ts';
import { renderPage, canRender } from '../src/node/render.ts';
import { extractText } from '../src/pdf/extract.ts';
import { buildDocModel } from '../src/core/tokenize.ts';
import { compareDocs } from '../src/core/compare.ts';
import { addVisualChanges } from '../src/core/pipeline.ts';
import { describeChange } from '../src/core/describe.ts';
import type { CompareResult } from '../src/core/types.ts';

const fixtures = new URL('./fixtures/', import.meta.url).pathname;
const skip = !(await canRender()) && 'no canvas';

async function run(before: string, after: string): Promise<CompareResult> {
  const pa = await openPdf(`${fixtures}probe8-${before}.pdf`);
  const pb = await openPdf(`${fixtures}probe8-${after}.pdf`);
  const r = compareDocs(buildDocModel(await extractText(pa, 'old')), buildDocModel(await extractText(pb, 'new')));
  await addVisualChanges(r, (p) => renderPage(pa, p, 1.5), (p) => renderPage(pb, p, 1.5));
  return r;
}
const listed = (r: CompareResult) => r.changes.map((c) => describeChange('en', c));

test('R3-02: a field value has the glyph box of the same text burned into the page (no underline or colour noise)', { skip }, async () => {
  // The two renders are alike pixel for pixel; the field boxes (estimated
  // from the font size) once differed from the flattened text's boxes by a
  // point, and "Underlined: “J”" and "Underlined: “8”" were listed.
  let r = await run('R3-02-filled', 'R3-02-flat');
  assert.deepEqual(listed(r), []);
  r = await run('R3-02-filled', 'R3-02-flat-edit');
  assert.deepEqual(listed(r), ['Number changed: 8 → 18 (+125%)']);
});
