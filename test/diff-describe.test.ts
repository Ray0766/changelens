// Wording of number and punctuation changes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareDocs } from '../src/core/compare.ts';
import { describeChange, notices } from '../src/core/describe.ts';
import { makeDoc, model } from './helpers.ts';

const one = (a: string, b: string) => {
  const r = compareDocs(model(makeDoc('a', [[[a]]])), model(makeDoc('b', [[[b]]])));
  assert.equal(r.changes.length, 1, r.changes.map((c) => describeChange('en', c)).join(' | '));
  return { en: describeChange('en', r.changes[0]), zh: describeChange('zh', r.changes[0]), r };
};

test('a change made only of punctuation is quoted, never "0 words"', () => {
  const rule = (n: number) => '_'.repeat(n);
  const added = one('Tenant signature: date', `Tenant signature: ${rule(50)} date`);
  assert.equal(added.en, `Added “${rule(47)}…”`);
  assert.equal(added.zh, `新增「${rule(47)}…」`);
  // A signature rule does not make the page look like new content.
  assert.ok(!notices('en', added.r).some((n) => n.text.includes('mostly new content')));
  // Rules are one token each, so a shortened rule is a change of length.
  const shorter = one(`Signature: ${rule(110)} date`, `Signature: ${rule(50)} date`);
  assert.equal(shorter.en, 'Line of “_” changed length: 110 → 50 characters');
  assert.equal(shorter.zh, '「_」连线长度变化：110 → 50 个字符');
  assert.equal(one(`See ${'-'.repeat(45)} here`, `See ${'='.repeat(45)} here`).en, `Changed “${'-'.repeat(39)}…” → “${'='.repeat(39)}…”`);
});

test('a growing negative amount gets the same percentage in both notations', () => {
  assert.equal(one('Net loss (1,200) this year', 'Net loss (1,500) this year').en, 'Number changed: (1,200) → (1,500) (+25%)');
  assert.equal(one('Net loss -1,200 this year', 'Net loss -1,500 this year').en, 'Number changed: -1,200 → -1,500 (+25%)');
  assert.equal(one('Net loss −1,200 this year', 'Net loss −1,500 this year').en, 'Number changed: −1,200 → −1,500 (+25%)');
});

test('a list label restyled from "(1)" to "1)" is not a sign change', () => {
  const c = one('(1) The tenant pays the rent monthly.', '1) The tenant pays the rent monthly.');
  assert.equal(c.en, 'Number changed: (1) → 1)');
  assert.equal(c.zh, '数字变化：(1) → 1)');
});

test('a rate in percent changes by percentage points', () => {
  const c = one('Interest rate 12.5% per year', 'Interest rate 15% per year');
  assert.equal(c.en, 'Number changed: 12.5% → 15% (+2.5 pp)');
  assert.equal(c.zh, '数字变化：12.5% → 15%（+2.5 个百分点）');
  assert.equal(one('Discount 4.25% applies', 'Discount 4% applies').en, 'Number changed: 4.25% → 4% (-0.25 pp)');
});
