// Fix round 9, area T2 (row numbers): fpdf2 sets a table's right-aligned
// "Pos." column 0.67 em before the next cell, closer than the em that a
// row number needed to be read as one. After an inserted row, every
// renumbered row was listed as a number change with a percentage (round 5,
// cause 2: 26 items in holdout5-i-rechnung-eur). Such a column is read as
// row numbers when the column itself is the evidence (see tightRowNumbers
// in compare.ts); renumbering is still hidden only when the rows inserted
// or deleted above explain the shift (D11). The probes are SYNTHETIC fpdf2
// 2.9 files made by test/fixtures/gen9/probe9-T2.py; the round-5 case is
// the committed eval/cases/holdout5-i-rechnung-eur pair.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openPdf } from '../src/node/pdf.ts';
import { extractText } from '../src/pdf/extract.ts';
import { buildDocModel } from '../src/core/tokenize.ts';
import { compareDocs } from '../src/core/compare.ts';
import { describeChange } from '../src/core/describe.ts';
import type { CompareResult } from '../src/core/types.ts';

const fixtures = new URL('./fixtures/', import.meta.url).pathname;
const cases = new URL('../eval/cases/', import.meta.url).pathname;
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
  // Rows of one word each, no word space to compare the gap with: a row inserted as Pos. 3.
  const two = await probe('twocol-before', 'twocol-after');
  assert.deepEqual(listed(two), ['Added “3 Muffe”']);
  assert.deepEqual(minor(two), shifted(3, 10));
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

test('T2: a row that crosses a page break below an inserted row reads "Moved", its new number counted', async () => {
  // 30 rows over two pages, a running header on p. 2 only (the move itself is round 5's cause 7);
  // a row inserted as Pos. 5, so row 26 becomes row 27 at the top of p. 2.
  const r = await probe('crossing-before', 'crossing-after');
  assert.deepEqual(listed(r), ['Added a paragraph', 'Moved a paragraph', 'Number changed: 3.318,55 → 3.472,55 (+4.6%)']);
  assert.deepEqual(minor(r), shifted(5, 30));
  assert.equal(r.ignored.renumbered, 26);
  assert.equal(r.changes[1].moveEdits, undefined);
  // Deleted the other way round: row 27 at the top of p. 2 flows back to the foot of p. 1 as 26.
  const back = await probe('crossing-after', 'crossing-before');
  assert.deepEqual(listed(back), ['Deleted a paragraph', 'Moved a paragraph', 'Number changed: 3.472,55 → 3.318,55 (-4.4%)']);
  assert.equal(back.ignored.renumbered, 26);
  // Control: the crossing row's text edited as well: "Moved and edited", the edit listed.
  const edited = await probe('crossing-before', 'crossinge-after');
  assert.deepEqual(listed(edited), ['Added a paragraph', 'Moved and edited a paragraph', 'Added “(geeicht)”', 'Number changed: 3.318,55 → 3.472,55 (+4.6%)']);
  assert.equal(edited.changes[2].inMove, edited.changes[1].id);
  assert.equal(edited.ignored.renumbered, 26);
  // Control: the crossing row numbered "31" by hand: an edit in the move, without a percentage.
  const hand = await probe('crossing-before', 'crossingx-after');
  const items = listed(hand);
  assert.deepEqual(items.slice(0, 3), ['Added a paragraph', 'Moved and edited a paragraph', 'Number changed: 26 → 31']);
  assert.equal(hand.changes[2].inMove, hand.changes[1].id);
  assert.ok(!minor(hand).includes('26 → 31'), JSON.stringify(minor(hand)));
  assert.ok(items.every((d) => !/^Number changed: \d+ → \d+ \(/.test(d)), JSON.stringify(items));
});

test('T2: two rows that cross a page break together read "Moved", each new number counted', async () => {
  // Two rows inserted as Pos. 5 and 6: rows 25 and 26 move to the top of p. 2 as 27 and 28.
  const r = await probe('crossing-before', 'crossing2-after');
  assert.deepEqual(listed(r), ['Added 2 paragraphs', 'Moved 2 paragraphs', 'Number changed: 3.318,55 → 3.562,35 (+7.3%)']);
  assert.deepEqual(minor(r), shifted(5, 30, 2));
  const back = await probe('crossing2-after', 'crossing-before');
  assert.deepEqual(listed(back), ['Deleted 2 paragraphs', 'Moved 2 paragraphs', 'Number changed: 3.562,35 → 3.318,55 (-6.8%)']);
  assert.equal(back.ignored.renumbered, 26);
  // Control: the second crossing row numbered "40" by hand stays an edit inside the move.
  const hand = await probe('crossing-before', 'crossing2x-after');
  assert.deepEqual(listed(hand).slice(0, 3), ['Added 2 paragraphs', 'Moved and edited 2 paragraphs', 'Number changed: 26 → 40']);
  assert.equal(hand.changes[2].inMove, hand.changes[1].id);
  assert.ok(minor(hand).includes('25 → 27'), JSON.stringify(minor(hand)));
});

test('T2: holdout5-i-rechnung-eur: the renumbered positions are counted, not listed', async () => {
  const before = await load(`${cases}holdout5-i-rechnung-eur/before.pdf`);
  const after = await load(`${cases}holdout5-i-rechnung-eur/after.pdf`);
  const r = compareDocs(before, after);
  assert.deepEqual(listed(r), [
    'Added a paragraph',
    'Number changed: 10 → 12 (+20%)',
    'Number changed: 489,00 → 586,80 (+20%)',
    // The Laborthermometer row at the top of p. 2, under a running header that p. 1 does not have
    // (round 5's cause 7); its new number 27 is counted with the renumbering.
    'Moved a paragraph',
    'Number changed: -150,00 → -185,00 (+23%)',
    'Number changed: 3.295,35 → 3.512,15 (+6.6%)',
    'Number changed: 626,12 → 667,31 (+6.6%)',
    'Number changed: 3.921,47 → 4.179,46 (+6.6%)',
    'Number changed: 18.11.2026 → 02.12.2026',
  ]);
  assert.ok(r.changes[0].new.text.startsWith('7 31-0458 Pipettenspitzen 1000'), r.changes[0].new.text);
  assert.ok(r.changes[3].old.text.startsWith('26 63-1100 Laborthermometer') && r.changes[3].new.text.startsWith('27 63-1100 Laborthermometer'), r.changes[3].new.text);
  assert.deepEqual(minor(r), shifted(7, 35));
  assert.equal(r.ignored.renumbered, 29);
  // The other way round: position 7 deleted.
  const back = compareDocs(after, before);
  assert.equal(back.ignored.renumbered, 29);
  assert.deepEqual(listed(back).slice(0, 4), ['Deleted a paragraph', 'Number changed: 12 → 10 (-17%)', 'Number changed: 586,80 → 489,00 (-17%)', 'Moved a paragraph']);
  assert.equal(back.changes.length, 9, JSON.stringify(listed(back)));
});
