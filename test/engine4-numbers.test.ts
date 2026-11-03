// Figures: magnitudes and units written onto them, list labels, figures
// side by side, separators, rates with a space before "%", currencies and
// decimal separators read alike in both versions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareDocs } from '../src/core/compare.ts';
import { describeChange } from '../src/core/describe.ts';
import { decimalMark, isNumericPhrase, parseNumber } from '../src/core/numbers.ts';
import { buildDocModel } from '../src/core/tokenize.ts';
import { makeDoc, model } from './helpers.ts';

const P0 = ['The figures below are taken from the unaudited interim statement of the group.'];
/** Descriptions of the text changes between two paragraphs (given as lines). */
const changed = (a: string[], b: string[], lang: 'en' | 'zh' = 'en') =>
  compareDocs(model(makeDoc('a', [[P0, a]])), model(makeDoc('b', [[P0, b]])))
    .changes.filter((c) => c.category === 'text')
    .map((c) => describeChange(lang, c));
const tokens = (s: string) => buildDocModel(makeDoc('a', [[[s]]])).tokens.map((t) => t.text);

test('a magnitude written onto a figure stays in the description', () => {
  assert.deepEqual(changed(['Free cash flow −£7.4m in the half year.'], ['Free cash flow −£4.7m in the half year.']), ['Number changed: −£7.4m → −£4.7m (-36%)']);
  assert.deepEqual(changed(['Net debt was £2.7m at the end of June.'], ['Net debt was £3.1m at the end of June.']), ['Number changed: £2.7m → £3.1m (+15%)']);
  // Another magnitude: no percentage computed across "m" and "bn".
  assert.deepEqual(changed(['Net debt was £2.7m at the end of June.'], ['Net debt was £2.7bn at the end of June.']), ['Number changed: £2.7m → £2.7bn']);
  assert.ok(isNumericPhrase(['7.42p']) && isNumericPhrase(['−£7.4', 'm']) && !isNumericPhrase(['3rd']));
});

test('a plain figure at the start of a line keeps its sign check and percentage; two list labels do not get one', () => {
  assert.deepEqual(changed(['Bolts in stock', '40 boxes at the Hamburg depot'], ['Bolts in stock', '-40 boxes at the Hamburg depot']), [
    'Number changed: 40 → -40 (sign changed)',
  ]);
  assert.deepEqual(changed(['The notice period is', '14 days from the date of the letter.'], ['The notice period is', '28 days from the date of the letter.']), [
    'Number changed: 14 → 28 (+100%)',
  ]);
  assert.deepEqual(changed(['Conditions apply.', '(3) The buyer pays on delivery.'], ['Conditions apply.', '(4) The buyer pays on delivery.']), ['Number changed: (3) → (4)']);
  assert.deepEqual(changed(['Conditions apply.', '3. The buyer pays on delivery.'], ['Conditions apply.', '4. The buyer pays on delivery.']), ['Number changed: 3 → 4']);
});

test('3-digit figures side by side stay separate numbers', () => {
  assert.deepEqual(tokens('Daily counts were 120 135 150 last week').slice(3, 6), ['120', '135', '150']);
  assert.deepEqual(tokens('Totals: 250 400 550').slice(2), ['250', '400', '550']);
  assert.deepEqual(changed(['Daily counts were 120 135 150 last week.'], ['Daily counts were 120 140 150 last week.']), ['Number changed: 135 → 140 (+3.7%)']);
  assert.deepEqual(changed(['Totals: 250 400 550 in all.'], ['Totals: 250 400 -550 in all.']), ['Number changed: 550 → -550 (sign changed)']);
  // Still one number: a short lead with several groups, groups starting with a zero.
  assert.ok(tokens('Population 1 234 567 people').includes('1 234 567'));
  assert.ok(tokens('La ville compte 120 000 habitants').includes('120 000'));
});

test('a figure that may be the second group of a space-grouped number gets no percentage', () => {
  // "4 500" may be 4,500 written with a no-break space (which PDF producers
  // write as a plain space) or two figures: no percentage rather than a wrong one.
  assert.deepEqual(changed(['La ville compte 120 000 habitants et 4 500 entreprises.'], ['La ville compte 120 500 habitants et 4 800 entreprises.']), [
    'Number changed: 120 000 → 120 500',
    'Number changed: 500 → 800',
  ]);
  assert.deepEqual(changed(['La ville compte 4 500 entreprises.'], ['La ville compte 6 500 entreprises.']), ['Number changed: 4 → 6']);
  // Both figures of the pair changed: two separate changes, each with its percentage, as before.
  assert.deepEqual(changed(['Pens and markers 10 500 in stock.'], ['Pens and markers 50 100 in stock.']), [
    'Number changed: 10 → 50 (+400%)',
    'Number changed: 500 → 100 (-80%)',
  ]);
});

test('figures in a list are split without their separators', () => {
  assert.deepEqual(changed(['Values were 10, 20 and 30 in the test.'], ['Values were 15, 25 and 30 in the test.']), [
    'Number changed: 10 → 15 (+50%)',
    'Number changed: 20 → 25 (+25%)',
  ]);
  assert.deepEqual(changed(['Fees: 8,000; 12% surcharge.'], ['Fees: 9,500; 3% surcharge.']), ['Number changed: 8,000 → 9,500 (+19%)', 'Number changed: 12% → 3% (-9 pp)']);
});

test('a rate with a space before % changes by percentage points', () => {
  assert.deepEqual(changed(['Der Zinssatz beträgt 12,5 % pro Jahr.'], ['Der Zinssatz beträgt 15 % pro Jahr.']), ['Number changed: 12,5 % → 15 % (+2.5 pp)']);
  assert.deepEqual(changed(['Der Zinssatz beträgt 0,125 % pro Jahr.'], ['Der Zinssatz beträgt 0,15 % pro Jahr.']), ['Number changed: 0,125 % → 0,15 % (+0.025 pp)']);
});

test('an amount whose currency changed gets no percentage', () => {
  assert.deepEqual(changed(['The fee is 300 EUR per month.'], ['The fee is 350 USD per month.']), ['Number changed: 300 EUR → 350 USD']);
  assert.deepEqual(changed(['The fee is 300 EUR per month.'], ['The fee is 350 EUR per month.']), ['Number changed: 300 → 350 (+17%)']);
});

test('both versions of a figure are read with the same decimal separator', () => {
  assert.equal(decimalMark('1.234,50'), ',');
  assert.equal(decimalMark('0,125'), ',');
  assert.equal(decimalMark('1,234.5'), '.');
  assert.equal(decimalMark('1.234'), null);
  assert.equal(decimalMark('8,000'), null);
  assert.equal(parseNumber('1.234', ','), 1234);
  assert.equal(parseNumber('8,000', '.'), 8000);
  assert.equal(parseNumber('1.234'), 1.234);
  const r = compareDocs(model(makeDoc('a', [[P0, ['Betrag 1.234 Euro gesamt']]])), model(makeDoc('b', [[P0, ['Betrag 1.234,50 Euro gesamt']]])));
  assert.deepEqual(r.changes[0].numeric, { from: '1.234', to: '1.234,50', fromValue: 1234, toValue: 1234.5 });
  assert.equal(describeChange('en', r.changes[0]), 'Number changed: 1.234 → 1.234,50');
});
