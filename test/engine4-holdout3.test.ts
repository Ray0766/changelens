// The blind held-out round 3 PDFs (eval/cases/holdout3-*, synthetic
// samples from Chromium, LibreOffice and reportlab), text comparison only:
// the issues seen in that round stay fixed on the real producers' output.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openPdf } from '../src/node/pdf.ts';
import { extractText } from '../src/pdf/extract.ts';
import { buildDocModel } from '../src/core/tokenize.ts';
import { compareDocs } from '../src/core/compare.ts';
import { describeChange, notices } from '../src/core/describe.ts';

async function compareCase(id: string) {
  const load = async (f: string) => buildDocModel(await extractText(await openPdf(`eval/cases/${id}/${f}.pdf`), f));
  const r = compareDocs(await load('before'), await load('after'));
  return { r, list: r.changes.map((c) => describeChange('en', c)), notes: notices('en', r).map((n) => n.text) };
}

test('holdout3: table header rows repeated at page tops are counted consequences, not edits', async () => {
  const manual = await compareCase('holdout3-d-chromium-a5-manual');
  assert.deepEqual(manual.list, ['Added a paragraph', 'Number changed: 6.0 → 9.0 (+50%)', 'Changed “nitrile” → “butyl”']);
  assert.equal(manual.r.ignored.repeatedLines, 5);
  assert.ok(manual.notes.some((n) => n.startsWith('5 lines repeated at the top of a page')));
  const policy = await compareCase('holdout3-c-en-retention-policy');
  assert.ok(!policy.list.some((d) => d.includes('Record type Examples')), policy.list.join(' | '));
  assert.ok(policy.list.includes('Number changed: 31 → 14 (-55%)'));
  assert.equal(policy.r.ignored.furniture, 0, 'the header row is not a running header');
  // The inserted sentence starts with its first word.
  assert.ok(policy.r.changes.some((c) => c.kind === 'insert' && c.new.text.startsWith('It also covers records that contractors hold')));
});

test('holdout3: lines re-flowed into the other column are not moved sideways', async () => {
  const { r } = await compareCase('holdout3-d-chromium-zh-two-column');
  assert.deepEqual(r.changes.filter((c) => c.kind === 'position'), []);
  assert.equal(r.changes.length, 4);
});

test('holdout3: a loosely spaced Chinese clause rewrite is one change, without a space at the line break', async () => {
  const { r } = await compareCase('holdout3-c-zh-purchase-contract-reflow');
  const rewrite = r.changes.filter((c) => c.kind === 'replace' && !c.numeric);
  assert.deepEqual(rewrite.map((c) => [c.old.text, c.new.text]), [['提交苏州仲裁委员会仲裁', '向甲方所在地有管辖权的人民法院提起诉讼']]);
  const del = r.changes.find((c) => c.kind === 'delete')!;
  assert.equal(del.old.text, '本合同未尽事宜，双方可另行签订补充协议，补充协议与本合同具有同等法律效力。');
  const ins = r.changes.find((c) => c.kind === 'insert')!;
  assert.ok(ins.new.text.includes('原产地证明文件') && ins.wholeParagraphs === 1, ins.new.text);
});

test('holdout3: inserted and duplicated pages are not flagged as uncertain', async () => {
  for (const id of ['holdout3-c-zh-en-board-minutes-dup-page', 'holdout3-d-impress-steering-deck', 'holdout3-c-zh-av-quote-inserted-page']) {
    const { r, notes } = await compareCase(id);
    assert.deepEqual(r.coverage.new.uncertain, [], id);
    assert.ok(!notes.some((n) => n.includes('mostly new content')), id);
  }
});

test('holdout3: a magnitude stays on the figure and an inserted sentence keeps its full stop', async () => {
  const { r, list } = await compareCase('holdout3-c-en-interim-financials');
  assert.ok(list.includes('Number changed: −£7.4m → −£4.7m (-36%)'), list.join(' | '));
  assert.ok(r.changes.some((c) => c.kind === 'insert' && c.new.text === 'The lenders have agreed to waive the covenant test at 31 December 2026.'));
});
