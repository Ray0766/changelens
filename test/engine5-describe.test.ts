// Smaller description fixes: version and reference numbers, text cut off by
// a new CropBox, text that only stands elsewhere in the reading order (a
// footnote passed over, a repeated header row written late), and a heading
// that crossed a page break past a repeated header row.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openPdf } from '../src/node/pdf.ts';
import { extractText } from '../src/pdf/extract.ts';
import { buildDocModel } from '../src/core/tokenize.ts';
import { compareDocs } from '../src/core/compare.ts';
import { describeChange } from '../src/core/describe.ts';
import type { CompareResult, DocText, TextRun } from '../src/core/types.ts';
import { makeDoc, model } from './helpers.ts';

const text = (r: CompareResult) => r.changes.map((c) => describeChange('en', c));
const P0 = ['The controller is described in this manual for the service technician.'];
const changed = (a: string, b: string) => text(compareDocs(model(makeDoc('a', [[P0, [a]]])), model(makeDoc('b', [[P0, [b]]]))));

test('a version or reference number with letters is a number change, without a percentage', () => {
  assert.deepEqual(changed('Document version V2.3 of the manual.', 'Document version V2.4 of the manual.'), ['Number changed: V2.3 → V2.4']);
  assert.deepEqual(changed('See risk R-15 in the register.', 'See risk R-16 in the register.'), ['Number changed: R-15 → R-16']);
  assert.equal(compareDocs(model(makeDoc('a', [[P0, ['Document version V2.3 of the manual.']]])), model(makeDoc('b', [[P0, ['Document version V2.4 of the manual.']]]))).changes[0].numeric?.fromValue, null);
  // Other letters: a different word, not a number.
  assert.deepEqual(changed('Fill in form 2a first.', 'Fill in form 2b first.'), ['Changed “2a” → “2b”']);
  assert.deepEqual(changed('Use cable V2 here.', 'Use cable W2 here.'), ['Changed “V2” → “W2”']);
});

const cases = new URL('../eval/cases/', import.meta.url).pathname;
async function pdfCase(id: string): Promise<CompareResult> {
  const a = buildDocModel(await extractText(await openPdf(`${cases}${id}/before.pdf`), 'before.pdf'));
  const b = buildDocModel(await extractText(await openPdf(`${cases}${id}/after.pdf`), 'after.pdf'));
  return compareDocs(a, b);
}

test('figures cut off by a new CropBox are one "cut off" finding, not edits of the figures', async () => {
  const r = await pdfCase('holdout4-g-crop-rotate');
  const p4 = r.changes.filter((c) => c.new.pages.includes(3));
  assert.deepEqual(p4.map((c) => describeChange('en', c)), ['Content is cut off at the right edge of the page']);
  // Its old side shows the uncut wording.
  assert.equal(p4[0].old.text, 'EUR) 4,800 2,350 6,900 3,150');
  assert.equal(p4[0].new.text, 'EU 4,8 2,3 6,9 3,1');
  assert.equal(p4[0].old.rects.length, 5);
  assert.ok(!r.changes.some((c) => c.numeric?.to === '4,8'));
});

/** One page whose runs are given as [text, x, baseline] (its width set apart). */
function page(name: string, width: number, runs: [string, number, number][]): DocText {
  const r: TextRun[] = runs.map(([str, x, y]) => ({ str, x, y: y - 9, w: str.length * 5, h: 11, baseline: y, fontSize: 10, font: 'Body', family: 'sans-serif', eol: true, angle: 0 }));
  return { name, pages: [{ index: 0, width, height: 842, runs: r }] };
}

test('a shortened figure that is not at the edge of a narrower page is still a number change', () => {
  const body: [string, number, number][] = [['The planned works for the coming year are listed below.', 56, 100]];
  // Same page width: an edit.
  const a = page('a', 595, [...body, ['Budget 4,800', 480, 130]]);
  const b = page('b', 595, [...body, ['Budget 4,8', 480, 130]]);
  assert.deepEqual(text(compareDocs(buildDocModel(a), buildDocModel(b))), ['Number changed: 4,800 → 4,8']);
  // A narrower page, but the figure ends well inside it: an edit.
  const c = page('c', 555, [...body, ['Budget 4,8', 400, 130]]);
  assert.deepEqual(text(compareDocs(buildDocModel(a), buildDocModel(c))), ['Number changed: 4,800 → 4,8']);
});

