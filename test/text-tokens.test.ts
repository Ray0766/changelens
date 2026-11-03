// Tokenisation and comparison keys: what compares equal, what is one token,
// and what must still be reported.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { DocText, TextRun } from '../src/core/types.ts';
import { buildDocModel } from '../src/core/tokenize.ts';
import { compareDocs } from '../src/core/compare.ts';
import { makeDoc } from './helpers.ts';

const run = (str: string, x: number, baseline: number, extra: Partial<TextRun> = {}): TextRun => ({
  str, x, y: baseline - 10, w: str.length * 5.5, h: 12, baseline, fontSize: 11, font: 'F', family: 'sans-serif', eol: false, angle: 0, ...extra,
});
const line = (...runs: TextRun[]): DocText => ({ name: 'a', pages: [{ index: 0, width: 595, height: 842, runs }] });
const tokens = (s: string) => buildDocModel(line(run(s, 56, 300))).tokens.map((t) => t.text);
/** Compare paragraphs given as lines (one page). */
const cmp = (a: string[], b: string[]) => compareDocs(buildDocModel(makeDoc('a', [[a]])), buildDocModel(makeDoc('b', [[b]])));
/** Text changes only: re-flowing synthetic lines can also make a line "stick out" (overflow). */
const texts = (a: string[], b: string[]) =>
  cmp(a, b)
    .changes.filter((c) => c.category === 'text')
    .map((c) => `${c.old.text}→${c.new.text}`);

test('space-grouped thousands are one number (NBSP, thin, narrow NBSP; plain spaces in amounts)', () => {
  for (const sp of [' ', ' ', ' ', ' ']) {
    assert.ok(tokens(`Total population: 1${sp}234${sp}567 people`).includes(`1${sp}234${sp}567`), JSON.stringify(sp));
    assert.ok(tokens(`Montant : 1${sp}234 EUR net`).includes(`1${sp}234`), JSON.stringify(sp));
  }
  assert.ok(tokens('Prix 100 000 € TTC').includes('100 000'));
  assert.ok(tokens('Somme 12 500,50 HT').includes('12 500,50'));
  // Not amounts: two numbers side by side, a year before a number, a 4-digit group.
  assert.deepEqual(tokens('Revenue 100 200').slice(1), ['100', '200']);
  assert.deepEqual(tokens('Pens 10 500').slice(1), ['10', '500']);
  assert.deepEqual(tokens('Table 2 150 participants').slice(1, 3), ['2', '150']);
  assert.deepEqual(tokens('In 2025 100 people').slice(1, 3), ['2025', '100']);
  assert.deepEqual(tokens('Call 555 123 4567').slice(1), ['555', '123', '4567']);
  // Table cells are separate runs: never joined.
  const cells = buildDocModel(line(run('1', 56, 300), run(' ', 61.5, 300, { w: 30 }), run('234', 100, 300, { eol: true }))).tokens.map((t) => t.text);
  assert.deepEqual(cells, ['1', '234']);
  const r = cmp(['Total population: 1 234 567 people'], ['Total population: 2 234 567 people']);
  assert.equal(r.changes.length, 1);
  assert.deepEqual(r.changes[0].numeric, { from: '1 234 567', to: '2 234 567', fromValue: 1234567, toValue: 2234567 });
});

test('suspended compounds are not joined across a line break; soft hyphens are', () => {
  assert.deepEqual(texts(['Die Tabelle zeigt alle Ein-', 'und Ausgaben des Jahres.'], ['Die Tabelle zeigt alle Ein- und Ausgaben des Jahres.']), []);
  assert.deepEqual(texts(['Both the pre-', 'and post-war periods.'], ['Both the pre- and post-war periods.']), []);
  // An ordinary break before a conjunction-like syllable still joins.
  assert.deepEqual(texts(['The best pho-', 'to of the year.'], ['The best photo of the year.']), []);
  // Soft hyphen (U+00AD) at a line end and inside a line.
  assert.deepEqual(texts(['We collect infor­', 'mation about it.'], ['We collect information about it.']), []);
  assert.deepEqual(texts(['We collect infor­mation about it.'], ['We collect information about it.']), []);
  const m = buildDocModel(makeDoc('a', [[['We collect infor­', 'mation about it.']]]));
  const word = m.tokens.find((t) => t.text === 'information');
  assert.ok(word && word.rects.length === 2);
  assert.ok(!m.tokens.some((t) => t.text.includes('­')));
});

