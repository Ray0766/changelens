// Renumbering needs positive evidence (fix round 6). A list, clause or row
// label that changed is a consequence only when numbered siblings (the same
// level under the same parent) were added, removed or moved above it, the
// shift equals their net number, and the labels number on from 1 in both
// versions. Anything else is listed: a list renumbered by hand, a label
// changed below an unrelated edit, times, dates and quantities in a table's
// first column, a footnote marker on a value, a figure at the head of a moved
// row. The PDFs are the round-5 adversarial probes (synthetic; Chromium, and
// python-docx via LibreOffice for n19), copied to test/fixtures/probe6-*.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openPdf } from '../src/node/pdf.ts';
import { extractText } from '../src/pdf/extract.ts';
import { buildDocModel } from '../src/core/tokenize.ts';
import { compareDocs } from '../src/core/compare.ts';
import { describeChange, notices } from '../src/core/describe.ts';
import type { CompareResult, DocText, TextRun } from '../src/core/types.ts';

const fixtures = new URL('./fixtures/', import.meta.url).pathname;
async function probe(id: string): Promise<CompareResult> {
  const a = buildDocModel(await extractText(await openPdf(`${fixtures}probe6-${id}-before.pdf`), 'before.pdf'));
  const b = buildDocModel(await extractText(await openPdf(`${fixtures}probe6-${id}-after.pdf`), 'after.pdf'));
  return compareDocs(a, b);
}
const listed = (r: CompareResult) => r.changes.map((c) => describeChange('en', c));
const minor = (r: CompareResult) => r.minor.map((c) => describeChange('en', c));
const renumberNotice = (r: CompareResult) => notices('en', r).find((n) => n.action === 'minor' && /list numbers? changed/.test(n.text))?.text;

test('labels renumbered by hand with nothing added, removed or moved are listed (N05, N06)', async () => {
  // Heading 3. → 4. and its clauses 3.1–3.3 → 4.1–4.3: the document reads 1, 2, 4.
  const n05 = await probe('n05');
  assert.deepEqual(listed(n05), ['Number changed: 3 → 4', 'Number changed: 3.1 → 4.1', 'Number changed: 3.2 → 4.2', 'Number changed: 3.3 → 4.3']);
  assert.equal(n05.ignored.renumbered, 0);
  assert.equal(renumberNotice(n05), undefined);
  // 2.3 and 2.4 → 2.4 and 2.5: 2.3 is missing.
  const n06 = await probe('n06');
  assert.deepEqual(listed(n06), ['Number changed: 2.3 → 2.4', 'Number changed: 2.4 → 2.5']);
  assert.deepEqual(minor(n06), []);
});

test('a label changed by hand below a sentence or word edit is listed with the edit (N04, N04b)', async () => {
  // A sentence inserted inside 4.2; the next label 4.3 → 4.4 (the list reads 4.1, 4.2, 4.4).
  assert.deepEqual(listed(await probe('n04')), ['Added 9 words', 'Number changed: 4.3 → 4.4']);
  // Only the word "written" deleted in 4.1; 4.3 → 4.4 two clauses below.
  const n04b = await probe('n04b');
  assert.deepEqual(listed(n04b), ['Deleted “written”', 'Number changed: 4.3 → 4.4']);
  assert.deepEqual(minor(n04b), []);
});

test('an inserted clause explains a shift of one in its own section only (N03, N19)', async () => {
  // Clause 4.3 inserted: old 4.3 → 4.4 follows; old 4.4, 4.5 set to 4.6, 4.7 by hand do not.
  const n03 = await probe('n03');
  assert.deepEqual(listed(n03), ['Added a paragraph', 'Number changed: 4.4 → 4.6', 'Number changed: 4.5 → 4.7']);
  assert.deepEqual(minor(n03), ['List renumbered: 4.3 → 4.4']);
  assert.ok(n03.changes[0].new.text.startsWith('4.3 '), n03.changes[0].new.text);
  // LibreOffice, literal labels: 4.3 inserted; 5.1 changed to 5.2 by hand in section 5.
  const n19 = await probe('n19');
  assert.deepEqual(listed(n19), ['Added a paragraph', 'Number changed: 5.1 → 5.2']);
  assert.deepEqual(minor(n19), ['List renumbered: 4.3 → 4.4']);
});

