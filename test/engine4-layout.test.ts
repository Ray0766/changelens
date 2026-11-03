// Positions, moves, insertion boundaries, page coverage and formatting
// aggregation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareDocs } from '../src/core/compare.ts';
import { describeChange, notices } from '../src/core/describe.ts';
import { buildDocModel } from '../src/core/tokenize.ts';
import type { DocText, TextRun } from '../src/core/types.ts';
import { makeDoc, model } from './helpers.ts';

const describe = (r: ReturnType<typeof compareDocs>, category?: 'text' | 'visual') =>
  r.changes.filter((c) => !category || c.category === category).map((c) => describeChange('en', c));

/** Lines placed by hand: [text, x, baseline]. */
function placed(lines: [string, number, number][], font = 'LiberationSerif', widthFactor = 1): DocText {
  const runs: TextRun[] = lines.map(([str, x, y]) => ({
    str, x, y: y - 9.9, w: str.length * 5.5 * widthFactor, h: 12.1, baseline: y, fontSize: 11, font, family: 'serif', eol: true, angle: 0,
  }));
  return { name: 'x', pages: [{ index: 0, width: 595, height: 842, runs }] };
}

test('a line that re-flowed into the other column is not reported as moved sideways', () => {
  // Two columns of 18 lines; an inserted line in the left column pushes its
  // last line to the top of the right column.
  const left = Array.from({ length: 18 }, (_, k) => `Left column line ${k + 1} of the newsletter text`);
  const right = Array.from({ length: 10 }, (_, k) => `Right column line ${k + 1} of the newsletter text`);
  const col = (texts: string[], x: number): [string, number, number][] => texts.map((t, k) => [t, x, 100 + 18 * k]);
  const a = placed([...col(left, 45), ...col(right, 310)]);
  const b = placed([...col([...left.slice(0, 5), 'An inserted line in the left column', ...left.slice(5, 17)], 45), ...col([left[17], ...right], 310)]);
  const r = compareDocs(buildDocModel(a), buildDocModel(b));
  assert.deepEqual(describe(r), ['Added “An inserted line in the left column”']);
});

test('a stamp moved sideways is reported, also when its font was substituted or it moved down as well', () => {
  const body = Array.from({ length: 8 }, (_, k): [string, number, number] => [`Clause ${k + 1} the supplier delivers the goods within ten days.`, 56, 100 + 16 * k]);
  const stamp = (x: number, y: number): [string, number, number] => ['APPROVED BY THE BOARD', x, y];
  const a = placed([...body, stamp(56, 260)]);
  const moved = (font: string, x: number, y: number) =>
    describe(compareDocs(buildDocModel(a), buildDocModel(placed([...body, stamp(x, y)], font, font === 'LiberationSerif' ? 1 : 1.12))), 'visual').filter((d) =>
      d.includes('moved'),
    );
  assert.deepEqual(moved('LiberationSerif', 356, 260), ['“APPROVED BY THE BOARD” moved 106 mm to the right']);
  assert.deepEqual(moved('DejaVuSans', 356, 260), ['“APPROVED BY THE BOARD” moved 106 mm to the right']);
  // Moved right and well down, away from any column of text: still a move.
  assert.deepEqual(moved('LiberationSerif', 356, 400), ['“APPROVED BY THE BOARD” moved 106 mm to the right']);
});

test('an inserted sentence starts with its first word and ends with its own full stop', () => {
  const P0 = ['The group expects to remain within its covenants for the next twelve months.'];
  const a = model(makeDoc('a', [[P0, ['Net debt is tested every six months. Having considered cash flow forecasts, the directors are satisfied.']]]));
  const b = model(
    makeDoc('b', [[P0, ['Net debt is tested every six months. The lenders have agreed to waive the covenant test at 31 December 2026. Having considered cash flow forecasts, the directors are satisfied.']]]),
  );
  const inserted = (r: ReturnType<typeof compareDocs>) => r.changes.filter((c) => c.category === 'text').map((c) => c.new.text);
  assert.deepEqual(inserted(compareDocs(a, b)), ['The lenders have agreed to waive the covenant test at 31 December 2026.']);
  const c = model(makeDoc('c', [[P0, ['This policy applies to all records. It applies wherever the records are held.']]]));
  const d = model(makeDoc('d', [[P0, ['This policy applies to all records. It also covers records that contractors hold. It applies wherever the records are held.']]]));
  assert.deepEqual(inserted(compareDocs(c, d)), ['It also covers records that contractors hold.']);
});

const sentences = (topic: string, n: number) =>
  Array.from({ length: n }, (_, k) => [`Paragraph ${k + 1} on ${topic} explains how the ${['supplier', 'buyer', 'agent'][k % 3]} handles case ${k + 1}.`]);

test('an inserted page is not flagged as uncertain; a rewritten page still is', () => {
  const p1 = sentences('delivery', 4);
  const p2 = sentences('payment', 4);
  const inserted = compareDocs(model(makeDoc('a', [p1, p2])), model(makeDoc('b', [p1, sentences('a new annex', 5), p2])));
  assert.deepEqual(inserted.coverage.new.uncertain, []);
  assert.ok(!notices('en', inserted).some((n) => n.text.includes('mostly new content')));
  const rewritten = (k: number) => [[`Entirely different wording ${k} with other terms, numbers ${k * 7} and names such as Alpha${k} Beta${k} Gamma${k} Delta${k}.`]];
  const rw = compareDocs(model(makeDoc('a', [p1, p2, p1])), model(makeDoc('b', [p1, [0, 1, 2, 3].map((k) => rewritten(k)[0]), p1])));
  assert.deepEqual(rw.coverage.new.uncertain?.map((u) => u.page), [1]);
});

