// Number tokens (fix round 8): figures keep their relative change and sign
// check unless they name something. The PDFs are review-round-7 probes
// (synthetic; Chromium and reportlab), copied to test/fixtures/probe8-*.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openPdf } from '../src/node/pdf.ts';
import { extractText } from '../src/pdf/extract.ts';
import { buildDocModel } from '../src/core/tokenize.ts';
import { compareDocs } from '../src/core/compare.ts';
import { describeChange, excerpt } from '../src/core/describe.ts';
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

test('T2N6: "as per page 4" and "as per item 3" are references, while "EUR 0.12 per page" is a rate', async () => {
  // Verifier counter-probe (synthetic; Chromium), copied to test/fixtures/probe8-T2N6-*.
  assert.deepEqual(listed(await run('T2N6-before', 'T2N6-after')), [
    'Number changed: 4 → 5',
    'Number changed: 3 → 4',
    'Number changed: 0.12 → 0.15 (+25%)',
    'Number changed: 4500 → 4501',
    'Number changed: A3 → A2',
  ]);
  assert.deepEqual(text(['Prices are as per page 4 of the offer.'], ['Prices are as per page 5 of the offer.']), ['Number changed: 4 → 5']);
  // Without "as", the unit rule still applies ("per page 0.12" in R7-01).
  assert.deepEqual(text(['Copies cost per page 0.12 in colour.'], ['Copies cost per page 0.15 in colour.']), ['Number changed: 0.12 → 0.15 (+25%)']);
});

test('R2-09: in a percentage range or ratio ("10%-20%", "10%/12%") the second figure keeps its sign and its own percent sign', async () => {
  const r = await run('R2-09-before', 'R2-09-after');
  const l = listed(r);
  for (const d of [
    'Number changed: 10% → 15% (+5 pp)',
    'Number changed: 20% → 25% (+5 pp)',
    'Number changed: 12% → 18% (+6 pp)',
    'Number changed: 3% → 5% (+2 pp)',
    'Number changed: 6% → 8% (+2 pp)',
  ])
    assert.ok(l.includes(d), `${d} in ${JSON.stringify(l)}`);
  assert.ok(!l.some((d) => d.includes('%-') || d.includes('%/')), JSON.stringify(l));
  // The range's dash is context, not part of either figure.
  const second = r.changes.find((c) => c.numeric?.from === '20%')!;
  assert.equal(excerpt(second).before, 'in the band 15%-');
});

test('T2N7: the sign of the second figure of a ratio ("+5%/-3%") stays with that figure', async () => {
  // Verifier counter-probe (synthetic; Chromium), copied to test/fixtures/probe8-T2N7-*: "+5%/-3%" → "+5%/-4%".
  const r = await run('T2N7-before', 'T2N7-after');
  const l = listed(r);
  assert.ok(l.includes('Number changed: -3% → -4% (-1 pp)'), l.join(' | '));
  assert.ok(!l.includes('Number changed: 3% → 4% (+1 pp)'), l.join(' | '));
  assert.equal(excerpt(r.changes.find((c) => c.numeric?.from === '-3%')!).before, '2026 list: +5%/');
  // The other shapes in the same probe keep their reading.
  for (const d of ['Number changed: −2% → −3% (-1 pp)', 'Number changed: S$1,200 → S$1,250 (+4.2%)', 'Number changed: -20°C → -25°C (+25%)'])
    assert.ok(l.includes(d), `${d} in ${l.join(' | ')}`);
  // A dash between two figures is still the range's, not a sign.
  assert.deepEqual(text(['The band is 10%-20% of the fee.'], ['The band is 10%-25% of the fee.']), ['Number changed: 20% → 25% (+5 pp)']);
});

test('R2-V01: an en-dash range of percentages is two number changes (Chromium, LibreOffice)', async () => {
  const r = await run('R2-V01-before', 'R2-V01-after');
  assert.deepEqual(listed(r), [
    'Number changed: 10% → 15% (+5 pp)',
    'Number changed: 20% → 25% (+5 pp)',
    'Number changed: 2% → 3% (+1 pp)',
    'Number changed: 4% → 5% (+1 pp)',
    'Number changed: 5–10 → 7–15',
  ]);
  const lo = await run('R2-V01-lo-before', 'R2-V01-lo-after');
  const l = listed(lo);
  assert.ok(l.includes('Number changed: 10% → 15% (+5 pp)') && l.includes('Number changed: 20% → 25% (+5 pp)'), JSON.stringify(l));
  // Control: ranges without a percent sign stay one number change without a value.
  assert.ok(l.includes('Number changed: 5-10 → 7-15') && l.includes('Number changed: 2027-2029 → 2028-2030'), JSON.stringify(l));
});

test('R2-11: a currency code written onto its sign ("HK$") and a degree scale ("°C") are part of the figure', async () => {
  const r = await run('R2-09-before', 'R2-09-after');
  const hk = r.changes.find((c) => c.numeric?.from.includes('12,000'))!;
  assert.equal(describeChange('en', hk), 'Number changed: HK$12,000 → HK$12,500 (+4.2%)');
  assert.equal(excerpt(hk).before, 'for the Hong Kong office is');
  const temp = r.changes.find((c) => c.numeric?.from.startsWith('25'))!;
  assert.equal(describeChange('en', temp), 'Number changed: 25°C → 30°C (+20%)');
  assert.equal(excerpt(temp).after, 'or below until they are tested');
  // A range of temperatures (LibreOffice).
  const lo = await run('R2-V01-lo-before', 'R2-V01-lo-after');
  assert.ok(listed(lo).includes('Number changed: 2-8°C → 4-10°C'), JSON.stringify(listed(lo)));
});

