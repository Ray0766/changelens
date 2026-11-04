// A tracked-change display of a list label ("4.3[4.4]": now 4.3, before
// 4.4) is a consequence only with evidence that it shows a renumbering
// (fix round 8). Round 6 took any line-start "A[B]" with B one level and at
// most 3 from A, so a footnote marker put on (or taken off) a row number
// ("3" → "3[1]") was hidden, and when the footnote already existed nothing
// at all was listed. Now the number kept from the other version must be
// that version's label at the line: the bracketed one (the other version
// is the original), or the outer one, with the bracketed number numbering
// on from the label above it (the other version has the change accepted).
// The PDFs are the round-7 adversarial probes (synthetic), copied to
// test/fixtures/probe8-*; the accepted-version case is built in code.
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
  const a = buildDocModel(await extractText(await openPdf(`${fixtures}probe8-${id}-before.pdf`), 'before.pdf'));
  const b = buildDocModel(await extractText(await openPdf(`${fixtures}probe8-${id}-after.pdf`), 'after.pdf'));
  return compareDocs(a, b);
}
const listed = (r: CompareResult) => r.changes.map((c) => describeChange('en', c));
const minor = (r: CompareResult) => r.minor.map((c) => describeChange('en', c));
const renumberNotice = (r: CompareResult) => notices('en', r).find((n) => n.action === 'minor' && /list numbers? changed/.test(n.text));

test('a footnote marker put on or taken off a row number is listed (R1-02)', async () => {
  // Chromium: class 3 of a storage table gets "[1]" and a new footnote.
  const p02 = await probe('r1-02-p02');
  assert.deepEqual(listed(p02), ['Added “[1]”', 'Added a paragraph']);
  assert.equal(p02.newDoc.tokens[p02.changes[0].new.start! - 1].text, '3');
  assert.deepEqual(minor(p02), []);
  assert.equal(renumberNotice(p02), undefined);
  // The reverse: the marker and the footnote removed.
  const p02d = await probe('r1-02-p02d');
  assert.deepEqual(listed(p02d), ['Deleted “[1]”', 'Deleted a paragraph']);
  assert.deepEqual(minor(p02d), []);
  // The marker points to a footnote that already exists: before, nothing at all was listed.
  assert.deepEqual(listed(await probe('r1-02-v02')), ['Added “[1]”']);
  assert.deepEqual(listed(await probe('r1-02-w02')), ['Added “[2]”']);
  // Control: the same marker on a value cell.
  assert.deepEqual(listed(await probe('r1-02-v02c')), ['Added “[1]”']);
});

/** Clauses: the label (or its display) at 56 pt, the text at 110 pt, 20 pt apart. */
function clauses(name: string, rows: [string, string][]): DocText {
  const runs: TextRun[] = [];
  const run = (str: string, x: number, y: number, eol = false): TextRun => ({ str, x, y: y - 9, w: str.length * 5, h: 11, baseline: y, fontSize: 10, font: 'Body', family: 'sans-serif', eol, angle: 0 });
  rows.forEach(([label, text], k) => runs.push(run(label, 56, 80 + 20 * k), run(text, 110, 80 + 20 * k, true)));
  return { name, pages: [{ index: 0, width: 595, height: 842, runs }] };
}

test('a label display compared with the version that has the change accepted (R1-02 control)', () => {
  // The redline shows 4.3 → 4.2 and 4.4 → 4.3, and the deleted clause 4.2 struck through.
  const T = ['Records are kept for six years.', 'Paper records may be scanned after review.', 'Working copies are kept only while needed.', 'A record under a legal hold is not destroyed.'];
  const shown = clauses('redline', [['4.1', T[0]], ['[4.2]', T[3]], ['4.2[4.3]', T[1]], ['4.3[4.4]', T[2]]]);
  const accepted = clauses('accepted', [['4.1', T[0]], ['4.2', T[1]], ['4.3', T[2]]]);
  const s = compareDocs(buildDocModel(shown), buildDocModel(accepted));
  // The deleted clause is listed; "[4.4]" numbers on from the display above it ("[4.3]"),
  // which lies in that listed deletion: a consequence.
  assert.ok(listed(s).some((d) => /^Deleted 11 words/.test(d)), JSON.stringify(listed(s)));
  assert.ok(minor(s).includes('List number shown as a tracked change: “4.3[4.4]”'), JSON.stringify(minor(s)));
  // Without the deleted clause, "[4.3]" follows only "4.1", an unchanged label, so nothing
  // shows it was 4.3: listed. Then it supplies no former number to "[4.4]" either (second
  // pass: a display judged an edit is no evidence for the one below it), so both are listed.
  const redline = clauses('redline', [['4.1', T[0]], ['4.2[4.3]', T[1]], ['4.3[4.4]', T[2]]]);
  const r = compareDocs(buildDocModel(redline), buildDocModel(accepted));
  assert.deepEqual(listed(r), ['Deleted “[4.3]”', 'Deleted “[4.4]”']);
  assert.deepEqual(minor(r), []);
  // A bracketed number that does not follow the label above it is listed.
  const odd = clauses('odd', [['4.1', T[0]], ['4.2', T[1]], ['4.3[4.1]', T[2]]]);
  const plain = clauses('plain', [['4.1', T[0]], ['4.2', T[1]], ['4.3', T[2]]]);
  const o = compareDocs(buildDocModel(odd), buildDocModel(plain));
  assert.deepEqual(listed(o), ['Deleted “[4.1]”']);
  assert.deepEqual(minor(o), []);
});

test('a footnote marker on the next row is listed when the marker above it is listed (R1-02, second pass)', async () => {
  // Chromium: a footnote [1] exists; markers [3] and [4] are put on classes 2 and 3
  // ("2[3]", "3[4]") with two new footnotes. "2[3]" is listed as an added marker, so it
  // cannot show that class 3 was class 4 before.
  for (const [id, swap] of [['r1-02-cr2', false], ['r1-02-cr2', true]] as const) {
    const a = buildDocModel(await extractText(await openPdf(`${fixtures}probe8-${id}-${swap ? 'after' : 'before'}.pdf`), 'a.pdf'));
    const b = buildDocModel(await extractText(await openPdf(`${fixtures}probe8-${id}-${swap ? 'before' : 'after'}.pdf`), 'b.pdf'));
    const r = compareDocs(a, b);
    const verb = swap ? 'Deleted' : 'Added';
    assert.deepEqual(listed(r), [`${verb} “[3]”`, `${verb} “[4]”`, `${verb} 2 paragraphs`], `swap ${swap}`);
    assert.deepEqual(minor(r), [], `swap ${swap}`);
    assert.equal(renumberNotice(r), undefined, `swap ${swap}`);
  }
  // Control: the markers on classes 3 and 4 ("3[3]", "4[4]"), listed before as well.
  const cr1 = await probe('r1-02-cr1');
  assert.deepEqual(listed(cr1), ['Added “[3]”', 'Added “[4]”', 'Added 2 paragraphs']);
  assert.deepEqual(minor(cr1), []);
});