test('two paragraphs swapped around a third are two moves, and a table row moved is a move with its edits', () => {
  const P0 = ['This agreement sets out the terms under which the provider delivers services to the client.'];
  const X = ['The monthly service fee is 100 dollars per seat and is payable in advance each month.'];
  const Y = ['Either party may terminate this agreement with thirty days written notice to the other party.'];
  const Z = ['All notices must be delivered in writing to the addresses listed in the schedule below.'];
  const E = ['Disputes are settled by the courts of the city where the provider has its seat.'];
  const r = compareDocs(model(makeDoc('a', [[P0, X, Y, Z, E]])), model(makeDoc('b', [[P0, Z, Y, X, E]])));
  assert.deepEqual(r.changes.map((c) => c.kind), ['move', 'move']);
  const rows = ['Widgets 12 2.50 30.00', 'Bolts 40 0.10 4.00', 'Brackets 7 3.20 22.40', 'Hinges 16 1.75 28.00', 'Screws 300 0.02 6.00'];
  const t = (r: string[]) => model(makeDoc('t', [[['Item Qty Price Total', ...r]]]));
  const rr = compareDocs(t(rows), t([rows[0], rows[2], rows[3], 'Bolts 40 0.10 -4.00', rows[4]]));
  assert.deepEqual(describe(rr, 'text'), ['Moved and edited “Bolts 40 0.10 -4.00”', 'Number changed: 4.00 → -4.00 (sign changed)']);
});

test('rows of two tables with the same labels keep their own changes', () => {
  const regions = ['North', 'South', 'East', 'West'];
  const tbl = (yr: string, f: (i: number) => string) => [`Region Units Status ${yr}`, ...regions.map((r, i) => `${r} ${f(i)}`)];
  const between = ['Some text between the two tables explains the figures.'];
  const a = model(makeDoc('a', [[tbl('2024', (i) => `${100 + i * 10} open`), between, tbl('2025', (i) => `${300 + i * 10} open`)]]));
  const b = model(makeDoc('b', [[tbl('2024', (i) => `${100 + i * 10} open`), between, tbl('2025', (i) => `${350 + i * 10} closed`)]]));
  assert.deepEqual(describe(compareDocs(a, b)), regions.map((_, i) => `Changed “${300 + i * 10} open” → “${350 + i * 10} closed”`));
});

test('every heading made bold is one change', () => {
  const doc = (bold: boolean): DocText => ({
    name: 'h',
    pages: Array.from({ length: 6 }, (_, p) => {
      const runs: TextRun[] = [];
      let y = 90;
      for (let s = 0; s < 2; s++) {
        const h = `Section ${2 * p + s + 1} Terms`;
        runs.push({ str: h, x: 56, y: y - 9.9, w: h.length * 5.5, h: 12.1, baseline: y, fontSize: 11, font: bold ? 'Body-Bold' : 'Body', family: 'serif', eol: true, angle: 0 });
        y += 30;
        for (let k = 0; k < 6; k++, y += 16) {
          const str = `Clause ${k + 1} of section ${2 * p + s + 1} applies to all orders placed under it`;
          runs.push({ str, x: 56, y: y - 9.9, w: str.length * 5.5, h: 12.1, baseline: y, fontSize: 11, font: 'Body', family: 'serif', eol: true, angle: 0 });
        }
        y += 20;
      }
      return { index: p, width: 595, height: 842, runs };
    }),
  });
  assert.deepEqual(describe(compareDocs(buildDocModel(doc(false)), buildDocModel(doc(true)))), ['Formatting changed: now bold (in 12 places)']);
});

test('a compound broken at its own hyphen before a capital or a figure is not a change', () => {
  const P0 = ['The regional office answers all requests from the following areas and programmes.'];
  for (const [broken, whole] of [
    [['Requests from Baden-', 'Württemberg are answered within five days.'], ['Requests from Baden-Württemberg are answered within five days.']],
    [['The plan follows the COVID-', '19 guidance issued last year.'], ['The plan follows the COVID-19 guidance issued last year.']],
  ]) {
    const r = compareDocs(model(makeDoc('a', [[P0, broken]])), model(makeDoc('b', [[P0, whole]])));
    assert.deepEqual(describe(r, 'text'), [], broken.join(' / '));
  }
});

test('a superscript set as a raised run is the same text as the Unicode character or plain digits', () => {
  const runsOf = (parts: [string, boolean][]): DocText => {
    const runs: TextRun[] = [];
    let x = 56;
    for (const [str, raised] of parts) {
      const size = raised ? 7 : 11;
      const baseline = raised ? 296 : 300;
      runs.push({ str, x, y: baseline - size * 0.9, w: str.length * size * 0.5, h: size * 1.1, baseline, fontSize: size, font: 'Body', family: 'serif', eol: false, angle: 0 });
      x += str.length * size * 0.5;
    }
    return { name: 's', pages: [{ index: 0, width: 595, height: 842, runs }] };
  };
  const raised = runsOf([['The site covers 120 m', false], ['2', true], [' and holds H', false], ['2', true], ['O tanks.', false]]);
  const plain = runsOf([['The site covers 120 m² and holds H2O tanks.', false]]);
  assert.deepEqual(describe(compareDocs(buildDocModel(raised), buildDocModel(plain)), 'text'), []);
});
