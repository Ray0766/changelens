// Fix round 9, area T3, second pass: a figure with 年 in one table cell (a
// term, "3年") was read as one date with the month or date in the next cell,
// column or row ("3年 | 11月1日" → "Number changed: 3年 11月1日 → 5年 11月1日",
// without the percentage of the term), and two edits of one table row were
// listed as the same change twice ("2年 11月1日 → 4年 12月1日"). The parts of a
// date are now joined only when they are written together: on one line at
// most about a word space apart, or across a line break where the unit starts
// the next line or the line ran full to the edge of its column; a year has
// three or four digits or follows an era name; and all edits of one date are
// one change (see writtenTogether, cjkDate and refine in compare.ts). The
// probes are SYNTHETIC fpdf2 2.9 and LibreOffice 24.2 files made by
// test/fixtures/gen9/probe9-T3b.py.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openPdf } from '../src/node/pdf.ts';
import { extractText } from '../src/pdf/extract.ts';
import { buildDocModel } from '../src/core/tokenize.ts';
import { compareDocs } from '../src/core/compare.ts';
import { describeChange } from '../src/core/describe.ts';
import { excerptHtml } from '../src/core/report.ts';
import type { CompareResult } from '../src/core/types.ts';

const fixtures = new URL('./fixtures/', import.meta.url).pathname;
const load = async (path: string) => buildDocModel(await extractText(await openPdf(path), path));
async function probe(name: string): Promise<CompareResult> {
  return compareDocs(await load(`${fixtures}probe9-T3-${name}-before.pdf`), await load(`${fixtures}probe9-T3-${name}-after.pdf`));
}
const listed = (r: CompareResult) => r.changes.map((c) => describeChange('en', c));
/** No two changes read alike: the same description and the same excerpt. */
const distinct = (r: CompareResult) => new Set(r.changes.map((c) => describeChange('en', c) + '\u0000' + excerptHtml(c))).size === r.changes.length;

test('T3: a term in a table cell is not read as part of the date in the next cell or row (fpdf2)', async () => {
  const r = await probe('cells');
  assert.deepEqual(listed(r), [
    // Row A: the term 3年 → 5年 in its own cell, next to the unchanged 11月1日.
    'Number changed: 3 → 5 (+67%)',
    // Row B: the term, the date and the deposit each changed in their own cell: three changes.
    'Number changed: 2 → 4 (+100%)',
    'Number changed: 11月1日 → 12月1日',
    'Number changed: 10% → 15% (+5 pp)',
    // A grid row 质保期限 | 3年 above the row 11月 | 设备巡检.
    'Number changed: 3 → 5 (+67%)',
    // A grid row 检定年度 | 2026年 above the row 11月 | 首次检定: the row ends, the line is not full.
    'Number changed: 2026 → 2027',
    // A schedule: 11月 | 22日 working days.
    'Number changed: 22 → 21 (-4.5%)',
    // Prose: "租期2年 1月1日起算": a term of one digit before a date is not its year.
    'Number changed: 2 → 3 (+50%)',
    // The year and the day of one date changed, the month between them did not: one change.
    'Number changed: 2026年10月30日 → 2027年10月31日',
    // Controls: dates broken over a full line after 年 and after 月 stay whole.
    'Number changed: 2026年11月30日 → 2027年11月30日',
    'Number changed: 2026年11月30日 → 2026年11月28日',
    // Controls: a spaced date, a date with an era name, a ROC year.
    'Number changed: 2026 年 11 月 30 日 → 2026 年 12 月 31 日',
    'Number changed: 令和8年11月30日 → 令和8年12月1日',
    'Number changed: 114年12月18日 → 114年12月16日',
  ]);
  assert.ok(distinct(r));
  // The term keeps its value for the percentage; the date has none.
  assert.deepEqual([r.changes[1].numeric?.fromValue, r.changes[1].numeric?.toValue], [2, 4]);
  assert.deepEqual([r.changes[2].numeric?.fromValue, r.changes[2].numeric?.toValue], [null, null]);
  // The date change marks the date cell, right of the term cell.
  assert.ok(r.changes[2].old.rects.every((x) => x.rect.x > r.changes[1].old.rects[0].rect.x + 40), JSON.stringify(r.changes[2].old.rects));
});

test('T3: a term in a table cell is not read as part of the date in the next cell (LibreOffice)', async () => {
  // LibreOffice writes each cell as a line of one block, the date cell wrapped
  // ("11 月 1" / "日"), and a space between a figure and its unit.
  const r = await probe('lotable');
  assert.deepEqual(listed(r), [
    'Number changed: 3 → 5 (+67%)',
    // The date cell wraps between the day and 日: still one date.
    'Number changed: 11 月 1日 → 12 月 1日',
    'Number changed: 2 → 4 (+100%)',
    // Control: a term in months keeps its percentage.
    'Number changed: 2 → 3 (+50%)',
    // Only the date cell changed in row C: shown without the term 1 年 of the cell before it.
    'Number changed: 3 月 15日 → 4 月 15日',
    // Control: a paragraph broken after 年 at a full line keeps the date whole.
    'Number changed: 2026 年11 月 30 日 → 2027 年11 月 30 日',
    // A short line broken by <br> after "检定年度 2026年": not one date with the 11月 below.
    'Number changed: 2026 → 2027',
  ]);
  assert.ok(distinct(r));
});

test('T3: a date wrapped after 年 at the edge of a narrow column under a wider title is one date', async () => {
  // fpdf2 (gen9/probe9-T3d.py): a 60 mm column wraps "…有效期至2026年" /
  // "11月30日止…" at its edge. A 14 pt title wider than the column, or over
  // two columns, does not set the column's edge.
  assert.deepEqual(listed(await probe('wrapwide')), ['Number changed: 2026年11月30日 → 2026年12月30日']);
  assert.deepEqual(listed(await probe('wrapcols')), ['Number changed: 2026年11月30日 → 2027年12月30日']);
  // Control: under a title shorter than the column.
  assert.deepEqual(listed(await probe('wrapshort')), ['Number changed: 2026年11月30日 → 2026年12月30日']);
});