test('hyphens inside words are compared; a compound broken at its hyphen is not a change', () => {
  assert.deepEqual(texts(['The members will re-sign the contract.'], ['The members will resign the contract.']), ['re-sign→resign']);
  assert.deepEqual(texts(['Ask the co-op today.'], ['Ask the coop today.']), ['co-op→coop']);
  // Re-flow: "well-" / "known" on two lines equals "well-known" on one, both ways.
  assert.deepEqual(texts(['This is a well-', 'known fact.'], ['This is a well-known fact.']), []);
  assert.deepEqual(texts(['This is a well-known fact.'], ['This is a well-', 'known fact.']), []);
  assert.deepEqual(texts(['This is infor-', 'mation for you.'], ['This is information for you.']), []);
  const r = cmp(['This is a well-', 'known fact.'], ['This is a well-known fact.']);
  assert.ok(r.oldDoc.tokens.some((t) => t.text === 'well-known'));
});

test('rules and leaders are one token; leader length does not matter', () => {
  const rule = '_'.repeat(50);
  assert.deepEqual(tokens(`Tenant signature: ${rule} date`), ['Tenant', 'signature', ':', rule, 'date']);
  const added = cmp(['Tenant signature: date'], [`Tenant signature: ${rule} date`]);
  assert.equal(added.changes.length, 1);
  assert.equal(added.changes[0].new.text, rule);
  assert.equal(added.changes[0].new.start! + 1, added.changes[0].new.end);
  // A TOC entry whose page number changes: the leader shrinks with it.
  const toc = cmp(['Introduction........9'], ['Introduction.......10']);
  assert.deepEqual(toc.changes.map((c) => c.numeric && `${c.numeric.from}→${c.numeric.to}`), ['9→10']);
  // A shorter rule is still reported.
  assert.equal(cmp([`Sign here: ${'_'.repeat(40)}`], [`Sign here: ${'_'.repeat(20)}`]).changes.length, 1);
});

test('hyphen and en-dash ranges tokenise alike and compare equal', () => {
  assert.deepEqual(tokens('See pages 10–20 now'), ['See', 'pages', '10–20', 'now']);
  for (const [a, b] of [
    ['See pages 10-20 for details.', 'See pages 10–20 for details.'],
    ['Fiscal 2025-2026 report', 'Fiscal 2025–2026 report'],
    ['a well-known fact', 'a well–known fact'],
  ])
    assert.deepEqual(texts([a], [b]), [], `${a} / ${b}`);
  assert.deepEqual(texts(['See pages 10-20 for details.'], ['See pages 10–25 for details.']), ['10-20→10–25']);
});

test('full-width amounts are numbers', () => {
  assert.deepEqual(tokens('合同金额为１２，０００元。'), ['合', '同', '金', '额', '为', '１２，０００', '元', '。']);
  const r = cmp(['合同金额为１２，０００元。'], ['合同金额为１５，０００元。']);
  assert.equal(r.changes.length, 1);
  assert.deepEqual(r.changes[0].numeric, { from: '１２，０００', to: '１５，０００', fromValue: 12000, toValue: 15000 });
});

test('ligatures, quote styles and full-width forms are ignored; real edits are not', () => {
  for (const [a, b] of [
    ['The ﬁnal report is ready.', 'The final report is ready.'],
    ['He said “yes” and ‘no’.', 'He said "yes" and \'no\'.'],
    ['Fee: ８,０００ dollars', 'Fee: 8,000 dollars'],
    ['Fee: ８，０００ dollars', 'Fee: 8,000 dollars'],
    ['Ref （123） here', 'Ref (123) here'],
    ['Ref （１２３） here', 'Ref (123) here'],
    ['金额（１２３）元', '金额(123)元'],
    ['ＡＢＣ　Ｃｏｒｐ', 'ABC Corp'],
  ])
    assert.deepEqual(texts([a], [b]), [], `${a} / ${b}`);
  // Counter-examples: the same normalisations must not hide real edits.
  assert.deepEqual(texts(['The ﬁnal report is ready.'], ['The ﬁrst report is ready.']), ['ﬁnal→ﬁrst']);
  assert.deepEqual(texts(['He said “yes” today.'], ['He said "no" today.']), ['yes→no']);
  assert.deepEqual(texts(['Ref （１２３） here'], ['Ref (124) here']).length, 1);
});

test('Japanese is compared character by character; Korean word by word', () => {
  const ja = cmp(['契約期間は三年です。'], ['契約期間は四年です。']);
  assert.deepEqual(ja.changes.map((c) => [c.old.text, c.new.text, c.cjk, c.size]), [['三', '四', true, 1]]);
  const kana = cmp(['テストを行います。'], ['テキストを行います。']);
  assert.deepEqual(kana.changes.map((c) => [c.kind, c.new.text, c.cjk]), [['insert', 'キ', true]]);
  // Korean separates words with spaces: a word is the unit, and a line break is a space.
  const ko = cmp(['계약 기간은 삼 년입니다.'], ['계약 기간은 사 년입니다.']);
  assert.deepEqual(ko.changes.map((c) => [c.old.text, c.new.text, c.cjk]), [['삼', '사', false]]);
  assert.deepEqual(texts(['계약 기간은', '삼 년입니다.'], ['계약 기간은 삼 년입니다.']), []);
});
