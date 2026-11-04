// Automatic renumbering, generalised: multi-level clause labels ("8.4" →
// "8.5", "8.4.1" → "8.5.1"), the label of a moved clause, a column of row
// numbers in a table, and tracked-change displays of renumbered labels
// ("4.3[4.4]"). They are consequences (counted, shown on request); a label
// that is not part of a consistent shift is still listed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openPdf } from '../src/node/pdf.ts';
import { extractText } from '../src/pdf/extract.ts';
import { buildDocModel } from '../src/core/tokenize.ts';
import { compareDocs } from '../src/core/compare.ts';
import { describeChange, notices } from '../src/core/describe.ts';
import type { CompareResult, DocText, TextRun } from '../src/core/types.ts';

/**
 * Clauses as a word processor sets them: the label at the clause's indent,
 * the text after a tab, wrapped lines hanging at the text's indent.
 * An item is [label, lines of text, level]; level 1 sub-clauses are
 * indented one step.
 */
function clauses(name: string, items: [string, string[], number?][]): DocText {
  const runs: TextRun[] = [];
  const run = (str: string, x: number, y: number): TextRun => ({ str, x, y: y - 9, w: str.length * 5, h: 11, baseline: y, fontSize: 10, font: 'Body', family: 'sans-serif', eol: false, angle: 0 });
  let y = 80;
  runs.push({ ...run('8. CHANGES TO THE SERVICES', 56, y), eol: true });
  y += 24;
  for (const [label, lines, level = 0] of items) {
    const lx = 56 + 34 * level;
    const tx = lx + 34;
    runs.push(run(label, lx, y));
    lines.forEach((l, k) => {
      runs.push({ ...run(l, tx, y), eol: true });
      y += k === lines.length - 1 ? 20 : 14;
    });
  }
  return { name, pages: [{ index: 0, width: 595, height: 842, runs }] };
}

const text = (r: CompareResult) => r.changes.map((c) => describeChange('en', c));
const minor = (r: CompareResult) => r.minor.map((c) => describeChange('en', c));

const CHANGE = ['Either party may ask for a change to the Services by', 'sending a change request to the other party.'];
const ASSESS = ['The Supplier shall assess each change request within', 'ten Business Days and state the effect on the Charges.'];
const NEW = ['Where a change is needed urgently to protect the', 'security of the Services, the Supplier may make it first.'];
const NOINC = ['The Supplier shall not be entitled to increase the', 'Charges for a change:'];
const SUB = [
  ['that is required because the Supplier failed to perform;'],
  ['that is needed to comply with a change in law; or'],
  ['that the Supplier itself asks for.'],
];

test('clause labels shifted by an inserted clause are a consequence, with their sub-clauses', () => {
  const a = clauses('a', [['8.1', CHANGE], ['8.2', ASSESS], ['8.3', NOINC], ...SUB.map((s, k): [string, string[], number] => [`8.3.${k + 1}`, s, 1])]);
  const b = clauses('b', [['8.1', CHANGE], ['8.2', ASSESS], ['8.3', NEW], ['8.4', NOINC], ...SUB.map((s, k): [string, string[], number] => [`8.4.${k + 1}`, s, 1])]);
  const r = compareDocs(buildDocModel(a), buildDocModel(b));
  // Only the new clause is listed, with its own label.
  assert.equal(r.changes.length, 1, JSON.stringify(text(r)));
  assert.equal(r.changes[0].kind, 'insert');
  assert.match(r.changes[0].new.text, /^8\.3 Where a change is needed urgently/);
  assert.deepEqual(minor(r), ['List renumbered: 8.3 → 8.4', 'List renumbered: 8.3.1 → 8.4.1', 'List renumbered: 8.3.2 → 8.4.2', 'List renumbered: 8.3.3 → 8.4.3']);
  assert.equal(r.ignored.renumbered, 4);
  assert.ok(notices('en', r).some((n) => n.action === 'minor' && n.text.startsWith('4 list numbers changed only because')));
});

