// A passage drawn at another point of the content stream but at the same
// place on the page (fix round 8): with an edit inside it, only the edit is
// listed, not "Moved and edited a paragraph" with identical places. The PDFs
// are review-round-7 probes (synthetic; reportlab), copied to
// test/fixtures/probe8-R2-13-*.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openPdf } from '../src/node/pdf.ts';
import { extractText } from '../src/pdf/extract.ts';
import { buildDocModel } from '../src/core/tokenize.ts';
import { compareDocs } from '../src/core/compare.ts';
import { describeChange } from '../src/core/describe.ts';
import type { CompareResult } from '../src/core/types.ts';
import { makeDoc, model } from './helpers.ts';

const fixtures = new URL('./fixtures/', import.meta.url).pathname;
async function run(before: string, after: string): Promise<CompareResult> {
  const a = buildDocModel(await extractText(await openPdf(`${fixtures}probe8-${before}.pdf`), 'before.pdf'));
  const b = buildDocModel(await extractText(await openPdf(`${fixtures}probe8-${after}.pdf`), 'after.pdf'));
  return compareDocs(a, b);
}
const listed = (r: CompareResult) => r.changes.map((c) => describeChange('en', c));

test('R2-13: a footnote drawn first in the old stream and last in the new one, with a figure edited', async () => {
  assert.deepEqual(listed(await run('R2-13-before', 'R2-13-same')), []);
  const r = await run('R2-13-before', 'R2-13-edit');
  assert.deepEqual(listed(r), ['Number changed: 2,500 → 3,500 (+40%)']);
  assert.equal(r.changes[0].inMove, undefined);
  // A purchase-order address block drawn in another order, "Dock 4" → "Dock 7".
  assert.deepEqual(listed(await run('R2-13-po-before', 'R2-13-po-edit')), ['Number changed: 4 → 7 (+75%)']);
});

test('R2-13 control: a paragraph moved to another place with an edit is still a move', () => {
  const p = (k: number) => [`Paragraph ${k} keeps the delivery terms and the payment terms of order ${k} together.`];
  const moved = ['The supplier insures the goods until they are handed over at the delivery address 2,500.'];
  const a = model(makeDoc('a', [[moved, p(1), p(2), p(3)]]));
  const b = model(makeDoc('b', [[p(1), p(2), p(3), [moved[0].replace('2,500', '3,500')]]]));
  const r = compareDocs(a, b);
  assert.deepEqual(listed(r).sort(), ['Moved and edited a paragraph', 'Number changed: 2,500 → 3,500 (+40%)']);
});
