// Label forms that were not read as labels (fix round 8): clause numbers
// with a trailing stop ("4.3.", Word's "1. / 1.1. / 1.1.1." style), whose
// stop is a token of its own, and full-width digits ("１．", common in
// Japanese documents). Their renumbering was listed, with percentages. The
// PDFs are the round-7 adversarial probes (synthetic; Chromium, reportlab,
// python-docx via LibreOffice), copied to test/fixtures/probe8-*.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openPdf } from '../src/node/pdf.ts';
import { extractText } from '../src/pdf/extract.ts';
import { buildDocModel } from '../src/core/tokenize.ts';
import { compareDocs } from '../src/core/compare.ts';
import { describeChange } from '../src/core/describe.ts';
import type { CompareResult, DocText, TextRun } from '../src/core/types.ts';

const fixtures = new URL('./fixtures/', import.meta.url).pathname;
async function probe(id: string): Promise<CompareResult> {
  const a = buildDocModel(await extractText(await openPdf(`${fixtures}probe8-${id}-before.pdf`), 'before.pdf'));
  const b = buildDocModel(await extractText(await openPdf(`${fixtures}probe8-${id}-after.pdf`), 'after.pdf'));
  return compareDocs(a, b);
}
const listed = (r: CompareResult) => r.changes.map((c) => describeChange('en', c));
const minor = (r: CompareResult) => r.minor.map((c) => describeChange('en', c).replace('List renumbered: ', ''));

/** Paragraphs as a word processor sets them: the label, then the text after a tab; 20 pt apart. */
function items(name: string, rows: [string, string][]): DocText {
  const runs: TextRun[] = [];
  const run = (str: string, x: number, y: number, eol = false): TextRun => ({ str, x, y: y - 9, w: str.length * 5, h: 11, baseline: y, fontSize: 10, font: 'Body', family: 'sans-serif', eol, angle: 0 });
  rows.forEach(([label, text], k) => runs.push(run(label, 56, 80 + 20 * k), run(text, 100, 80 + 20 * k, true)));
  return { name, pages: [{ index: 0, width: 595, height: 842, runs }] };
}
const P = ['Each party keeps the other informed.', 'Notices are given in writing.', 'A change takes effect when both sign it.', 'The Supplier may not assign this agreement.'];
const compare = (a: DocText, b: DocText) => compareDocs(buildDocModel(a), buildDocModel(b));

test('clause labels with a trailing stop ("4.3.") are renumbered after an inserted clause (R1-07)', async () => {
  // Chromium: 4.2. inserted; 4.2.–4.4. become 4.3.–4.5. Control: the same labels without the stop.
  for (const id of ['r1-07-p07', 'r1-07-p07c']) {
    const r = await probe(id);
    assert.deepEqual(listed(r), ['Added a paragraph'], id);
    assert.ok(/^4\.2\.? Where a change is needed urgently/.test(r.changes[0].new.text), r.changes[0].new.text);
    assert.deepEqual(minor(r), ['4.2 → 4.3', '4.3 → 4.4', '4.4 → 4.5'], id);
  }
  // Word multilevel numbering "%1.%2." via LibreOffice: a clause inserted as 2.2.
  const q02 = await probe('r1-07-q02');
  assert.deepEqual(listed(q02), ['Added a paragraph']);
  assert.deepEqual(minor(q02), ['2.2 → 2.3', '2.3 → 2.4', '2.4 → 2.5']);
  // reportlab: labels in a 34 pt column, a clause inserted as 3.2.
  const w07t = await probe('r1-07-w07t');
  assert.equal(w07t.changes.length, 1, JSON.stringify(listed(w07t)));
  assert.deepEqual(minor(w07t), ['3.2 → 3.3', '3.3 → 3.4', '3.4 → 3.5', '3.5 → 3.6']);
});

test('a trailing-stop label changed by hand is listed, without a percentage (R1-07 control)', () => {
  const old: [string, string][] = P.map((t, k) => [`4.${k + 1}.`, t]);
  const byHand = old.map(([l, t], k): [string, string] => [k === 2 ? '4.4.' : l, t]);
  assert.deepEqual(listed(compare(items('a', old), items('b', byHand))), ['Number changed: 4.3 → 4.4']);
});