test('a clause number edited by hand is still listed, without a percentage', () => {
  const a = clauses('a', [['8.1', CHANGE], ['8.2', ASSESS], ['8.3', NOINC]]);
  const b = clauses('b', [['8.1', CHANGE], ['8.2', ASSESS], ['8.5', NOINC]]);
  const r = compareDocs(buildDocModel(a), buildDocModel(b));
  assert.deepEqual(text(r), ['Number changed: 8.3 → 8.5']);
  assert.equal(r.ignored.renumbered, 0);
  // Two levels at once is not a renumbering either, even below an insertion:
  // the new label stays in a listed change.
  const c = clauses('c', [['8.1', CHANGE], ['8.2', ASSESS], ['8.3', NEW], ['9.4', NOINC]]);
  const rc = compareDocs(buildDocModel(a), buildDocModel(c));
  assert.equal(rc.ignored.renumbered, 0);
  assert.ok(rc.changes.some((ch) => ch.new.text.includes('9.4')), JSON.stringify(text(rc)));
});

test('a figure that starts a wrapped line is not a clause label', () => {
  // "8.4 per cent" wraps to the start of a line, a normal space after it.
  const para = (n: string): DocText => {
    const runs: TextRun[] = [];
    const lines = ['The survey was sent to all members of the', 'association in March and the response rate was', `${n} per cent of the members asked.`, 'A new question about the newsletter was added.'];
    lines.forEach((l, k) => runs.push({ str: l, x: 56, y: 80 + 14 * k - 9, w: l.length * 5, h: 11, baseline: 80 + 14 * k, fontSize: 10, font: 'Body', family: 'sans-serif', eol: true, angle: 0 }));
    return { name: n, pages: [{ index: 0, width: 595, height: 842, runs }] };
  };
  const r = compareDocs(buildDocModel(para('8.4')), buildDocModel(para('8.5')));
  assert.deepEqual(text(r), ['Number changed: 8.4 → 8.5 (+1.2%)']);
});

/** A table with a row number in its first column (one row per paragraph). */
function table(name: string, rows: string[][]): DocText {
  const runs: TextRun[] = [];
  rows.forEach((cells, k) => {
    const y = 100 + 20 * k;
    cells.forEach((c, j) => runs.push({ str: c, x: [56, 90, 300, 420][j], y: y - 9, w: c.length * 5, h: 11, baseline: y, fontSize: 10, font: 'Body', family: 'sans-serif', eol: j === cells.length - 1, angle: 0 }));
  });
  return { name, pages: [{ index: 0, width: 595, height: 842, runs }] };
}
const ITEMS = [
  ['Centrifuge, benchtop', 'BC-5', '9,800.00'],
  ['Inverted microscope', 'IM-310', '52,700.00'],
  ['Fluorescence microscope', 'FM-560', '148,000.00'],
  ['Thermal cycler', 'TC-96G', '31,500.00'],
  ['Microplate reader', 'MR-900', '46,300.00'],
  ['Microplate washer', 'MW-96', '18,900.00'],
];
const numbered = (items: string[][]) => items.map((r, k) => [String(k + 1), ...r]);

test('row numbers that shift after an inserted row are a consequence', () => {
  const b = [...ITEMS.slice(0, 2), ['Mini centrifuge', 'MC-7', '1,350.00'], ...ITEMS.slice(2)];
  const r = compareDocs(buildDocModel(table('a', numbered(ITEMS))), buildDocModel(table('b', numbered(b))));
  assert.equal(r.changes.length, 1, JSON.stringify(text(r)));
  assert.match(r.changes[0].new.text, /^3 Mini centrifuge MC-7 1,350.00$/);
  assert.deepEqual(minor(r), ['List renumbered: 3 → 4', 'List renumbered: 4 → 5', 'List renumbered: 5 → 6', 'List renumbered: 6 → 7']);
  // Deleting a row: the numbers below go down.
  const d = compareDocs(buildDocModel(table('a', numbered(ITEMS))), buildDocModel(table('d', numbered([...ITEMS.slice(0, 1), ...ITEMS.slice(2)]))));
  assert.equal(d.changes.length, 1, JSON.stringify(text(d)));
  assert.equal(d.changes[0].kind, 'delete');
  assert.equal(d.ignored.renumbered, 4);
});

