// The label at the head of a moved clause is a consequence only when it
// fits its new place (fix round 8). Round 6 asked that the new label
// number on from 1 among its siblings, which a label ending in 1 always
// does, so a clause moved to the end of section 3 and labelled "3.1" (the
// section then reads 3.1, 3.2, 3.3, 3.1) read "Moved a paragraph". The PDFs
// are the round-7 adversarial probes (synthetic, Chromium), copied to
// test/fixtures/probe8-*.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openPdf } from '../src/node/pdf.ts';
import { extractText } from '../src/pdf/extract.ts';
import { buildDocModel } from '../src/core/tokenize.ts';
import { compareDocs } from '../src/core/compare.ts';
import { describeChange } from '../src/core/describe.ts';
import type { CompareResult } from '../src/core/types.ts';

const fixtures = new URL('./fixtures/', import.meta.url).pathname;
async function probe(after: string, before = after): Promise<CompareResult> {
  const a = buildDocModel(await extractText(await openPdf(`${fixtures}probe8-${before}-before.pdf`), 'before.pdf'));
  const b = buildDocModel(await extractText(await openPdf(`${fixtures}probe8-${after}-after.pdf`), 'after.pdf'));
  return compareDocs(a, b);
}
const listed = (r: CompareResult) => r.changes.map((c) => describeChange('en', c));
const minor = (r: CompareResult) => r.minor.map((c) => describeChange('en', c).replace('List renumbered: ', ''));

test('a moved clause labelled with a number that repeats its new section’s first clause is an edit in the move (R1-06)', async () => {
  // Clause 7.4 moved to the end of section 3 (after 3.3) but labelled "3.1".
  const p05 = await probe('r1-06-p05');
  assert.deepEqual(listed(p05), ['Moved and edited a paragraph', 'Number changed: 7.4 → 3.1']);
  assert.equal(p05.changes[1].inMove, p05.changes[0].id);
  assert.deepEqual(minor(p05), ['7.5 → 7.4']);
  // Control: the same move labelled 3.4.
  const p05c = await probe('r1-06-p05c', 'r1-06-p05');
  assert.deepEqual(listed(p05c), ['Moved a paragraph']);
  assert.deepEqual(minor(p05c), ['7.4 → 3.4', '7.5 → 7.4']);
  // Clause 2.4 moved into section 5 after 5.2, labelled "5.1"; controls 5.3 (fits) and 5.4 (a gap).
  assert.deepEqual(listed(await probe('r1-06-v06')), ['Moved and edited a paragraph', 'Number changed: 2.4 → 5.1']);
  const v06c = await probe('r1-06-v06c', 'r1-06-v06');
  assert.deepEqual(listed(v06c), ['Moved a paragraph']);
  assert.deepEqual(minor(v06c), ['2.4 → 5.3']);
  assert.deepEqual(listed(await probe('r1-06-v06x', 'r1-06-v06')), ['Moved and edited a paragraph', 'Number changed: 2.4 → 5.4']);
});

test('a table row pushed past a page break and renumbered on the way is not a move (R1-13)', async () => {
  // Word numbered list in the first column, header row repeated on page 2: a row inserted as 4,
  // so "25. Archive of working papers" moves to the top of page 2 as 26.
  const q09 = await probe('r1-13-q09');
  assert.deepEqual(listed(q09), ['Added “4. Interview notes, IT team 4”']);
  assert.ok(minor(q09).includes('25 → 26'), JSON.stringify(minor(q09)));
  assert.equal(q09.ignored.renumbered, 27);
});

/** Compares probe8-<id>-after.pdf (as the old version) with probe8-<id>-before.pdf. */
async function reversed(id: string, before = id): Promise<CompareResult> {
  const a = buildDocModel(await extractText(await openPdf(`${fixtures}probe8-${id}-after.pdf`), 'after.pdf'));
  const b = buildDocModel(await extractText(await openPdf(`${fixtures}probe8-${before}-before.pdf`), 'before.pdf'));
  return compareDocs(a, b);
}

test('a table row that flows back over a page break, above the repeated header row, is not a move (R1-13, second pass)', async () => {
  // Word numbered list: row 6 deleted, so "25. Handover pack…" at the top of page 2, under the
  // repeated header row, flows back to the foot of page 1 as 24. Before: "Moved a paragraph".
  const q09d = await probe('r1-13-q09d', 'r1-13-q09');
  assert.deepEqual(listed(q09d), ['Deleted “6. Requirements catalogue, final 7”']);
  assert.ok(minor(q09d).includes('25 → 24'), JSON.stringify(minor(q09d)));
  assert.equal(q09d.ignored.renumbered, 24);
  // Typed row numbers, the versions of R1-03's probe swapped: row 4 deleted. Before: "Moved and
  // edited" plus "Number changed: 27 → 26".
  const q09t = await reversed('r1-03-q09t');
  assert.deepEqual(listed(q09t), ['Deleted “4 Interview notes, IT team 4”']);
  assert.equal(q09t.ignored.renumbered, 27);
  // Controls, LibreOffice, row 4 deleted: the crossing row's number typed by hand ("28" in the
  // old version, 25 in the new) and its due week edited (28 → 26) stay listed.
  const ch1 = await reversed('r1-13-ch1');
  assert.ok(listed(ch1).includes('Number changed: 28 → 25'), JSON.stringify(listed(ch1)));
  const ch2 = await reversed('r1-13-ch2');
  assert.ok(listed(ch2).some((d) => /26”$/.test(d) && d.startsWith('Added “25. Archive')), JSON.stringify(listed(ch2)));
  assert.ok(listed(ch2).some((d) => /28”$/.test(d) && d.startsWith('Deleted “26. Archive')), JSON.stringify(listed(ch2)));
});
