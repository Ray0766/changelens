import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isNumericPhrase, parseNumber } from '../src/core/numbers.ts';
import { percentChange } from '../src/core/describe.ts';

test('parseNumber understands common formats', () => {
  assert.equal(parseNumber('8,000'), 8000);
  assert.equal(parseNumber('9,500.50'), 9500.5);
  assert.equal(parseNumber('9.500,50'), 9500.5);
  assert.equal(parseNumber('1.234.567'), 1234567);
  assert.equal(parseNumber('3,5'), 3.5);
  assert.equal(parseNumber('12%'), 12);
  assert.equal(parseNumber('¥3,000'), 3000);
  assert.equal(parseNumber('-42'), -42);
  assert.equal(parseNumber('abc'), null);
});

test('isNumericPhrase accepts amounts with currency and units', () => {
  assert.ok(isNumericPhrase(['8,000']));
  assert.ok(isNumericPhrase(['$', '8,000']));
  assert.ok(isNumericPhrase(['30', '%']));
  assert.ok(isNumericPhrase(['USD', '24,500']));
  assert.ok(!isNumericPhrase(['30', 'November']));
  assert.ok(!isNumericPhrase(['%']));
});

test('percentChange formats the relative difference', () => {
  assert.equal(percentChange(8000, 9500), '+19%');
  assert.equal(percentChange(24500, 26000), '+6.1%');
  assert.equal(percentChange(100, 50), '-50%');
  assert.equal(percentChange(0, 5), null);
  assert.equal(percentChange(5, 5), null);
});

test('minus signs and accounting notation', () => {
  assert.equal(parseNumber('−500'), -500);
  assert.equal(parseNumber('(1,200)'), -1200);
  assert.equal(parseNumber('–3.5'), -3.5);
  assert.ok(isNumericPhrase(['(1,200)']));
  assert.ok(isNumericPhrase(['−500']));
});
