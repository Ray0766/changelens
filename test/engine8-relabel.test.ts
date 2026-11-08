// An item inserted into (or deleted from) a numbered list starts at its own
// label (fix round 8). The diff tends to match the old label just before an
// insertion with the inserted item's label, and to end the insertion with
// the next item's new label. relabel moved that pairing for one-token labels
// ("4.3") only. A label "4." is two tokens ("4" + "."), and a definition may
// start with an opening quote ("1.3 “Change”"), so those insertions started
// after the label: whole paragraphs were counted one short, and after an
// inserted section the old heading was matched to the inserted one, so its
// clauses' new numbers were listed. The old label and the new one must now
// also be in the same role, so a step inserted at the end of a step list
// does not take the label of the heading below it. The PDFs are the
// round-7 adversarial probes (synthetic), copied to test/fixtures/probe8-*.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openPdf } from '../src/node/pdf.ts';
import { extractText } from '../src/pdf/extract.ts';
import { buildDocModel } from '../src/core/tokenize.ts';
import { compareDocs } from '../src/core/compare.ts';
import { describeChange } from '../src/core/describe.ts';
import type { CompareResult, DocText, TextRun } from '../src/core/types.ts';

const fixtures = new URL('./fixtures/', import.meta.url).pathname;
/** Compares probe8-<id>-before.pdf with probe8-<id>-after.pdf (swapped with `reverse`). */
async function probe(id: string, reverse = false): Promise<CompareResult> {
  const [x, y] = reverse ? ['after', 'before'] : ['before', 'after'];
  const a = buildDocModel(await extractText(await openPdf(`${fixtures}probe8-${id}-${x}.pdf`), 'before.pdf'));
  const b = buildDocModel(await extractText(await openPdf(`${fixtures}probe8-${id}-${y}.pdf`), 'after.pdf'));
  return compareDocs(a, b);
}
const listed = (r: CompareResult) => r.changes.map((c) => describeChange('en', c));
const minor = (r: CompareResult) => r.minor.map((c) => describeChange('en', c).replace('List renumbered: ', ''));

test('a whole section inserted or deleted: its heading and every shifted clause are renumbering (R1-04)', async () => {
  // Word multilevel numbering via LibreOffice: section "3. Service credits" (two clauses) inserted.
  const q04 = await probe('r1-04-q04');
  assert.deepEqual(listed(q04), ['Added 3 paragraphs']);
  assert.ok(q04.changes[0].new.text.startsWith('3. Service credits 3.1 If the Supplier'), q04.changes[0].new.text);
  assert.deepEqual(minor(q04).slice(0, 4), ['3 → 4', '3.1 → 4.1', '3.2 → 4.2', '4 → 5']);
  assert.equal(q04.ignored.renumbered, 20);
  // The same, read the other way: a section deleted.
  const back = await probe('r1-04-q04', true);
  assert.deepEqual(listed(back), ['Deleted 3 paragraphs']);
  assert.equal(back.ignored.renumbered, 20);
  // Section "3. Charges and payment" (three clauses) deleted.
  const q05 = await probe('r1-04-q05');
  assert.deepEqual(listed(q05), ['Deleted 3 paragraphs']);
  assert.ok(q05.changes[0].old.text.startsWith('3. Charges and payment'), q05.changes[0].old.text);
  assert.deepEqual(minor(q05).slice(0, 4), ['4 → 3', '4.1 → 3.1', '4.2 → 3.2', '4.3 → 3.3']);
  // Chromium, typed labels: section "2. Term" with its clauses deleted.
  const v04 = await probe('r1-04-v04');
  assert.deepEqual(listed(v04), ['Deleted 4 paragraphs']);
  assert.ok(v04.changes[0].old.text.startsWith('2. Term 2.1'), v04.changes[0].old.text);
  assert.equal(v04.ignored.renumbered, 11);
  // Control: a real edit in a later section is still listed.
  assert.deepEqual(listed(await probe('r1-04-q04e')), ['Added 3 paragraphs', 'Added “twice”']);
});