test('times and dates in a table’s first column are listed, not taken for clause labels (N11, N12)', async () => {
  // An agenda where every session moved one hour later, nothing inserted.
  const n11 = await probe('n11');
  assert.deepEqual(listed(n11), ['Number changed: 09.00 → 10.00', 'Number changed: 10.30 → 11.30', 'Number changed: 12.00 → 13.00 (+8.3%)', 'Number changed: 13.15 → 14.15']);
  assert.equal(n11.ignored.renumbered, 0);
  // A payment row inserted; the next due date changed 15.03.27 → 16.03.27.
  const n12 = await probe('n12');
  assert.deepEqual(listed(n12), ['Added “01.02.27 Mobilisation fee 2,500.00”', 'Number changed: 15.03.27 → 16.03.27']);
  assert.deepEqual(minor(n12), []);
});

test('a column of quantities that went up after an inserted row is listed (N09)', async () => {
  // Qty | Item | Unit price: row "8 Keyboard, wireless" added on top, every quantity +1.
  const r = await probe('n09');
  assert.deepEqual(listed(r), [
    'Added “8 Keyboard, wireless 49.00”',
    'Number changed: 2 → 3 (+50%)',
    'Number changed: 3 → 4 (+33%)',
    'Number changed: 4 → 5 (+25%)',
    'Number changed: 5 → 6 (+20%)',
  ]);
  assert.equal(r.ignored.renumbered, 0);
});

test('a footnote marker added to a value is listed; a citation number has no percentage (N13)', async () => {
  const r = await probe('n13');
  assert.deepEqual(listed(r), ['Number changed: 2024 → 2026 (+0.1%)', 'Number changed: 12 → 13', 'Added “[1]”', 'Added a paragraph']);
  // The marker sits on the 2.5 mg row's dose.
  const marker = r.changes[2];
  assert.equal(r.newDoc.tokens[marker.new.start! - 1].text, '2.5');
  assert.deepEqual(minor(r), []);
});

test('a figure at the head of a moved table row is an edit inside the move (N15)', async () => {
  // Row "Galvanised steel" moved from the top to the bottom, its thickness 0.8 → 1.5.
  const r = await probe('n15');
  assert.deepEqual(listed(r), ['Moved and edited a paragraph', 'Number changed: 0.8 → 1.5 (+87%)']);
  assert.equal(r.changes[1].inMove, r.changes[0].id);
  assert.deepEqual(minor(r), []);
});

test('controls: renumbering after an inserted or moved clause stays a consequence (N01, N08, N16b)', async () => {
  // Clause 4.3 inserted: 4.3, 4.4 and 4.4.1–4.4.3 shift by one.
  const n01 = await probe('n01');
  assert.deepEqual(listed(n01), ['Added a paragraph']);
  assert.ok(n01.changes[0].new.text.startsWith('4.3 Where a change is needed urgently'), n01.changes[0].new.text);
  assert.deepEqual(minor(n01), ['List renumbered: 4.3 → 4.4', 'List renumbered: 4.4 → 4.5', 'List renumbered: 4.4.1 → 4.5.1', 'List renumbered: 4.4.2 → 4.5.2', 'List renumbered: 4.4.3 → 4.5.3']);
  // The notice says what happened, without claiming more.
  assert.equal(renumberNotice(n01), '5 list numbers changed only because numbered items were added, removed or moved; they are not listed.');
  // The texts of 6.2 and 6.3 swapped places, the labels stay in order.
  const n08 = await probe('n08');
  assert.deepEqual(listed(n08), ['Moved a paragraph']);
  assert.deepEqual(minor(n08), ['List renumbered: 6.3 → 6.2', 'List renumbered: 6.2 → 6.3']);
  // Clause 7.4 moved up into section 3 as 3.3; 7.5 and 7.6 become 7.4 and 7.5.
  const n16b = await probe('n16b');
  assert.deepEqual(listed(n16b), ['Moved a paragraph']);
  assert.deepEqual(minor(n16b), ['List renumbered: 7.4 → 3.3', 'List renumbered: 7.5 → 7.4', 'List renumbered: 7.6 → 7.5']);
});

/**
 * Clauses as a word processor sets them: the label at the clause's indent,
 * the text after a tab. An item is [label, text, level].
 */
function clauses(name: string, items: [string, string, number?][]): DocText {
  const runs: TextRun[] = [];
  const run = (str: string, x: number, y: number, eol = false): TextRun => ({ str, x, y: y - 9, w: str.length * 5, h: 11, baseline: y, fontSize: 10, font: 'Body', family: 'sans-serif', eol, angle: 0 });
  let y = 80;
  for (const [label, line, level = 0] of items) {
    const lx = 56 + 34 * level;
    runs.push(run(label, lx, y), run(line, lx + 34, y, true));
    y += 20;
  }
  return { name, pages: [{ index: 0, width: 595, height: 842, runs }] };
}
const T = ['Each party shall keep the other informed.', 'Notices are given in writing to the address above.', 'A change takes effect when both parties sign it.', 'The Supplier may not assign this agreement.'];