test('R2-10: the excerpt keeps the words just before a change, with the currency', async () => {
  const r = await run('R2-09-before', 'R2-09-after');
  const eur = r.changes.find((c) => c.numeric?.from === '12.500,00')!;
  assert.equal(excerpt(eur).before, '…sämtlicher Reisekosten beträgt EUR');
  const v = await run('R2-10-before', 'R2-10-after');
  assert.deepEqual(
    v.changes.map((c) => excerpt(c).before),
    ['…je Schadensereignis beträgt EUR', '…liability extension amount to USD'],
  );
});

test('R2-06: a changed total beside lines deleted from the same block is a number change and a deletion', async () => {
  // "Total payable 1,800.00" → "1,880.00"; the bank and payment lines after it, in the same block, deleted.
  const r = await run('R2-06-before', 'R2-06-after');
  assert.deepEqual(listed(r), ['Number changed: 1,800.00 → 1,880.00 (+4.4%)', 'Deleted 17 words']);
  assert.match(r.changes[1].old.text, /^Bank: Example Savings/);
  // The same lines left out by a higher bottom edge of the page box are cut off.
  const crop = await run('R2-07-bottom-before', 'R2-06-crop');
  assert.deepEqual(listed(crop), ['Number changed: 1,800.00 → 1,880.00 (+4.4%)', 'Content is cut off at the bottom of the page']);
  // Chromium: the total in a table row, the note in the next block element.
  const chr = await run('R2-06-chr-before', 'R2-06-chr-after');
  assert.deepEqual(listed(chr), ['Number changed: 1,800.00 → 1,880.00 (+4.4%)', 'Deleted 17 words']);
  assert.deepEqual(listed(await run('R2-06-chr-before', 'R2-06-chr-total')), ['Number changed: 1,800.00 → 1,880.00 (+4.4%)']);
  // A cap with words after it on the same line.
  const cap = await run('R2-06-cap-before', 'R2-06-cap-after');
  assert.deepEqual(listed(cap), ['Number changed: 2,500,000 → 3,000,000 (+20%)', 'Deleted “per claim and in aggregate”']);
});

test('R2-06 control: a figure replaced by words, or words by a figure, stays one change', () => {
  assert.deepEqual(text(['Payment is due within 30 days of delivery.'], ['Payment is due within four weeks of delivery.']), ['Changed “30 days” → “four weeks”']);
  assert.deepEqual(text(['The fee is 1,200 per year.'], ['The fee is 1,250 per year.']), ['Number changed: 1,200 → 1,250 (+4.2%)']);
});

test('T2N3: a figure replaced by words that start or end with another figure stays one change', async () => {
  // Verifier counter-probes (synthetic; Chromium and reportlab), copied to test/fixtures/probe8-T2N3-*.
  // The new figure is a year, a schedule, a count or another unit, not the old quantity revised.
  const words = [
    'Changed “500” → “waived until 2027”',
    'Changed “1,000,000” → “as set out in Schedule 3”',
    'Changed “24” → “2 years”',
    'Changed “400” → “2 instalments of 200”',
    'Number changed: 1,250.00 → 1,300.00 (+4%)',
  ];
  assert.deepEqual(listed(await run('T2N3-table-before', 'T2N3-table-words')), words);
  // Control: the same table with figures revised.
  assert.deepEqual(listed(await run('T2N3-table-before', 'T2N3-table-figures')), [
    'Number changed: 500 → 750 (+50%)',
    'Number changed: 1,000,000 → 2,000,000 (+100%)',
    'Number changed: 24 → 36 (+50%)',
    'Number changed: 400 → 450 (+13%)',
    'Number changed: 1,250.00 → 1,300.00 (+4%)',
  ]);
  const clauses = listed(await run('T2N3-clauses-before', 'T2N3-clauses-after'));
  for (const c of ['Changed “500” → “waived until 2027”', 'Changed “1,000,000” → “the amount set out in Schedule 3”', 'Changed “24” → “2 years”', 'Changed “400” → “2 instalments of 200”'])
    assert.ok(clauses.includes(c), clauses.join(' | '));
  assert.ok(!clauses.some((c) => c.startsWith('Number changed')), clauses.join(' | '));
  assert.deepEqual(listed(await run('T2N3-lines-before', 'T2N3-lines-after')), [
    'Added “% until handover”',
    'Changed “30” → “3 months”',
    'Changed “25,000” → “per Annex 4”',
    'Number changed: 40.00 → 45.00 (+13%)',
  ]);
  // A figure wrapped onto the next line after new words is not in its old slot.
  const wrapped = text(['Annual fee: 500.'], ['Annual fee: waived until', '2027.']);
  assert.ok(wrapped.includes('Changed “500” → “waived until 2027”') && !wrapped.some((c) => c.startsWith('Number')), wrapped.join(' | '));
  // A plain count or term followed by a unit stays one change too.
  assert.deepEqual(text(['The minimum term is 12.'], ['The minimum term is 24 months.']), ['Changed “12” → “24 months”']);
});
