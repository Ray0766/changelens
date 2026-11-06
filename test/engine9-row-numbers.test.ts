// Fix round 9, area T2 (row numbers): fpdf2 sets a table's right-aligned
// "Pos." column 0.67 em before the next cell, closer than the em that a
// row number needed to be read as one. After an inserted row, every
// renumbered row was listed as a number change with a percentage (round 5,
// cause 2: 26 items in holdout5-i-rechnung-eur). Such a column is read as
// row numbers when the column itself is the evidence (see tightRowNumbers
// in compare.ts); renumbering is still hidden only when the rows inserted
// or deleted above explain the shift (D11). The probes are SYNTHETIC fpdf2
// 2.9 files made by test/fixtures/gen9/probe9-T2.py.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openPdf } from '../src/node/pdf.ts';
import { extractText } from '../src/pdf/extract.ts';
import { buildDocModel } from '../src/core/tokenize.ts';
import { compareDocs } from '../src/core/compare.ts';
import { describeChange } from '../src/core/describe.ts';
import type { CompareResult } from '../src/core/types.ts';

const fixtures = new URL('./fixtures/', import.meta.url).pathname;
const load = async (path: string) => buildDocModel(await extractText(await openPdf(path), path));
/** Compares probe9-T2-<before>.pdf with probe9-T2-<after>.pdf. */
async function probe(before: string, after: string): Promise<CompareResult> {
  return compareDocs(await load(`${fixtures}probe9-T2-${before}.pdf`), await load(`${fixtures}probe9-T2-${after}.pdf`));
}
const listed = (r: CompareResult) => r.changes.map((c) => describeChange('en', c));
const minor = (r: CompareResult) => r.minor.map((c) => describeChange('en', c).replace('List renumbered: ', ''));
/** "n → n+1" for each n in [from, to]. */
const shifted = (from: number, to: number, by = 1) => Array.from({ length: to - from + 1 }, (_, i) => `${from + i} → ${from + i + by}`);

test('T2: row numbers set closer than an em to the next cell are renumbered after an inserted or deleted row', async () => {
  // A row inserted as Pos. 4; next to it, the quantity and amount of the row below changed.
  const ins = await probe('insert-before', 'insert-after');
  assert.deepEqual(listed(ins), ['Added a paragraph', 'Number changed: 4 → 6 (+50%)', 'Number changed: 49,60 → 74,40 (+50%)', 'Number changed: 1.247,35 → 1.426,15 (+14%)']);
  // The inserted row starts at its own number, not at the next row's.
  assert.ok(ins.changes[0].new.text.startsWith('4 31-0458 Pipettenspitzen'), ins.changes[0].new.text);
  assert.deepEqual(minor(ins), shifted(4, 12));
  assert.equal(ins.ignored.renumbered, 9);
  // The same row deleted.
  const del = await probe('insert-after', 'insert-before');
  assert.deepEqual(listed(del), ['Deleted a paragraph', 'Number changed: 6 → 4 (-33%)', 'Number changed: 74,40 → 49,60 (-33%)', 'Number changed: 1.426,15 → 1.247,35 (-13%)']);
  assert.ok(del.changes[0].old.text.startsWith('4 31-0458 Pipettenspitzen'), del.changes[0].old.text);
  assert.equal(del.ignored.renumbered, 9);
  // A left-aligned column: "1"–"9" stand an em or more before the next cell, "10"–"13" closer.
  for (const [before, after, kind] of [['leftcol-before', 'leftcol-after', 'Added'], ['leftcol-after', 'leftcol-before', 'Deleted']]) {
    const r = await probe(before, after);
    assert.deepEqual(listed(r)[0], `${kind} a paragraph`, JSON.stringify(listed(r)));
    assert.equal(r.changes.length, 2, JSON.stringify(listed(r)));
    assert.equal(r.ignored.renumbered, 11, `${before} → ${after}`);
  }
});

test('T2: a row number changed by hand stays listed, without a percentage (controls)', async () => {
  // Nothing inserted; Pos. 7 numbered "8".
  const hand = await probe('insert-before', 'byhand-after');
  assert.deepEqual(listed(hand), ['Number changed: 7 → 8']);
  assert.equal(hand.ignored.renumbered, 0);
  // A row inserted as Pos. 4, and the last row numbered 14 (a shift of 2, not 1).
  const mixed = await probe('insert-before', 'mixed-after');
  assert.deepEqual(listed(mixed), ['Added a paragraph', 'Number changed: 4 → 6 (+50%)', 'Number changed: 49,60 → 74,40 (+50%)', 'Number changed: 12 → 14', 'Number changed: 1.247,35 → 1.426,15 (+14%)']);
  assert.deepEqual(minor(mixed), shifted(4, 11));
});

test('T2: consecutive figures that no inserted row explains stay listed (controls)', async () => {
  // A first column headed "Menge" (1, 2, 3 …): a row added on top and every quantity raised by one.
  const qty = await probe('qty-before', 'qty-after');
  const quantities = listed(qty).filter((d) => /^Number changed: \d+ → \d+ /.test(d));
  assert.deepEqual(quantities, ['Number changed: 2 → 3 (+50%)', 'Number changed: 3 → 4 (+33%)', 'Number changed: 4 → 5 (+25%)', 'Number changed: 5 → 6 (+20%)', 'Number changed: 6 → 7 (+17%)', 'Number changed: 7 → 8 (+14%)', 'Number changed: 8 → 9 (+13%)']);
  assert.equal(qty.ignored.renumbered, 0);
  // A first column of days moved on by one, nothing inserted: every day is listed. The column is
  // not headed as quantities, so its figures read as row numbers and get no percentage.
  const days = await probe('days-before', 'days-after');
  assert.deepEqual(listed(days), shifted(1, 8).map((s) => `Number changed: ${s}`));
  assert.equal(days.ignored.renumbered, 0);
  // Lines that start with a count, word spaces as wide as the gap after it (a justified line):
  // a line added on top and every count raised by one. The counts are not row numbers.
  const just = await probe('justified-before', 'justified-after');
  assert.equal(just.ignored.renumbered, 0);
  assert.deepEqual(listed(just).slice(1), ['Number changed: 2 → 3 (+50%)', 'Number changed: 3 → 4 (+33%)', 'Number changed: 4 → 5 (+25%)', 'Number changed: 5 → 6 (+20%)', 'Number changed: 6 → 7 (+17%)', 'Number changed: 7 → 8 (+14%)', 'Number changed: 8 → 9 (+13%)']);
  // A single line-start integer, no column.
  assert.deepEqual(listed(await probe('lone-before', 'lone-after')), ['Number changed: 5 → 6 (+20%)']);
});
