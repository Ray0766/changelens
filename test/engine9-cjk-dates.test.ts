// Fix round 9, area T3 (dates in Chinese and Japanese): a date written with
// 年, 月 and 日 was listed as a text change when the month and the day
// changed ("Changed “11月30” → “12月31”", missing from the Numbers filter
// and count), and with a percentage on the day when only the day changed
// ("Number changed: 10 → 12 (+20%)" for 2026年11月10日 → 12日; round 5,
// cause 4). Such a date, and a time written with 时 and 分 or after 午後,
// is now a number change shown as the whole date, without a percentage
// (see cjkDate in compare.ts). A figure before one unit alone ("3年",
// "30日以内", "2時間") is a term and keeps its percentage. The probes are
// SYNTHETIC fpdf2 2.9 and PyMuPDF 2.1 files made by
// test/fixtures/gen9/probe9-T3.py; the round-3 to round-5 cases are the
// committed eval/cases pairs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openPdf } from '../src/node/pdf.ts';
import { extractText } from '../src/pdf/extract.ts';
import { buildDocModel } from '../src/core/tokenize.ts';
import { compareDocs } from '../src/core/compare.ts';
import { describeChange, kindLabel } from '../src/core/describe.ts';
import { excerptHtml } from '../src/core/report.ts';
import type { CompareResult } from '../src/core/types.ts';
import { makeDoc, model } from './helpers.ts';

const fixtures = new URL('./fixtures/', import.meta.url).pathname;
const cases = new URL('../eval/cases/', import.meta.url).pathname;
const load = async (path: string) => buildDocModel(await extractText(await openPdf(path), path));
async function probe(name: string): Promise<CompareResult> {
  return compareDocs(await load(`${fixtures}probe9-T3-${name}-before.pdf`), await load(`${fixtures}probe9-T3-${name}-after.pdf`));
}
async function evalCase(id: string): Promise<CompareResult> {
  return compareDocs(await load(`${cases}${id}/before.pdf`), await load(`${cases}${id}/after.pdf`));
}
const listed = (r: CompareResult) => r.changes.map((c) => describeChange('en', c));
/** The descriptions of the changes the Numbers filter keeps (src/web/sidebar.ts). */
const numbers = (r: CompareResult) => r.changes.filter((c) => c.numeric).map((c) => describeChange('en', c));

test('T3: a Japanese date or time with 年月日 or 時分 is a number change without a percentage', async () => {
  const r = await probe('jadate');
  assert.deepEqual(listed(r), [
    // The day changed.
    'Number changed: 2026年11月10日 → 2026年11月12日',
    // The month and the day changed: one change, not "11月30 → 12月31" as text.
    'Number changed: 2026年11月30日 → 2026年12月31日',
    // Controls: a quantity and a term of years keep their percentage.
    'Number changed: 200 → 250 (+25%)',
    'Number changed: 3 → 5 (+67%)',
    // Full-width figures.
    'Number changed: ２０２７年４月１日 → ２０２７年５月１日',
    // An hour after 午後, and a time with minutes.
    'Number changed: ６時 → ８時',
    'Number changed: 14時30分 → 15時30分',
    // Controls: terms of hours and days keep their percentage.
    'Number changed: 2 → 3 (+50%)',
    'Number changed: 30 → 45 (+50%)',
    // Control: a day changed together with the word after it stays a text change that shows both.
    'Changed “10日納品” → “12日出荷”',
  ]);
  assert.equal(numbers(r).length, 9);
  const day = r.changes[0];
  assert.deepEqual([day.numeric?.fromValue, day.numeric?.toValue], [null, null]);
  assert.equal(kindLabel('en', day), 'Number');
  // The excerpt shows both dates, and the context around the whole date.
  assert.equal(excerptHtml(day), '<span class="ctx">納品日</span> <del>2026年11月10日</del> <ins>2026年11月12日</ins> <span class="ctx">有効期限 2026年12月31日数量</span>');
  // The highlight stays on the changed figure.
  assert.equal(day.old.rects.length, 1);
  assert.ok(day.old.rects[0].rect.w < 12, JSON.stringify(day.old.rects));
});

