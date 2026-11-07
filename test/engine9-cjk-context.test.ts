// Fix round 9, area T3 (context in Chinese and Japanese): the excerpt's
// context took six tokens on each side, and a Chinese or Japanese character
// is one token, so it showed six characters, too few for the phrase around a
// changed figure (round 5, cause 4: "陆 → 柒" in 人民币壹万柒仟陆佰叁拾柒元肆角整,
// "4 → 6" in 4 小时内派工程师; round 4's 10% 作为质量保证金). A character now
// counts as a third of a word, and the context stops at the end of a
// sentence (see context in compare.ts). The probes are SYNTHETIC fpdf2 2.9
// and PyMuPDF 2.1 files made by test/fixtures/gen9/probe9-T3.py; the round-4
// and round-5 cases are the committed eval/cases pairs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openPdf } from '../src/node/pdf.ts';
import { extractText } from '../src/pdf/extract.ts';
import { buildDocModel } from '../src/core/tokenize.ts';
import { compareDocs } from '../src/core/compare.ts';
import { describeChange } from '../src/core/describe.ts';
import { excerptHtml } from '../src/core/report.ts';
import type { Change, CompareResult } from '../src/core/types.ts';
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
/** The change described as `d`, with its context. */
function around(r: CompareResult, d: string): Change {
  const c = r.changes.find((x) => describeChange('en', x) === d);
  assert.ok(c, `${d} not in ${JSON.stringify(listed(r))}`);
  return c;
}

test('T3: in Chinese the context shows the phrase around the change, up to the end of its sentence', async () => {
  const r = await probe('ctx');
  // The amount in words: the whole of it, 7 characters before the change and 8 after.
  const words = around(r, 'Changed “陆” → “柒”');
  assert.ok(words.contextBefore.endsWith('人民币壹万柒仟'), words.contextBefore);
  assert.equal(words.contextAfter, '佰叁拾柒元肆角整');
  assert.match(excerptHtml(words), /人民币壹万柒仟<\/span> <del>陆<\/del> <ins>柒<\/ins> <span class="ctx">佰叁拾柒元肆角整/);
  // The sentence after the figure, to its full stop, and the clause before it.
  const hours = around(r, 'Number changed: 4 → 6 (+50%)');
  assert.equal(hours.contextAfter, '小时内派工程师上门。');
  assert.equal(hours.contextBefore, '报修的，我们在 2 小时内电话响应，');
  // The context before does not reach back into the sentence before (…耗材更换。).
  const visits = around(r, 'Changed “季度” → “月”');
  assert.equal(visits.contextBefore, '我们每');
  assert.equal(visits.contextAfter, '上门巡检一次，并在巡检后两个工作日内');
  // Latin text keeps six words on each side.
  const fee = around(r, 'Number changed: 1.50% → 1.05% (-0.45 pp)');
  assert.equal(fee.contextBefore, 'The late fee is');
  assert.equal(fee.contextAfter, 'of the amount due for each');
  // Control: two edits side by side stay two items, each with its own context.
  const share = around(r, 'Number changed: 10% → 5% (-5 pp)');
  assert.equal(share.contextAfter, '作为质量保证金，质保期满后 15 日内');
  assert.equal(around(r, 'Number changed: 30 → 15 (-50%)').contextAfter, '日内无息退还。');
  assert.equal(r.changes.length, 7, JSON.stringify(listed(r)));
});

test('T3: the context of a figure in a PyMuPDF HTML box', async () => {
  const r = await probe('html');
  const hours = around(r, 'Number changed: 4 → 6 (+50%)');
  assert.equal(hours.contextAfter, '小时内派工程师上门。');
  assert.ok(hours.contextBefore.endsWith('我们在 2 小时内电话响应，'), hours.contextBefore);
});