test('an unchanged footnote passed over by the alignment is not reported as deleted', async () => {
  // Word document: the inserted clause 4.3 pushed clauses 4.4 and 4.5 onto page 2; footnote 1 stays at the foot of page 1.
  const r = await pdfCase('holdout4-e-docx-services-agreement');
  assert.ok(!r.changes.some((c) => /Public holidays/.test(c.old.text + c.new.text)), JSON.stringify(text(r)));
  const ins = r.changes.find((c) => c.kind === 'insert' && c.new.text.includes('cyber insurance'))!;
  assert.deepEqual(ins.new.pages, [0]);
  // The footnote's words are matched (anchors for the visual stage).
  const fn = r.oldDoc.tokens.find((t) => t.text === 'holidays')!;
  const m = [...r.matches].filter((_, k) => k % 2 === 0);
  assert.ok(m.includes(fn.i));
});

test('a line deleted in one place that reappears inside an inserted passage elsewhere is a move', () => {
  const NOTE = ['The quarterly figures are provisional until the audit is complete.'];
  const A = ['The board met on 3 March and approved the plan.'];
  const B = ['The audit committee reviewed the risk register in detail.'];
  const C = ['Members thanked the secretary for the minutes of the year.'];
  const X = ['A new working group on accessibility was set up by the board.', 'It reports to the board twice a year on its findings.'];
  const Y = ['The chair will write to all members about the new group soon.', 'Comments on the proposal are welcome until the end of May.'];
  const r = compareDocs(model(makeDoc('a', [[A, B, C, NOTE, ['End of the minutes for this meeting of the board.']]])), model(makeDoc('b', [[A, X, NOTE, Y, B, C, ['End of the minutes for this meeting of the board.']]])));
  const moves = r.changes.filter((c) => c.kind === 'move');
  assert.equal(moves.length, 1, JSON.stringify(text(r)));
  assert.equal(moves[0].new.text, NOTE[0]);
  assert.ok(!r.changes.some((c) => c.kind === 'insert' && c.new.text.includes('provisional')), JSON.stringify(text(r)));
});

test('text at the same place on the page that only comes elsewhere in the reading order is not a change', () => {
  // A repeated table header row written after the rows in one version, before them in the other.
  const H: [string, number, number] = ['Code Line item FY2025 actual Change', 56, 60];
  const rows: [string, number, number][] = [
    ['6401 Cleaning contract 184,000', 56, 80],
    ['6402 Window cleaning 12,000', 56, 95],
    ['6403 Waste collection 31,000', 56, 110],
  ];
  const a = page('a', 595, [...rows, H]);
  const b = page('b', 595, [H, ...rows]);
  const r = compareDocs(buildDocModel(a), buildDocModel(b));
  assert.deepEqual(text(r), []);
  // The same line at another place is still a move.
  const c = page('c', 595, [[H[0], 56, 200], ...rows]);
  assert.deepEqual(r.changes.length, 0);
  assert.deepEqual(text(compareDocs(buildDocModel(a), buildDocModel(c))).map((d) => d.startsWith('Moved')), [true]);
});

test('repeated header rows and a group heading that only crossed a page break are not listed (spreadsheet PDFs)', async () => {
  // LibreOffice Calc writes the wrapped header cells of page 1 after its last row.
  const f = await pdfCase('holdout4-e-xlsx-facilities-budget');
  assert.ok(!f.changes.some((c) => c.kind === 'move'), JSON.stringify(text(f)));
  // The "Motors" heading moved from the foot of page 2 to the top of page 3, below the repeated header row.
  const s = await pdfCase('holdout4-e-xlsx-spare-parts-prices');
  assert.ok(!s.changes.some((c) => c.kind === 'move' || /^Motors$/.test(c.old.text) || /^Motors$/.test(c.new.text)), JSON.stringify(text(s)));
  // Every real edit is still there.
  assert.deepEqual(
    s.changes.map((c) => c.kind),
    ['replace', 'insert', 'replace', 'replace', 'delete', 'replace', 'replace'],
  );
});