test('full-width list labels ("１．") are renumbered after an inserted item (R1-08)', async () => {
  // Chromium, IPAGothic: an item inserted as ３．
  const p10 = await probe('r1-08-p10');
  assert.deepEqual(listed(p10), ['Added “３． 緊急の故障には、連絡を受けてから四時間以内に対応する。”']);
  assert.deepEqual(minor(p10), ['３ → ４', '４ → ５']);
  // python-docx via LibreOffice: typed "１．" + tab, an item inserted as ２. Control: ASCII "1.".
  const w08 = await probe('r1-08-w08');
  assert.deepEqual(listed(w08), ['Added “２． 従業員は、私用の電話を勤務中に控えなければならない。”']);
  assert.deepEqual(minor(w08), ['２ → ３', '３ → ４', '４ → ５']);
  const w08c = await probe('r1-08-w08c');
  assert.deepEqual(listed(w08c), ['Added “2. 従業員は、私用の電話を勤務中に控えなければならない。”']);
  assert.deepEqual(minor(w08c), ['2 → 3', '3 → 4', '4 → 5']);
});

test('full-width labels changed by hand are listed, without a percentage (R1-08 control)', () => {
  const old: [string, string][] = P.map((t, k) => [`${String.fromCharCode(0xff11 + k)}．`, t]);
  const byHand = old.map(([l, t], k): [string, string] => [k === 2 ? '４．' : l, t]);
  assert.deepEqual(listed(compare(items('a', old), items('b', byHand))), ['Number changed: ３ → ４']);
});

test('single-line clauses set without paragraph spacing are read as a column of labels (R1-14)', async () => {
  // Chromium, LibreOffice (Word numbering, space after 0) and reportlab: 5.3 (6.3) inserted.
  for (const [id, first] of [['r1-14-p19', '5.3'], ['r1-14-q10', '5.3'], ['r1-14-w14', '6.3']]) {
    const r = await probe(id);
    assert.equal(r.changes.length, 1, `${id}: ${JSON.stringify(listed(r))}`);
    assert.ok(r.changes[0].new.text.startsWith(`${first} `), r.changes[0].new.text);
    assert.ok(r.ignored.renumbered >= 5, `${id}: ${r.ignored.renumbered}`);
    assert.ok(!r.changes.some((c) => c.numeric), id);
  }
  // Control: one clause wraps onto a hanging line.
  const w = await probe('r1-14-p19w');
  assert.equal(w.changes.length, 1, JSON.stringify(listed(w)));
});

test('single-line clauses renumbered by hand are listed, without a percentage (R1-14 control)', () => {
  // One block: the lines are 13 pt apart, with no paragraph spacing, under the heading of clause 5.
  const runs: TextRun[] = [];
  const run = (str: string, x: number, y: number, eol = false): TextRun => ({ str, x, y: y - 9, w: str.length * 5, h: 11, baseline: y, fontSize: 10, font: 'Body', family: 'sans-serif', eol, angle: 0 });
  const doc = (name: string, labels: string[], heading = true): DocText => {
    runs.length = 0;
    if (heading) runs.push(run('5.', 56, 56), run('Charges', 100, 56, true));
    labels.forEach((l, k) => runs.push(run(l, 56, 80 + 13 * k), run(P[k], 100, 80 + 13 * k, true)));
    return { name, pages: [{ index: 0, width: 595, height: 842, runs: [...runs] }] };
  };
  const r = compare(doc('a', ['5.1', '5.2', '5.3', '5.4']), doc('b', ['5.1', '5.2', '5.4', '5.5']));
  assert.deepEqual(listed(r), ['Number changed: 5.3 → 5.4', 'Number changed: 5.4 → 5.5']);
  // Without a clause 5 above them they may be a column of measures (second pass): they keep
  // their percentage.
  const m = compare(doc('a', ['5.1', '5.2', '5.3', '5.4'], false), doc('b', ['5.1', '5.2', '5.4', '5.5'], false));
  assert.deepEqual(listed(m), ['Number changed: 5.3 → 5.4 (+1.9%)', 'Number changed: 5.4 → 5.5 (+1.9%)']);
});