test('T3: a Chinese date, with or without its day, or a time is a number change without a percentage', async () => {
  const r = await probe('zhdate');
  assert.deepEqual(listed(r), [
    'Number changed: 3点 → 5点',
    'Number changed: 17时30分 → 18时30分',
    'Number changed: 2026年11月 → 2026年12月',
    // Controls: a term of days and of years keep their percentage.
    'Number changed: 45 → 60 (+33%)',
    'Number changed: 3 → 5 (+67%)',
  ]);
  const html = await probe('html');
  assert.deepEqual(numbers(html), ['Number changed: 2026年11月30日 → 2026年12月31日', 'Number changed: 4 → 6 (+50%)']);
  assert.ok(html.changes[0].contextBefore.endsWith('有效期至：'), html.changes[0].contextBefore);
});

test('T3: the round-5 dates are listed under Numbers, without a percentage; the amount in words stays text', async () => {
  // holdout5-j-zh-quote-htmlbox #1: 有效期至：2026年11月30日 → 2026年12月31日.
  const quote = await evalCase('holdout5-j-zh-quote-htmlbox');
  assert.equal(listed(quote)[0], 'Number changed: 2026年11月30日 → 2026年12月31日');
  assert.ok(quote.changes[0].contextBefore.endsWith('有效期至：'), quote.changes[0].contextBefore);
  assert.deepEqual(numbers(quote), ['Number changed: 2026年11月30日 → 2026年12月31日', 'Number changed: 4 → 6 (+50%)']);
  // holdout5-i-nouhinsho-jpy #1: 納品日 2026年11月10日 → 12日.
  const slip = await evalCase('holdout5-i-nouhinsho-jpy');
  assert.equal(listed(slip)[0], 'Number changed: 2026年11月10日 → 2026年11月12日');
  // The amounts keep their percentages.
  assert.ok(listed(slip).includes('Number changed: 200 → 250 (+25%)'), JSON.stringify(listed(slip)));
  // holdout5-i-payslip-cny #8: the amount in Chinese capital numerals stays a text change.
  const pay = await evalCase('holdout5-i-payslip-cny');
  const words = pay.changes.find((c) => describeChange('en', c) === 'Changed “陆” → “柒”');
  assert.ok(words && !words.numeric, JSON.stringify(listed(pay)));
  // holdout4-f-ja-maintenance-contract: ４月１日 and 午後６時 (round 4).
  const ja = await evalCase('holdout4-f-ja-maintenance-contract');
  assert.deepEqual(listed(ja).slice(0, 2), ['Number changed: ２０２７年４月１日 → ２０２７年５月１日', 'Number changed: ６時 → ８時']);
});

test('T3: a date in a running header field is shown whole, with its label as the context', () => {
  // A form field "保单日期" in the header of three pages (synthetic text runs).
  const body = (p: number) => [[`第${p}页正文：本合同由甲乙双方签订，双方应遵守各项条款。`, '乙方应按约定时间交付货物并提供相关文件。'], ['甲方应在收到发票后按期付款。']];
  const doc = (name: string, date: string) => {
    const d = makeDoc(name, [body(1), body(2), body(3)], { header: () => '保单日期' });
    for (const page of d.pages) {
      const label = page.runs[0];
      label.eol = false;
      page.runs.splice(1, 0, { ...label, str: date, x: 120, w: date.length * 7.2, eol: true, field: true });
    }
    return d;
  };
  const r = compareDocs(model(doc('a', '2026年11月10日')), model(doc('b', '2026年11月12日')));
  assert.deepEqual(listed(r), ['Number changed: 2026年11月10日 → 2026年11月12日 (in 3 places) (form field)']);
  assert.deepEqual([r.changes[0].contextBefore, r.changes[0].contextAfter], ['保单日期', '']);
});
