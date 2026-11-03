// Page numbers and running headers/footers: only real furniture is left out
// of the comparison; numbers in the body near the page edge are compared.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDocModel } from '../src/core/tokenize.ts';
import { compareDocs } from '../src/core/compare.ts';
import { isPageNumberText } from '../src/core/furniture.ts';
import { makeDoc } from './helpers.ts';

const compare = (a: string[][][], b: string[][][], opts: Parameters<typeof makeDoc>[2] = {}) =>
  compareDocs(buildDocModel(makeDoc('a', a, opts)), buildDocModel(makeDoc('b', b, opts)));

test('page-number text: one small integer or roman numeral, with page words', () => {
  for (const s of ['3', '- 3 -', '— 12 —', 'Page 3 of 10', 'p. 3', '3 / 10', 'Seite 3 von 10', '第 3 页', '第 3 页 / 共 10 页', 'iv', 'XII', '(3)'])
    assert.ok(isPageNumberText(s), s);
  for (const s of ['1995 2,295 4,855', '12,500.', '12,500', '2026-11-03', '12:30', '11/03', 'of 2025.', '(1,200)', '3.5', '2025', 'Mix', 'Li', 'Page 12 of 3', '-5', 'Total 3'])
    assert.ok(!isPageNumberText(s), s);
});

test('table rows that end or start a page are compared, not hidden as page numbers', () => {
  // 43 rows fill page 1 down into the bottom margin zone; page 2 starts in the top zone.
  const rows = (from: number, n: number, bump: number[]) =>
    Array.from({ length: n }, (_, i) => {
      const year = from + i;
      return `${year} ${(1000 + i * 37).toLocaleString('en-US')} ${(2000 + i * 71 + (bump.includes(year) ? 1 : 0)).toLocaleString('en-US')}`;
    });
  const a = [[rows(1960, 43, [])], [rows(2003, 10, [])]];
  const b = [[rows(1960, 43, [2002])], [rows(2003, 10, [2003])]];
  const m = buildDocModel(makeDoc('a', a));
  const last = m.lines.find((l) => l.text.startsWith('2002 '))!;
  const first = m.lines.find((l) => l.text.startsWith('2003 '))!;
  assert.equal(last.zone, 'bottom');
  assert.equal(first.zone, 'top');
  const r = compare(a, b);
  const numbers = r.changes.filter((c) => c.numeric).map((c) => `${c.numeric!.from}→${c.numeric!.to} p${c.new.pages[0] + 1}`);
  assert.deepEqual(numbers, ['4,982→4,983 p1', '2,000→2,001 p2']);
  assert.equal(r.ignored.furniture, 0);
});

test('a wrapped last line or a date near the page edge is compared', () => {
  const filler = Array.from({ length: 41 }, (_, i) => `Body line number ${i} of the agreement text here.`);
  for (const [a, b] of [
    ['12,500.', '13,500.'],
    ['of 2025.', 'of 2026.'],
    ['3', '4'],
  ]) {
    const r = compare([[[...filler, 'The total fee payable is', a]]], [[[...filler, 'The total fee payable is', b]]]);
    assert.equal(r.changes.length, 1, `${a} → ${b}`);
    assert.equal(r.ignored.furniture, 0);
  }
  const r = compare([[['2026-11-03'], ['The parties agree as follows.']]], [[['2026-11-04'], ['The parties agree as follows.']]]);
  assert.equal(r.changes.length, 1);
  assert.equal(r.changes[0].old.text, '2026-11-03');
});

test('real page numbers are still ignored, and each changed footer counts once', () => {
  const body = [[['Alpha text one.']], [['Beta text two.']]];
  const r = compare(body, body.concat([[['Gamma text three.']]]), { footer: (p, n) => `Page ${p} of ${n}` });
  assert.equal(r.changes.filter((c) => c.category === 'text').length, 1);
  // "Page 1 of 2" → "Page 1 of 3", "Page 2 of 2" → "Page 2 of 3", "Page 3 of 3" added.
  assert.equal(r.ignored.furniture, 3);
  // A single page: a bare number set apart at the foot of the page.
  const one = buildDocModel(makeDoc('a', [[['Only page.']]], { footer: () => '- 1 -' }));
  assert.ok(one.lines.find((l) => l.text === '- 1 -')!.furniture);
});