test('inserted or deleted "N." items are counted as whole paragraphs from their label (R1-V01)', async () => {
  // Three fees inserted as 2–4 in a typed "1."–"6." list.
  const r = await probe('r1-v01-v11c');
  assert.deepEqual(listed(r), ['Added 3 paragraphs']);
  assert.equal(r.changes[0].new.text, '2. Data migration per database. 3. Custom report per report. 4. Extra sandbox per month.');
  assert.deepEqual(minor(r), ['2 → 5', '3 → 6', '4 → 7', '5 → 8', '6 → 9']);
  const back = await probe('r1-v01-v11c', true);
  assert.deepEqual(listed(back), ['Deleted 3 paragraphs']);
  assert.equal(back.changes[0].old.text, '2. Data migration per database. 3. Custom report per report. 4. Extra sandbox per month.');
});

test('inserted definitions start at their label and opening quote (R1-16)', async () => {
  // "1.3 “Change Note” …" and "1.4 “Change Request” …" inserted; 1.3–1.6 become 1.5–1.8.
  const r = await probe('r1-16-p08c');
  assert.deepEqual(listed(r), ['Added 2 paragraphs']);
  assert.ok(r.changes[0].new.text.startsWith('1.3 “Change Note” means'), r.changes[0].new.text);
  assert.ok(r.changes[0].new.text.endsWith('a written request for a change.'), r.changes[0].new.text);
  assert.deepEqual(minor(r), ['1.3 → 1.5', '1.4 → 1.6', '1.5 → 1.7', '1.6 → 1.8']);
});

test('a step inserted at the end of a step list does not take the next heading’s label (R1-01, R1-04)', async () => {
  // LibreOffice: step 4 appended under heading 3, heading "4." changed to "5." by hand.
  const w01 = await probe('r1-01-w01');
  assert.deepEqual(listed(w01), ['Added a paragraph', 'Number changed: 4 → 5']);
  assert.ok(w01.changes[0].new.text.startsWith('4. Take a photograph'), w01.changes[0].new.text);
  // Control: the step alone.
  assert.deepEqual(listed(await probe('r1-01-w01c')), ['Added a paragraph']);
  // Chromium nested <ol>: sub-step 3 inserted, top-level step 3 retyped as "4".
  const p16h = await probe('r1-04-p16h');
  assert.deepEqual(listed(p16h), ['Added “3. Unplug the sensor cable behind the cover.”', 'Number changed: 3 → 4']);
  assert.equal(p16h.ignored.renumbered, 0);
  assert.deepEqual(listed(await probe('r1-04-p16hc')), ['Added “3. Unplug the sensor cable behind the cover.”']);
});

test('a formatting change on the first words of an item that relabel paired anew is listed', () => {
  // "２． 従業員は、" starts both items: relabel pairs those words with the next item's.
  type Row = [string, string, string?];
  const items = (name: string, rows: Row[]): DocText => {
    const runs: TextRun[] = [];
    const run = (str: string, x: number, y: number, font: string, eol = false): TextRun => ({ str, x, y: y - 9, w: str.length * 10, h: 11, baseline: y, fontSize: 10, font, family: 'sans-serif', eol, angle: 0 });
    rows.forEach(([label, text, bold], k) => {
      const y = 80 + 20 * k;
      runs.push(run(label, 56, y, 'Body'));
      if (bold) runs.push(run(bold, 90, y, 'Body-Bold'), run(text, 90 + bold.length * 10, y, 'Body', true));
      else runs.push(run(text, 90, y, 'Body', true));
    });
    return { name, pages: [{ index: 0, width: 595, height: 842, runs }] };
  };
  const old: Row[] = [['１．', '従業員は、始業時刻までに出勤する。'], ['２．', '従業員は、休暇を届け出る。'], ['３．', '従業員は、安全規則を守る。']];
  // Item ２ inserted; in the old item ２ (now ３) "従業員" set in bold.
  const grown: Row[] = [old[0], ['２．', '従業員は、私用の電話を控える。'], ['３．', 'は、休暇を届け出る。', '従業員'], ['４．', '従業員は、安全規則を守る。']];
  const r = compareDocs(buildDocModel(items('a', old)), buildDocModel(items('b', grown)));
  assert.deepEqual(listed(r), ['Added “２． 従業員は、私用の電話を控える。”', '“従業員” now bold']);
  assert.deepEqual(minor(r), ['２ → ３', '３ → ４']);
});
