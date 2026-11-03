import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { DocText, TextRun } from '../src/core/types.ts';
import { buildDocModel, joinTokens } from '../src/core/tokenize.ts';
import { isPageNumberText } from '../src/core/furniture.ts';
import { makeDoc } from './helpers.ts';

const run = (str: string, x: number, baseline: number, extra: Partial<TextRun> = {}): TextRun => ({
  str, x, y: baseline - 10, w: str.length * 5.5, h: 12, baseline, fontSize: 11, font: 'F', family: 'sans-serif', eol: false, angle: 0, ...extra,
});

test('numbers, words, punctuation and CJK are tokenised sensibly', () => {
  const doc: DocText = { name: 'a', pages: [{ index: 0, width: 595, height: 842, runs: [run('Total: USD 8,000.50 (incl. 7.5% tax) — 报价从八千元', 56, 100)] }] };
  const m = buildDocModel(doc);
  assert.deepEqual(
    m.tokens.map((t) => t.text),
    ['Total', ':', 'USD', '8,000.50', '(', 'incl', '.', '7.5', '%', 'tax', ')', '—', '报', '价', '从', '八', '千', '元'],
  );
  assert.equal(m.tokens[3].kind, 'number');
  assert.equal(m.tokens[12].kind, 'cjk');
});

test('words split across text runs without a gap stay one token', () => {
  const doc: DocText = { name: 'a', pages: [{ index: 0, width: 595, height: 842, runs: [run('Hel', 56, 100), run('lo world', 56 + 3 * 5.5, 100)] }] };
  assert.deepEqual(buildDocModel(doc).tokens.map((t) => t.text), ['Hello', 'world']);
});

test('whitespace runs spanning table cells do not break the row into lines', () => {
  const doc: DocText = {
    name: 'a',
    pages: [{ index: 0, width: 595, height: 842, runs: [run('Discovery', 64, 200), run(' ', 111, 200, { w: 108, h: 0 }), run('Interviews', 192, 200), run('3,000', 500, 200, { eol: true })] }],
  };
  const m = buildDocModel(doc);
  assert.equal(new Set(m.tokens.map((t) => t.line)).size, 1);
});

test('hyphenated line breaks are re-joined', () => {
  const m = buildDocModel(makeDoc('a', [[['This is infor-', 'mation about it.']]]));
  assert.ok(m.tokens.some((t) => t.text === 'information'));
  assert.ok(!m.tokens.some((t) => t.text === '-'));
  const tok = m.tokens.find((t) => t.text === 'information')!;
  assert.equal(tok.rects.length, 2);
});

test('running headers, footers and page numbers are flagged', () => {
  const pages = [[['Alpha text one.']], [['Beta text two.']], [['Gamma text three.']]];
  const m = buildDocModel(makeDoc('a', pages, { header: () => 'ACME Corp — Confidential', footer: (p, n) => `Page ${p} of ${n}` }));
  const furniture = m.tokens.filter((t) => t.furniture).map((t) => t.text);
  assert.ok(furniture.includes('ACME'));
  assert.ok(furniture.includes('Page'));
  assert.ok(!m.tokens.find((t) => t.text === 'Alpha')!.furniture);
});

test('page number patterns', () => {
  for (const s of ['3', '- 3 -', 'Page 3 of 10', '3 / 10', '第 3 页', '第 3 页 / 共 10 页', 'iv']) assert.ok(isPageNumberText(s), s);
  for (const s of ['Total 3', 'Chapter 3', 'Hello']) assert.ok(!isPageNumberText(s), s);
});

test('joinTokens restores spacing, without spaces at CJK line breaks', () => {
  const m = buildDocModel(makeDoc('a', [[['价格从八千', '元调整为九千元。'], ['Second paragraph here.']]]));
  assert.equal(joinTokens(m.tokens), '价格从八千元调整为九千元。 Second paragraph here.');
});
