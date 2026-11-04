// Form fields (fix round 8). The PDFs are review-round-7 probes (synthetic:
// reportlab AcroForms, values written by pypdf or reportlab), copied to
// test/fixtures/probe8-R3-*.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openPdf } from '../src/node/pdf.ts';
import { extractText } from '../src/pdf/extract.ts';
import { buildDocModel } from '../src/core/tokenize.ts';
import { compareDocs } from '../src/core/compare.ts';
import { describeChange } from '../src/core/describe.ts';
import type { CompareResult } from '../src/core/types.ts';

const fixtures = new URL('./fixtures/', import.meta.url).pathname;
async function run(before: string, after: string): Promise<CompareResult> {
  const a = buildDocModel(await extractText(await openPdf(`${fixtures}probe8-${before}.pdf`), 'before.pdf'));
  const b = buildDocModel(await extractText(await openPdf(`${fixtures}probe8-${after}.pdf`), 'after.pdf'));
  return compareDocs(a, b);
}
const listed = (r: CompareResult) => r.changes.map((c) => describeChange('en', c));
const pages = (r: CompareResult) => r.changes.map((c) => [c.old.rects.map((x) => x.page + 1), c.new.rects.map((x) => x.page + 1)]);

test('R3-01: a form field value in a running header or footer is compared, its label is not', async () => {
  // f06: "Policy number" in the header of both pages (one field, two widgets).
  let r = await run('R3-01-f06-before', 'R3-01-f06-after');
  assert.deepEqual(listed(r), [
    'Number changed: PN-0042-771 → PN-0042-717 (form field)',
    'Number changed: PN-0042-771 → PN-0042-717 (form field)',
    'Number changed: 1,840.00 → 1,480.00 (-20%) (form field)',
  ]);
  assert.deepEqual(pages(r), [[[1], [1]], [[2], [2]], [[2], [2]]]);
  // The printed header is unchanged: nothing else is counted as ignored.
  assert.equal(r.ignored.furniture, 0);
  // f18: tenant initials in the footer of each page (fields init1..3).
  r = await run('R3-01-f18-before', 'R3-01-f18-blank-p2');
  assert.deepEqual(listed(r), ['Deleted “K.A.” (form field)']);
  assert.deepEqual(r.changes[0].old.rects.map((x) => x.page), [1]);
  assert.equal(r.ignored.furniture, 0);
  r = await run('R3-01-f18-before', 'R3-01-f18-changed');
  assert.deepEqual(listed(r), ['Added “H.” (form field)', 'Added “H.” (form field)', 'Added “H.” (form field)']);
  assert.deepEqual(pages(r).map((p) => p[1]), [[1], [2], [3]]);
});

test('R3-01 control: a number printed in a running header is still ignored and counted', async () => {
  // The same agreement number printed as page text on every page (no fields).
  const r = await run('R3-01-printed-before', 'R3-01-printed-after');
  assert.deepEqual(listed(r), []);
  assert.equal(r.ignored.furniture, 3);
});
