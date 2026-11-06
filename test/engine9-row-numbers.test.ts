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

// Second pass. reportlab draws a table as one text block, so its row numbers do not start a
// block (fpdf2's do): the SYNTHETIC reportlab 5.0.1 probes made by
// test/fixtures/gen9/probe9-T2b.py, with the right-aligned "Pos." column 0.78 em before the next cell.
/** Compares probe9-T2b-<before>.pdf with probe9-T2b-<after>.pdf. */
async function probeB(before: string, after: string): Promise<CompareResult> {
  return compareDocs(await load(`${fixtures}probe9-T2b-${before}.pdf`), await load(`${fixtures}probe9-T2b-${after}.pdf`));
}

test('T2: in a table drawn as one text block, an inserted row starts at its own number and a row that crosses a page break is not moved', async () => {
  // A row inserted as Pos. 3; next to it, the price and amount of the row below changed.
  const ins = await probeB('ins-before', 'ins-after');
  assert.deepEqual(listed(ins), ['Added 9 words', 'Number changed: 7,95 → 8,95 (+13%)', 'Number changed: 15,90 → 17,90 (+13%)', 'Number changed: 222,65 → 245,35 (+10%)']);
  // Not "KX-2212 … 20,70 4": the old row 3 is paired with the new row 4.
  assert.equal(ins.changes[0].new.text, '3 KX-2212 Schrumpfschlauch 4 mm, gelb 3 6,90 20,70');
  assert.deepEqual(minor(ins), shifted(3, 10));
  // 40 rows over two pages; the row inserted as Pos. 3 pushes Pos. 38 (KX-9970) to the top of p. 2 as 39.
  // Before, a false "Moved and edited" + "Deleted “38”" + "Added “40”".
  const cross = await probeB('cross-before', 'cross-after');
  assert.deepEqual(listed(cross), ['Added 9 words', 'Number changed: 908,46 → 929,16 (+2.3%)']);
  assert.equal(cross.changes[0].new.text, '3 KX-2212 Schrumpfschlauch 4 mm, gelb 3 6,90 20,70');
  assert.deepEqual(minor(cross), shifted(3, 40));
  const back = await probeB('cross-after', 'cross-before');
  assert.deepEqual(listed(back), ['Deleted 9 words', 'Number changed: 929,16 → 908,46 (-2.2%)']);
  assert.deepEqual(minor(back), shifted(4, 41, -1));
});

test('T2: in a table drawn as one text block, a crossing row edited or numbered by hand stays listed (controls)', async () => {
  // The crossing row numbered "41" by hand (39 expected): listed on both pages, its number with it.
  const hand = await probeB('cross-before', 'crossx-after');
  assert.deepEqual(listed(hand).slice(0, 3), ['Added 9 words', 'Deleted “38 KX-9970 Blindabdeckung 6 0,70 4,20”', 'Added “41 KX-9970 Blindabdeckung 6 0,70 4,20”']);
  assert.ok(minor(hand).every((m) => !m.startsWith('38 ')), JSON.stringify(minor(hand)));
  // The rows after it: renumbered, but after a number typed by hand; listed.
  assert.deepEqual(listed(hand).slice(3), ['Number changed: 39 → 40', 'Number changed: 40 → 41', 'Number changed: 908,46 → 929,16 (+2.3%)']);
  // The crossing row's description edited ("grau" added): listed on both pages.
  const edited = await probeB('cross-before', 'crosse-after');
  assert.deepEqual(listed(edited), ['Added 9 words', 'Deleted “38 KX-9970 Blindabdeckung 6 0,70 4,20”', 'Added “39 KX-9970 Blindabdeckung grau 6 0,70 4,20”', 'Number changed: 908,46 → 929,16 (+2.3%)']);
  assert.deepEqual(minor(edited), [...shifted(3, 37), ...shifted(39, 40)]);
});

test('T2: the rows renumbered after a row number typed by hand get no percentage, and none is counted', async () => {
  // Pos. 7 deleted; the next row keeps its number 8 by hand; the two after it are renumbered 8 and 9.
  const r = await probeB('ins-before', 'dup-after');
  assert.deepEqual(listed(r), ['Deleted “7 KX-4400 Klemmleiste 12-polig 6 5,75 34,50”', 'Number changed: 9 → 8', 'Number changed: 10 → 9', 'Number changed: 222,65 → 188,15 (-15%)']);
  assert.equal(r.ignored.renumbered, 0);
});
