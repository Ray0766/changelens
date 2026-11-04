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
  // The redline shows 4.3 → 4.2 and 4.4 → 4.3 (the deleted clause is not shown).
  const T = ['Records are kept for six years.', 'Paper records may be scanned after review.', 'Working copies are kept only while needed.'];
  const redline = clauses('redline', [['4.1', T[0]], ['4.2[4.3]', T[1]], ['4.3[4.4]', T[2]]]);
  const accepted = clauses('accepted', [['4.1', T[0]], ['4.2', T[1]], ['4.3', T[2]]]);
  const r = compareDocs(buildDocModel(redline), buildDocModel(accepted));
  // "[4.4]" numbers on from the display above it ("[4.3]"): a consequence. "[4.3]" follows
  // only "4.1", an unchanged label, so nothing shows it was 4.3: listed.
  assert.deepEqual(listed(r), ['Deleted “[4.3]”']);
  assert.deepEqual(minor(r), ['List number shown as a tracked change: “4.3[4.4]”']);
  // A bracketed number that does not follow the label above it is listed.
  const odd = clauses('odd', [['4.1', T[0]], ['4.2', T[1]], ['4.3[4.1]', T[2]]]);
  const plain = clauses('plain', [['4.1', T[0]], ['4.2', T[1]], ['4.3', T[2]]]);
  const o = compareDocs(buildDocModel(odd), buildDocModel(plain));
  assert.deepEqual(listed(o), ['Deleted “[4.1]”']);
  assert.deepEqual(minor(o), []);
});
