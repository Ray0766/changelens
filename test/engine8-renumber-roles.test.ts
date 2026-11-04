// Sibling lists keep apart labels in different roles (fix round 8). Headings
// and the steps under them, an outer list and the list nested in one of its
// items, a table's row numbers and the figures of another column, and a
// figure that a wrapped line starts with in the text column all look like
// "N." labels. Read as one list, they hid a heading renumbered by hand (the
// steps above it "explained" it), and they broke the numbered run of the
// real list, so every automatic renumbering was listed. The PDFs are the
// round-7 adversarial probes (synthetic; Chromium, reportlab, and
// python-docx via LibreOffice), copied to test/fixtures/probe8-*.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openPdf } from '../src/node/pdf.ts';
import { extractText } from '../src/pdf/extract.ts';
import { buildDocModel } from '../src/core/tokenize.ts';
import { compareDocs } from '../src/core/compare.ts';
import { describeChange } from '../src/core/describe.ts';
import type { CompareResult } from '../src/core/types.ts';

const fixtures = new URL('./fixtures/', import.meta.url).pathname;
/** Compares probe8-<before>-before.pdf with probe8-<after>-after.pdf. */
async function probe(after: string, before = after): Promise<CompareResult> {
  const a = buildDocModel(await extractText(await openPdf(`${fixtures}probe8-${before}-before.pdf`), 'before.pdf'));
  const b = buildDocModel(await extractText(await openPdf(`${fixtures}probe8-${after}-after.pdf`), 'after.pdf'));
  return compareDocs(a, b);
}
const listed = (r: CompareResult) => r.changes.map((c) => describeChange('en', c));
const numbers = (r: CompareResult) => r.changes.filter((c) => c.numeric).map((c) => describeChange('en', c));
const minor = (r: CompareResult) => r.minor.map((c) => describeChange('en', c));

test('a heading renumbered by hand is listed although steps were inserted or deleted above it (R1-01)', async () => {
  // Chromium: step 3 inserted in section 2, heading "3. Records" changed to "4." by hand.
  const p01 = await probe('r1-01-p01');
  assert.deepEqual(numbers(p01), ['Number changed: 3 → 4']);
  assert.deepEqual(minor(p01), ['List renumbered: 2 → 3']);
  // Controls: the step alone; the heading alone.
  const p01c = await probe('r1-01-p01c', 'r1-01-p01');
  assert.equal(p01c.changes.length, 1, JSON.stringify(listed(p01c)));
  assert.equal(p01c.changes[0].kind, 'insert');
  assert.deepEqual(minor(p01c), ['List renumbered: 2 → 3']);
  assert.deepEqual(listed(await probe('r1-01-p01h', 'r1-01-p01')), ['Number changed: 3 → 4']);
  // A step deleted, heading "4." changed to "3." by hand (the page reads 1, 2, 3, 3, 5).
  const v01d = await probe('r1-01-v01d');
  assert.deepEqual(numbers(v01d), ['Number changed: 4 → 3']);
  assert.deepEqual(minor(v01d), ['List renumbered: 3 → 2']);
  const v01dc = await probe('r1-01-v01dc', 'r1-01-v01d');
  assert.deepEqual(numbers(v01dc), []);
  assert.deepEqual(minor(v01dc), ['List renumbered: 3 → 2']);
  // LibreOffice, typed labels: a step inserted as 2 (3 → 4 follows), heading "4." changed to "5.".
  const w01m = await probe('r1-01-w01m');
  assert.deepEqual(numbers(w01m), ['Number changed: 4 → 5']);
  assert.deepEqual(minor(w01m), ['List renumbered: 2 → 3', 'List renumbered: 3 → 4']);
  // Bare row numbers in a "No." table under bare heading numbers: row 2 inserted, heading 3 → 4 by hand.
  const p14 = await probe('r1-01-p14');
  assert.deepEqual(
    numbers(p14).map((d) => d.replace(/ \(.*\)$/, '')),
    ['Number changed: 3 → 4'],
  );
  assert.deepEqual(minor(p14), ['List renumbered: 2 → 3']);
});