test('row numbers that do not follow a consistent run are listed', () => {
  // One row number edited by hand, no row added or removed.
  const b = numbered(ITEMS);
  b[3][0] = '7';
  const r = compareDocs(buildDocModel(table('a', numbered(ITEMS))), buildDocModel(table('b', b)));
  assert.deepEqual(text(r), ['Number changed: 4 → 7 (+75%)']);
  // A column of figures that all went up by one, with no row added: listed.
  const qty = (n: number) => ITEMS.map((row, k) => [String(n + k), ...row]);
  const q = compareDocs(buildDocModel(table('a', qty(10))), buildDocModel(table('b', qty(11))));
  assert.equal(q.changes.length, 6, JSON.stringify(text(q)));
  assert.equal(q.ignored.renumbered, 0);
});

const cases = new URL('../eval/cases/', import.meta.url).pathname;
async function pdfCase(id: string): Promise<CompareResult> {
  const a = buildDocModel(await extractText(await openPdf(`${cases}${id}/before.pdf`), 'before.pdf'));
  const b = buildDocModel(await extractText(await openPdf(`${cases}${id}/after.pdf`), 'after.pdf'));
  return compareDocs(a, b);
}

test('a moved clause takes the number of its new place: "Moved", not "Moved and edited"', async () => {
  // Word document: clause 7.2 moved to become 3.4; clause 4.3 inserted, so 4.3 and 4.4 become 4.4 and 4.5.
  const r = await pdfCase('holdout4-e-docx-services-agreement');
  const move = r.changes.find((c) => c.kind === 'move')!;
  assert.equal(describeChange('en', move), 'Moved “3.4 Subcontracting. The Supplie…”');
  assert.equal(move.moveEdits, undefined);
  assert.ok(!r.changes.some((c) => c.numeric && /^\d\.\d$/.test(c.numeric.from)), JSON.stringify(text(r)));
  assert.deepEqual(minor(r).filter((d) => d.startsWith('List')), ['List renumbered: 7.2 → 3.4', 'List renumbered: 4.3 → 4.4', 'List renumbered: 4.4 → 4.5']);
  // The inserted clause starts with its own label.
  assert.ok(r.changes.some((c) => c.kind === 'insert' && c.new.text.startsWith('4.3 The Supplier shall maintain cyber insurance')));
});

test('a table’s row numbers after an inserted row (Word numbered list) are not listed', async () => {
  const r = await pdfCase('holdout4-e-docx-zh-en-supply-annex');
  // No "7 → 8", "8 → 9" … left in the list ("45 → 60" in the text is a real edit).
  assert.ok(!r.changes.some((c) => c.numeric && /^\d{1,2}$/.test(c.numeric.from) && Number(c.numeric.to) === Number(c.numeric.from) + 1), JSON.stringify(text(r)));
  assert.ok(text(r).includes('Number changed: 45 → 60 (+33%)'));
  assert.ok(r.ignored.renumbered >= 28, String(r.ignored.renumbered));
  assert.ok(r.changes.some((c) => c.kind === 'insert' && c.new.text.startsWith('6 小型离心机')));
});

test('a tracked-change display of renumbered list labels ("4.3[4.4]", "[4.3]") is a consequence', async () => {
  const r = await pdfCase('holdout4-e-docx-retention-redline');
  assert.ok(!r.changes.some((c) => /^[\d.]*\[|^\]$/.test(c.new.text)), JSON.stringify(text(r)));
  assert.deepEqual(minor(r), ['List number shown as a tracked change: “[4.3]”', 'List number shown as a tracked change: “4.3[4.4]”']);
  assert.equal(r.ignored.renumbered, 2);
});
