// Re-pagination and paragraph structure: page breaks and wider line
// spacing inside a paragraph, loosely spaced CJK paragraphs, and a table's
// header row repeated at the top of continuation pages.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareDocs } from '../src/core/compare.ts';
import { describeChange, notices } from '../src/core/describe.ts';
import { buildDocModel, joinTokens } from '../src/core/tokenize.ts';
import type { DocText, TextRun } from '../src/core/types.ts';
import { makeDoc, model } from './helpers.ts';

const texts = (r: ReturnType<typeof compareDocs>) => r.changes.filter((c) => c.category === 'text').map((c) => describeChange('en', c));
const intro = ['This agreement sets out the terms under which the provider delivers services to the client.'];

test('a figure or word edited where only one version breaks the paragraph across pages stays one change', () => {
  const para = (first: string) => ['The account balance at the end of the year was', `${first} dollars after all fees were charged.`];
  const broken = (first: string) => [[intro, [para(first)[0]]], [[para(first)[1]]]];
  const cmp = (a: string, b: string) => texts(compareDocs(model(makeDoc('a', [[intro, para(a)]])), model(makeDoc('b', broken(b)))));
  assert.deepEqual(cmp('100', '200'), ['Number changed: 100 → 200 (+100%)']);
  assert.deepEqual(cmp('100', '-100'), ['Number changed: 100 → -100 (sign changed)']);
  const words = (w: string) => [['The Buyer shall indemnify the', `${w} against all claims of third parties.`]];
  const r = compareDocs(model(makeDoc('a', [[intro, ...words('Seller')]])), model(makeDoc('b', [[intro, [words('Lessor')[0][0]]], [[words('Lessor')[0][1]]]])));
  assert.deepEqual(texts(r), ['Changed “Seller” → “Lessor”']);
});

/** One paragraph per entry, every line its own run, laid out with `pitch` points from baseline to baseline. */
function spaced(paras: string[][], pitch: number, size = 11): DocText {
  const runs: TextRun[] = [];
  let y = 120;
  for (const lines of paras) {
    for (const str of lines) {
      runs.push({ str, x: 56, y: y - size * 0.9, w: str.length * size * 0.5, h: size * 1.15, baseline: y, fontSize: size, font: 'Body', family: 'serif', eol: true, angle: 0 });
      y += pitch;
    }
    y += 1.5 * pitch;
  }
  return { name: 'x', pages: [{ index: 0, width: 595, height: 842, runs }] };
}

test('a figure at the start of a line stays one change when only the line spacing widened', () => {
  const para = (n: string) => [['The account balance at the end of the year was', `${n} dollars after all fees were charged.`]];
  const r = compareDocs(buildDocModel(spaced([intro, ...para('100')], 14)), buildDocModel(spaced([intro, ...para('200')], 28)));
  assert.deepEqual(texts(r), ['Number changed: 100 → 200 (+100%)']);
});