test('labels swapped or repeated below an edit are listed (verifier variants V4, V7)', () => {
  // V4: two words deleted in 5.1, and 6.1 ↔ 6.2 swapped just below.
  const a = clauses('a', [['5.1', 'Notices are given in writing and written to the address.'], ['6.1', T[0]], ['6.2', T[1]], ['6.3', T[2]]]);
  const b = clauses('b', [['5.1', 'Notices are given in writing to the address.'], ['6.2', T[0]], ['6.1', T[1]], ['6.3', T[2]]]);
  const r = compareDocs(buildDocModel(a), buildDocModel(b));
  assert.deepEqual(listed(r), ['Deleted “and written”', 'Number changed: 6.1 → 6.2', 'Number changed: 6.2 → 6.1']);
  // V7: 3.2 → 3.1 and 3.3 → 3.2, so two clauses read 3.1.
  const c = clauses('c', [['3.1', T[0]], ['3.2', T[1]], ['3.3', T[2]]]);
  const d = clauses('d', [['3.1', T[0]], ['3.1', T[1]], ['3.2', T[2]]]);
  assert.deepEqual(listed(compareDocs(buildDocModel(c), buildDocModel(d))), ['Number changed: 3.2 → 3.1', 'Number changed: 3.3 → 3.2']);
});

test('a deleted clause explains the shift of the clauses below it', () => {
  const a = clauses('a', [['4.1', T[0]], ['4.2', T[1]], ['4.3', T[2]], ['4.4', T[3]]]);
  const b = clauses('b', [['4.1', T[0]], ['4.2', T[2]], ['4.3', T[3]]]);
  const r = compareDocs(buildDocModel(a), buildDocModel(b));
  assert.equal(r.changes.length, 1, JSON.stringify(listed(r)));
  assert.equal(r.changes[0].kind, 'delete');
  assert.deepEqual(minor(r), ['List renumbered: 4.3 → 4.2', 'List renumbered: 4.4 → 4.3']);
});

/** A table: one row per paragraph, a number in its first column under a header row. */
function table(name: string, header: string, rows: [string, string][]): DocText {
  const runs: TextRun[] = [];
  const cell = (str: string, x: number, y: number, eol: boolean): TextRun => ({ str, x, y: y - 9, w: str.length * 5, h: 11, baseline: y, fontSize: 10, font: 'Body', family: 'sans-serif', eol, angle: 0 });
  runs.push(cell(header, 56, 80, false), cell('Item', 100, 80, true));
  rows.forEach(([n, item], k) => runs.push(cell(n, 56, 110 + 20 * k, false), cell(item, 100, 110 + 20 * k, true)));
  return { name, pages: [{ index: 0, width: 595, height: 842, runs }] };
}

test('a first column headed as quantities is not a column of row numbers', () => {
  const items: [string, string][] = [['1', 'Laptop, 14 inch'], ['2', 'Docking station'], ['3', 'Monitor, 27 inch']];
  const grown: [string, string][] = [['1', 'Keyboard, wireless'], ['2', 'Laptop, 14 inch'], ['3', 'Docking station'], ['4', 'Monitor, 27 inch']];
  // "No.": the inserted row shifts the row numbers below it.
  const no = compareDocs(buildDocModel(table('a', 'No.', items)), buildDocModel(table('b', 'No.', grown)));
  assert.deepEqual(listed(no), ['Added “1 Keyboard, wireless”']);
  assert.equal(no.ignored.renumbered, 3);
  // "Qty": the same figures are quantities; each change is listed.
  const qty = compareDocs(buildDocModel(table('a', 'Qty', items)), buildDocModel(table('b', 'Qty', grown)));
  assert.equal(qty.ignored.renumbered, 0);
  assert.equal(qty.changes.filter((c) => c.numeric).length, 3, JSON.stringify(listed(qty)));
});

test('a clause cross-reference in running text is listed without a percentage (N02)', () => {
  const para = (n: string): DocText => {
    const str = `The Supplier shall act under clause ${n} of this agreement.`;
    return { name: n, pages: [{ index: 0, width: 595, height: 842, runs: [{ str, x: 56, y: 71, w: str.length * 5, h: 11, baseline: 80, fontSize: 10, font: 'Body', family: 'sans-serif', eol: true, angle: 0 }] }] };
  };
  assert.deepEqual(listed(compareDocs(buildDocModel(para('4.4')), buildDocModel(para('4.5')))), ['Number changed: 4.4 → 4.5']);
});
