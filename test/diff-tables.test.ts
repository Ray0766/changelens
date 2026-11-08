// Tables and adjacent edits: every revised figure stays its own change with
// its own percentage and sign check, and edits in different paragraphs are
// never joined into one made-up change.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareDocs } from '../src/core/compare.ts';
import { intern, matchSequences, type MatchInfo } from '../src/core/diff.ts';
import { describeChange, notices } from '../src/core/describe.ts';
import { makeDoc, model } from './helpers.ts';

const intro = ['The following order lists the supplies delivered to the office this quarter.'];
const outro = ['Prices include delivery and are valid until the end of the year.'];
const run = (a: string[][][], b: string[][][]) => compareDocs(model(makeDoc('a', a)), model(makeDoc('b', b)));
const described = (r: ReturnType<typeof compareDocs>) => r.changes.map((c) => describeChange('en', c));

test('a fully revised table gives one number change per cell', () => {
  const before = ['Item Qty Price', 'Pens 10 2.50', 'Ink 4 8.00', 'Pad 12 1.20', 'Tape 6 0.90'];
  const after = ['Item Qty Price', 'Pens 12 2.75', 'Ink 5 8.40', 'Pad 10 1.10', 'Tape 8 0.95'];
  const expected = [
    'Number changed: 10 → 12 (+20%)',
    'Number changed: 2.50 → 2.75 (+10%)',
    'Number changed: 4 → 5 (+25%)',
    'Number changed: 8.00 → 8.40 (+5%)',
    'Number changed: 12 → 10 (-17%)',
    'Number changed: 1.20 → 1.10 (-8.3%)',
    'Number changed: 6 → 8 (+33%)',
    'Number changed: 0.90 → 0.95 (+5.6%)',
  ];
  // Rows as lines of one block, and rows as separate blocks.
  assert.deepEqual(described(run([[intro, before, outro]], [[intro, after, outro]])), expected);
  assert.deepEqual(described(run([[intro, ...before.map((l) => [l]), outro]], [[intro, ...after.map((l) => [l]), outro]])), expected);
});

test('quarterly sign flips are each flagged', () => {
  const r = run([[intro, ['Q1 -120', 'Q2 340', 'Q3 -75', 'Q4 210'], outro]], [[intro, ['Q1 120', 'Q2 -340', 'Q3 75', 'Q4 -210'], outro]]);
  assert.deepEqual(described(r), [
    'Number changed: -120 → 120 (sign changed)',
    'Number changed: 340 → -340 (sign changed)',
    'Number changed: -75 → 75 (sign changed)',
    'Number changed: 210 → -210 (sign changed)',
  ]);
});

test('a long table with every figure revised keeps its row labels matched', () => {
  // 150 rows × 5 figures over several pages: beyond what the exact diff handles.
  const rows = (base: number) => Array.from({ length: 150 }, (_, r) => `Region${r} ${[0, 1, 2, 3, 4].map((c) => base + r * 10 + c).join(' ')}`);
  const pages = (lines: string[]) => Array.from({ length: Math.ceil(lines.length / 40) }, (_, p) => [lines.slice(p * 40, p * 40 + 40)]);
  const r = run(pages(['Region Q1 Q2 Q3 Q4 Total', ...rows(1000)]), pages(['Region Q1 Q2 Q3 Q4 Total', ...rows(5000)]));
  assert.equal(r.changes.length, 750);
  assert.ok(r.changes.every((c) => c.numeric && c.numeric.fromValue !== null), described(r).find((d) => !d.startsWith('Number')));
  assert.equal(r.stats.matchedTokens, 156);
});

test('alignment does not give up on long revised tables', () => {
  const check = (a: string[], b: string[], expected: number) => {
    const [ka, kb] = intern(a, b);
    assert.equal(matchSequences(ka, kb).length / 2, expected);
  };
  const unique: [string[], string[]] = [[], []];
  for (let r = 0; r < 400; r++) {
    unique[0].push(`Acct${r}`, `${1000 + r}`, `${5000 + r}`);
    unique[1].push(`Acct${r}`, `${2000 + r}`, `${7000 + r}`);
  }
  check(...unique, 400);
  const months = 'January February March April May June July August September October November December'.split(' ');
  const repeated: [string[], string[]] = [[], []];
  for (let r = 0; r < 600; r++) {
    repeated[0].push(months[r % 12], 'total', `${1000 + r}`, `${5000 + r}`);
    repeated[1].push(months[r % 12], 'total', `${2000 + r}`, `${7000 + r}`);
  }
  check(...repeated, 1200);
});

