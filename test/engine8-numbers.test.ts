// Number tokens (fix round 8): figures keep their relative change and sign
// check unless they name something. The PDFs are review-round-7 probes
// (synthetic; Chromium and reportlab), copied to test/fixtures/probe8-*.
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
const text = (a: string[], b: string[]) => listed(compareDocs(model(makeDoc('a', [[a]])), model(makeDoc('b', [[b]]))));

test('R7-01: a unit "no." or "per page" before an amount is not a cross-reference', async () => {
  // Bill of quantities ("48 no. 18,400.00") and a rate card ("per page 0.12"); the
  // rows with "m", "per sheet" and "each" are the controls.
  const r = await run('R7-01-before', 'R7-01-after');
  assert.deepEqual(listed(r), [
    'Number changed: 4,200.00 → 4,830.00 (+15%)',
    'Number changed: 18,400.00 → 21,150.00 (+15%)',
    'Number changed: 1,250.00 → -1,250.00 (sign changed)',
    'Number changed: 2,100.00 → -2,100.00 (sign changed)',
    'Number changed: 0.12 → 0.15 (+25%)',
    'Number changed: 0.20 → 0.25 (+25%)',
    'Number changed: 2.50 → 2.75 (+10%)',
    'Number changed: 15.00 → 17.50 (+17%)',
  ]);
  // A UK bill of quantities: the rate follows the unit "nr".
  const boq = await run('R7-01-boq-before', 'R7-01-boq-after');
  assert.ok(listed(boq).includes('Number changed: 383.33 → 440.62 (+15%)'), JSON.stringify(listed(boq)));
  assert.ok(listed(boq).includes('Number changed: 0.12 → 0.15 (+25%)'), JSON.stringify(listed(boq)));
});

test('R7-01 control: cross-references keep no percentage, also after "as per" or a schedule number', () => {
  assert.deepEqual(text(['The fee is due under clause 4.4 of this agreement.'], ['The fee is due under clause 4.5 of this agreement.']), ['Number changed: 4.4 → 4.5']);
  assert.deepEqual(text(['Payment is made as per clause 3.2 below.'], ['Payment is made as per clause 3.3 below.']), ['Number changed: 3.2 → 3.3']);
  assert.deepEqual(text(['The limits are set out in Schedule 2 page 4 of the policy.'], ['The limits are set out in Schedule 2 page 5 of the policy.']), ['Number changed: 4 → 5']);
  assert.deepEqual(text(['See No. 12 in the register.'], ['See No. 14 in the register.']), ['Number changed: 12 → 14']);
});