test('a long tight list is read as labels however far below its parent clause it runs (R1-14, second pass)', () => {
  // "5. Charges" and then 300 single-line clauses 13 pt apart, over several pages; 5.3 inserted.
  const doc = (name: string, ins: boolean): DocText => {
    const pages: DocText['pages'] = [];
    let runs: TextRun[] = [];
    let y = 60;
    const run = (str: string, x: number, yy: number, eol = false): TextRun => ({ str, x, y: yy - 9, w: str.length * 5, h: 11, baseline: yy, fontSize: 10, font: 'Body', family: 'sans-serif', eol, angle: 0 });
    runs.push(run('5.', 56, y), run('Charges', 100, y, true));
    y += 24;
    const w = ['invoices', 'are', 'sent', 'monthly', 'payment', 'due', 'within', 'thirty', 'days', 'credit', 'notes', 'issued'];
    const rows = Array.from({ length: 300 }, (_, k) => `${w[k % 12]} ${w[(k * 7) % 12]} ${w[(k * 5) % 12]} item ${k}`);
    if (ins) rows.splice(2, 0, 'a new clause inserted here');
    rows.forEach((t, k) => {
      if (y > 800) {
        pages.push({ index: pages.length, width: 595, height: 842, runs });
        runs = [];
        y = 60;
      }
      runs.push(run(`5.${k + 1}`, 56, y), run(t, 100, y, true));
      y += 13;
    });
    pages.push({ index: pages.length, width: 595, height: 842, runs });
    return { name, pages };
  };
  const r = compare(doc('a', false), doc('b', true));
  assert.ok(listed(r).includes('Added “5.3 a new clause inserted here”'), JSON.stringify(listed(r).slice(0, 5)));
  assert.deepEqual(r.changes.filter((c) => c.numeric).map((c) => describeChange('en', c)), []);
  assert.ok(r.ignored.renumbered >= 296, String(r.ignored.renumbered));
});

test('a tight table of measures numbered on from 2.1 is not a clause list (R1-14, second pass)', async () => {
  // Chromium: board thickness by use, mm, a table without row spacing and with no clause 2
  // above it. A use is inserted as the third row and the thicknesses of the later rows are
  // changed (2.3 → 2.4 …): real value edits, listed as at b3de0f4.
  for (const swap of [false, true]) {
    const [x, y] = swap ? ['after', 'before'] : ['before', 'after'];
    const r = compareDocs(
      buildDocModel(await extractText(await openPdf(`${fixtures}probe8-r1-14-cf2-${x}.pdf`), 'a.pdf')),
      buildDocModel(await extractText(await openPdf(`${fixtures}probe8-r1-14-cf2-${y}.pdf`), 'b.pdf')),
    );
    const numbers = r.changes.filter((c) => c.numeric).map((c) => `${c.numeric!.from} → ${c.numeric!.to}`);
    assert.deepEqual(numbers, swap ? ['2.5 → 2.4', '2.6 → 2.5', '2.7 → 2.6'] : ['2.4 → 2.5', '2.5 → 2.6', '2.6 → 2.7'], `swap ${swap}`);
    assert.ok(r.changes.every((c) => !c.numeric || c.numeric.fromValue !== null), `swap ${swap}`);
    assert.deepEqual(minor(r), [], `swap ${swap}`);
  }
});

test('a contents page number after a leader gets no percentage; other line-end figures keep theirs (R1-15)', () => {
  const line = (name: string, str: string): DocText => ({ name, pages: [{ index: 0, width: 595, height: 842, runs: [{ str, x: 56, y: 71, w: str.length * 5, h: 11, baseline: 80, fontSize: 10, font: 'Body', family: 'sans-serif', eol: true, angle: 0 }] }] });
  // A run of full stops (one token), spaced stops (Chromium dot leaders) and an ellipsis leader.
  for (const leader of ['..........', '. . . . . .', '…………']) {
    const r = compare(line('a', `5. Change control ${leader} 1`), line('b', `5. Change control ${leader} 2`));
    assert.deepEqual(listed(r), ['Number changed: 1 → 2'], leader);
  }
  assert.deepEqual(listed(compare(line('a', 'Spare filters in stock: 1'), line('b', 'Spare filters in stock: 2'))), ['Number changed: 1 → 2 (+100%)']);
});

test('an annex clause label ("A.3") renumbered is listed without a percentage (R1-10, part)', () => {
  const line = (name: string, str: string): DocText => ({ name, pages: [{ index: 0, width: 595, height: 842, runs: [{ str, x: 56, y: 71, w: str.length * 5, h: 11, baseline: 80, fontSize: 10, font: 'Body', family: 'sans-serif', eol: true, angle: 0 }] }] });
  assert.deepEqual(listed(compare(line('a', 'A.3 Data is backed up daily.'), line('b', 'A.4 Data is backed up daily.'))), ['Number changed: 3 → 4']);
  // A figure in running text keeps its percentage.
  assert.deepEqual(listed(compare(line('a', 'Keep 3 copies of each backup.'), line('b', 'Keep 4 copies of each backup.'))), ['Number changed: 3 → 4 (+33%)']);
});