test('headings after a step list are renumbered after an inserted section (R1-05)', async () => {
  // Word numbering via LibreOffice: headings at 62 pt, steps at 71 pt, the same size.
  const q08 = await probe('r1-05-q08');
  assert.deepEqual(numbers(q08), []);
  assert.deepEqual(minor(q08), ['List renumbered: 2 → 3', 'List renumbered: 3 → 4', 'List renumbered: 4 → 5', 'List renumbered: 5 → 6']);
  // reportlab: bold 12 pt headings, 10 pt steps at another indent; the control has no steps.
  for (const id of ['r1-05-w05', 'r1-05-w05c']) {
    const r = await probe(id);
    assert.equal(r.changes.length, 1, `${id}: ${JSON.stringify(listed(r))}`);
    assert.equal(r.ignored.renumbered, 4, id);
  }
});

test('a nested numbered list does not break the outer list’s renumbering (R6-01, R7-02)', async () => {
  // A 60-item <ol>, item 4 holding a nested 1.–3.; an item inserted as 2 and 10 → 15 days.
  for (const id of ['r6-01-ol', 'r6-01-flat']) {
    const r = await probe(id);
    assert.deepEqual(numbers(r), ['Number changed: 10 → 15 (+50%)'], id);
    assert.equal(r.ignored.renumbered, 59, id);
  }
  // Word multilevel numbering via LibreOffice: 30 obligations, no. 6 with sub-items.
  const lo = await probe('r6-01-lo');
  assert.deepEqual(numbers(lo), ['Number changed: 14 → 21 (+50%)']);
  assert.equal(lo.ignored.renumbered, 28);
  // Steps 2 and 4 with nested sub-steps 1.–3.; a step inserted as 2. Control: no nested numbers.
  for (const id of ['r7-02-nest', 'r7-02-nestctl']) {
    const r = await probe(id);
    assert.equal(r.changes.length, 1, `${id}: ${JSON.stringify(listed(r))}`);
    assert.deepEqual(minor(r), ['List renumbered: 2 → 3', 'List renumbered: 3 → 4', 'List renumbered: 4 → 5', 'List renumbered: 5 → 6'], id);
  }
  // Section headings each followed by a list that starts again at 1; a section inserted as 2.
  const head = await probe('r7-02-headlist');
  assert.equal(head.changes.length, 1, JSON.stringify(listed(head)));
  assert.deepEqual(minor(head), ['List renumbered: 2 → 3', 'List renumbered: 3 → 4', 'List renumbered: 4 → 5']);
  // Right-aligned markers ("9." and "10." end at the same x) stay one list.
  const ol = await probe('r7-02-ol');
  assert.equal(ol.changes.length, 1, JSON.stringify(listed(ol)));
  assert.equal(ol.ignored.renumbered, 11);
});

test('figures in another column of a numbered table are not row numbers (R1-03)', async () => {
  // reportlab: No. | Activity | Days, with wrapping Activity cells; a row inserted as 3. Control: no wrapping.
  for (const id of ['r1-03-w03', 'r1-03-w03c']) {
    const r = await probe(id);
    assert.equal(r.changes.length, 1, `${id}: ${JSON.stringify(listed(r))}`);
    assert.equal(r.ignored.renumbered, 10, id);
  }
  // python-docx via LibreOffice: 30 rows, a row inserted as 4; the row pushed past the page
  // break, under the repeated header row, is renumbered too (R1-13).
  const q09t = await probe('r1-03-q09t');
  assert.equal(q09t.changes.length, 1, JSON.stringify(listed(q09t)));
  assert.ok(q09t.changes[0].new.text.startsWith('4 Interview notes, IT team'), q09t.changes[0].new.text);
  assert.equal(q09t.ignored.renumbered, 27);
});

test('a figure that starts a wrapped line in the text column does not break the clause list (R6-02)', async () => {
  // reportlab, 500 clauses with hanging labels: clause 6 wraps before "50."; a clause inserted as 3, 30 → 45 days.
  const stray = await probe('r6-02-stray');
  assert.deepEqual(numbers(stray), ['Number changed: 30 → 45 (+50%)']);
  assert.equal(stray.ignored.renumbered, 498);
  const ctrl = await probe('r6-02-ctrl');
  assert.deepEqual(numbers(ctrl), ['Number changed: 30 → 45 (+50%)']);
  assert.equal(ctrl.ignored.renumbered, 498);
  // Chromium <ol> of 60 clauses, clause 7 ending on a line "120."; a clause inserted as 2, 14 → 21 days.
  const ol = await probe('r6-02-ol');
  assert.deepEqual(numbers(ol), ['Number changed: 14 → 21 (+50%)']);
  assert.equal(ol.ignored.renumbered, 59);
});