test('text that cannot be aligned at all is flagged, not silently replaced', () => {
  const info: MatchInfo = { unaligned: 0 };
  const a = ['x', ...Array.from({ length: 700 }, (_, k) => `a${k}`), 'x'];
  const b = ['x', 'x', 'x', ...Array.from({ length: 700 }, (_, k) => `b${k}`)];
  const [ka, kb] = intern(a, b);
  matchSequences(ka, kb, info);
  assert.ok(info.unaligned > 1000);
  // Every line rewritten; only a repeated word in common, not equally often.
  const lines = (p: string, n: number) => Array.from({ length: n }, (_, l) => `${p}${l}a ${p}${l}b the ${p}${l}c ${p}${l}d ${p}${l}e`);
  const r = run([[lines('alpha', 120)]], [[lines('omega', 121)]]);
  assert.ok(r.stats.unalignedTokens! > 0);
  assert.ok(notices('en', r).some((n) => n.text.includes('aligned word by word')));
  // Nothing in common at all is not an alignment failure.
  const none = run([[lines('alpha', 120).map((l) => l.replace(' the ', ' '))]], [[lines('omega', 121).map((l) => l.replace(' the ', ' '))]]);
  assert.equal(none.stats.unalignedTokens, 0);
});

test('an unchanged heading between a deleted and an inserted paragraph stays unchanged', () => {
  const H1 = ['1. Scope'];
  const P1 = ['This agreement covers the supply of office furniture to the client at the listed sites.'];
  const Pold = ['Invoices are issued at the end of each calendar month and are sent by email only.'];
  const H2 = ['2. Payment'];
  const Pnew = ['A late fee of two percent applies to any invoice that remains unpaid after thirty days.'];
  const P3 = ['Payment is made by bank transfer to the account named on the invoice within the term.'];
  const P4 = ['The client may inspect the goods on delivery and must report any defects within a week.'];
  assert.deepEqual(described(run([[H1, P1, Pold, H2, P3]], [[H1, P1, H2, Pnew, P3]])), ['Deleted a paragraph', 'Added a paragraph']);
  // The deleted paragraph actually moved to the end: still recognised as a move.
  const moved = run([[H1, P1, Pold, H2, P3, P4]], [[H1, P1, H2, Pnew, P3, P4, Pold]]);
  assert.deepEqual(moved.changes.map((c) => c.kind), ['insert', 'move']);
  assert.deepEqual(described(run([[H1, P1, Pold, H2, Pnew, P3]], [[H1, P1, H2, P3]])), ['Deleted a paragraph', 'Deleted a paragraph']);
});

test('edits in adjacent paragraphs are not joined into one change', () => {
  const P0 = ['This schedule sets out the fees that apply to the services described in the agreement.'];
  const r = run(
    [[P0, ['The total fee for the first year is fixed at'], ['2 Payment is due within fourteen days of the invoice date unless agreed otherwise.']]],
    [[P0, ['The total fee for the first year is fixed at 1,500'], ['Payment is due within fourteen days of the invoice date unless agreed otherwise.']]],
  );
  assert.deepEqual(described(r), ['Added “1,500”', 'Deleted “2”']);
  const r2 = run(
    [[P0, ['The deposit is 500.'], ['2. Refunds'], ['Refunds are paid within thirty days of the request.']]],
    [[P0, ['The deposit is 800.'], ['3. Refunds'], ['Refunds are paid within thirty days of the request.']]],
  );
  assert.deepEqual(described(r2), ['Number changed: 500 → 800 (+60%)', 'Number changed: 2 → 3']);
  const r3 = run(
    [[P0, ['The supplier delivers the goods within ten working days.'], ['Optional: Installation'], ['The supplier installs the shelving.']]],
    [[P0, ['The supplier delivers the goods within ten working days. Partial deliveries are not accepted.'], ['Installation'], ['The supplier installs the shelving.']]],
  );
  assert.deepEqual(described(r3), ['Added “Partial deliveries are not accepted.”', 'Deleted “Optional:”']);
});

test('several figures revised together each get their own percentage and sign check', () => {
  const P0 = ['The table below lists the unit counts for each product line in the two warehouses.'];
  const P9 = ['Counts were taken on the last working day of the month by the site managers.'];
  assert.deepEqual(described(run([[P0, ['Pens and markers 10 500'], P9]], [[P0, ['Pens and markers 50 100'], P9]])), [
    'Number changed: 10 → 50 (+400%)',
    'Number changed: 500 → 100 (-80%)',
  ]);
  assert.deepEqual(described(run([[P0, ['Budget 2025: 100 -50 total'], P9]], [[P0, ['Budget 2025: 900 50 total'], P9]])), [
    'Number changed: 100 → 900 (+800%)',
    'Number changed: -50 → 50 (sign changed)',
  ]);
  // Figures that cannot be paired: no value, so no made-up percentage.
  const r = run([[P0, ['Fee 1,200 300 total'], P9]], [[P0, ['Fee 1,500 total'], P9]]);
  assert.equal(r.changes.length, 1);
  assert.deepEqual(r.changes[0].numeric, { from: '1,200 300', to: '1,500', fromValue: null, toValue: null });
  assert.equal(describeChange('en', r.changes[0]), 'Number changed: 1,200 300 → 1,500');
});