test('T3: the round-4 and round-5 CJK items show the phrase their truth names', async () => {
  // holdout5-i-payslip-cny #8: 人民币壹万柒仟陆佰叁拾柒元肆角整.
  const pay = await evalCase('holdout5-i-payslip-cny');
  const words = around(pay, 'Changed “陆” → “柒”');
  assert.ok((words.contextBefore + '陆' + words.contextAfter).includes('人民币壹万柒仟陆佰叁拾柒元肆角整'), `${words.contextBefore} | ${words.contextAfter}`);
  // holdout5-j-zh-quote-htmlbox #3: 4 小时内派工程师.
  const quote = await evalCase('holdout5-j-zh-quote-htmlbox');
  assert.ok(around(quote, 'Number changed: 4 → 6 (+50%)').contextAfter.startsWith('小时内派工程师'));
  // holdout4-e-docx-zh-en-supply-annex #3: 10% 作为质量保证金.
  const annex = await evalCase('holdout4-e-docx-zh-en-supply-annex');
  assert.ok(around(annex, 'Number changed: 10% → 5% (-5 pp)').contextAfter.startsWith('作为质量保证金'));
});

test('T3: the context leaves out a full-width mark cut from the text around it', () => {
  // Synthetic text runs: a quotation's fields on one line, and numbered clauses.
  const doc = (name: string, until: string, days: string) =>
    makeDoc(name, [
      [
        ['报价编号：QH-2026-901'],
        [`报价日期：2026年11月4日 有效期至：${until}`],
        [`本合同共两条。（二）乙方应于${days}日内完成全部设备的安装接线调试工作（含试运行）。`],
      ],
    ]);
  const r = compareDocs(model(doc('a', '2026年11月30日', '3')), model(doc('b', '2026年12月31日', '5')));
  // The colon of the field before (报价日期：) is not shown at the start of the context.
  const date = around(r, 'Number changed: 2026年11月30日 → 2026年12月31日');
  assert.equal(date.contextBefore, '2026年11月4日 有效期至：');
  // Nor the opening bracket of the text after the context; control: the
  // bracket that opens the clause number before the change stays.
  const days = around(r, 'Number changed: 3 → 5 (+67%)');
  assert.equal(days.contextBefore, '（二）乙方应于');
  assert.equal(days.contextAfter, '日内完成全部设备的安装接线调试工作');
});

test('T3: the context keeps a full-width sign that starts it', async () => {
  // Chromium (gen9/probe9-T3c.mjs): each sentence starts right after a
  // sentence end with a sign or a range mark; the figure changed later in
  // the sentence has its context start at that sign.
  const r = await probe('sign');
  assert.deepEqual(
    r.changes.map((c) => [describeChange('en', c), c.contextBefore]),
    [
      ['Number changed: 30 → 45 (+50%)', '－20℃以下时，泵的启动时间为'],
      ['Number changed: 3 → 5 (+67%)', '＋5%以内的偏差，由乙方在'],
      ['Number changed: 2 → 4 (+100%)', '～11月30日まで延長分は'],
      ['Number changed: 8,800 → 9,600 (+9.1%)', '－1,200元为本期扣款，实发金额为'],
    ],
  );
  // Synthetic text runs: the context's budget ends at the comma before the
  // sign (the comma is left out, the sign stays), or at the sign itself (it
  // is not cut from its figure). Control: with a shorter sentence, the
  // comma inside the context stays.
  const ctx = (filler: string) => {
    const doc = (name: string, t: string) => makeDoc(name, [[[`本合同另有约定的按约定执行，－20℃以下时泵的启动时间${filler}${t}秒。`]]]);
    return compareDocs(model(doc('a', '30')), model(doc('b', '45'))).changes.map((c) => c.contextBefore);
  };
  assert.deepEqual(ctx('延'), ['－20℃以下时泵的启动时间延']);
  assert.deepEqual(ctx('延长到'), ['－20℃以下时泵的启动时间延长到']);
  assert.deepEqual(ctx(''), ['行，－20℃以下时泵的启动时间']);
});
