// The context shown around a changed figure: a unit or currency sign that is
// shown as part of the figure ("1.50%" → "1.05%", "€62.40") is not repeated
// at the start or end of the context around it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareDocs } from '../src/core/compare.ts';
import { makeDoc, model } from './helpers.ts';

const P0 = ['The service terms are set out in this schedule for the tenant.'];
const one = (a: string, b: string) => {
  const r = compareDocs(model(makeDoc('a', [[P0, [a]]])), model(makeDoc('b', [[P0, [b]]])));
  assert.equal(r.changes.length, 1);
  const c = r.changes[0];
  return [c.contextBefore, c.old.text, c.new.text, c.contextAfter];
};

test('a percent sign written onto the figure is not repeated in the context after it', () => {
  const [before, from, to, after] = one('The late fee is 1.50% of the amount due.', 'The late fee is 1.05% of the amount due.');
  assert.match(before, /The late fee is$/);
  assert.deepEqual([from, to, after], ['1.50%', '1.05%', 'of the amount due.']);
});

test('a currency sign before the figure is not repeated in the context before it', () => {
  const [before, from, to, after] = one('The deposit is €62.40 per month.', 'The deposit is €64.80 per month.');
  assert.equal(from, '€62.40');
  assert.equal(to, '€64.80');
  assert.ok(!/€\s*$/.test(before), `context before: ${before}`);
  assert.equal(after, 'per month.');
});

test('a percent sign set after a space is not repeated either', () => {
  const [, from, to, after] = one('Der Zinssatz beträgt 12,5 % pro Jahr.', 'Der Zinssatz beträgt 13,5 % pro Jahr.');
  assert.equal(from, '12,5 %');
  assert.equal(to, '13,5 %');
  assert.equal(after, 'pro Jahr.');
});