test('lines that carry on a sentence stay in their paragraph despite a wide line spacing', () => {
  // LibreOffice, CJK text at 10.5 pt with a 21 pt line pitch: the gap between
  // the lines is wider than the usual paragraph threshold.
  const contract = (end: [string, string]) => [
    ['因本合同引起的或与本合同有关的任何争议，双方应友好协商解决；协商不成的，任何一方均可' + end[0], end[1]],
    ['本合同一式肆份，甲乙双方各执贰份，具有同等法律效力。本合同未尽事宜，双方可另行签', '订补充协议，补充协议与本合同具有同等法律效力。'],
  ];
  const sign = ['甲方（盖章）：苏州澜汀精密机械有限公司'];
  const a = buildDocModel(spaced([...contract(['提', '交苏州仲裁委员会仲裁。']), sign], 21.3, 10.5));
  const b = buildDocModel(spaced([contract(['向', '甲方所在地有管辖权的人民法院提起诉讼。'])[0], ['本合同一式肆份，甲乙双方各执贰份，具有同等法律效力。'], sign], 21.3, 10.5));
  assert.equal(new Set(a.lines.map((l) => l.block)).size, 3, 'three paragraphs, not five');
  const r = compareDocs(a, b);
  assert.deepEqual(
    r.changes.map((c) => [c.kind, c.old.text, c.new.text]),
    [
      ['replace', '提交苏州仲裁委员会仲裁', '向甲方所在地有管辖权的人民法院提起诉讼'],
      ['delete', '本合同未尽事宜，双方可另行签订补充协议，补充协议与本合同具有同等法律效力。', ''],
    ],
  );
  // Latin text continuing in lower case after a wide line break stays one
  // paragraph; a heading followed by a capital, or a finished sentence, does not.
  const en = buildDocModel(spaced([['1. Scope', 'This policy applies to all records held by the', 'association in any format.', 'It applies wherever the records are held.']], 28));
  assert.deepEqual(en.lines.map((l) => l.block), [0, 1, 1, 2]);
  assert.equal(joinTokens(a.tokens.filter((t) => t.block === 1)), contract(['', ''])[1].join(''));
});

const table = (rows: string[]) => rows.map((r) => r);
const H = 'Code Parameter Range Default';
const rows = Array.from({ length: 8 }, (_, k) => `P${k + 1}0 Setting number ${k + 1} 0 to ${k + 10} ${k + 2}`);

test('a table header row repeated at the top of a continuation page is a consequence of the page break, counted and listed apart', () => {
  // The table runs from page 1 onto page 2, where its header row is repeated.
  // In the new version a sentence before the table pushes two rows over.
  const a = makeDoc('a', [[intro, table([H, ...rows.slice(0, 6)])], [table([H, ...rows.slice(6)]), ['End of the parameter list.']]]);
  const b = makeDoc('b', [
    [intro, ['A sentence explains the defaults.'], table([H, ...rows.slice(0, 4)])],
    [table([H, ...rows.slice(4)]), ['End of the parameter list.']],
  ]);
  const r = compareDocs(model(a), model(b));
  assert.deepEqual(texts(r), ['Added “A sentence explains the defaults.”']);
  assert.equal(r.ignored.repeatedLines, r.minor.filter((c) => c.consequence === 'repeatedLine').length);
  assert.ok(r.ignored.repeatedLines! >= 1);
  assert.ok(r.minor.every((c) => c.minor && c.consequence === 'repeatedLine' && c.old.text + c.new.text === H), r.minor.map((c) => c.old.text + c.new.text).join());
  assert.ok(describeChange('en', r.minor[0]).includes(`“${H}”`));
  const note = notices('en', r).find((n) => n.text.includes('repeated at the top of a page'));
  assert.equal(note?.action, 'minor');
  assert.ok(notices('zh', r).some((n) => n.text.includes('页首重复行')));
});

test('a line added at a page top where the page break did not move is still an edit', () => {
  const a = makeDoc('a', [[intro, table([H, ...rows.slice(0, 4)])], [table(rows.slice(4)), ['End of the parameter list.']]]);
  const b = makeDoc('b', [[intro, table([H, ...rows.slice(0, 4)])], [table([H, ...rows.slice(4)]), ['End of the parameter list.']]]);
  const r = compareDocs(model(a), model(b));
  assert.deepEqual(texts(r), [`Added “${H}”`]);
  assert.equal(r.ignored.repeatedLines, 0);
});

test('a header row set with the first table row on each page is body text, not a running header', () => {
  const page = (k: number) => [table([H, ...rows.slice(2 * k, 2 * k + 2)]), [`Notes for page ${k + 1} follow the table.`]];
  const m = model(makeDoc('a', [page(0), page(1), page(2)], { header: () => 'Parameter manual' }));
  assert.ok(m.lines.filter((l) => l.text === H).every((l) => !l.furniture));
  assert.ok(m.lines.filter((l) => l.text === 'Parameter manual').every((l) => l.furniture));
});
