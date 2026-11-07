import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareDocs } from '../src/core/compare.ts';
import { makeDoc, model } from './helpers.ts';

const words = 'alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma tau upsilon phi chi psi omega'.split(' ');
function para(seed: number): string[] {
  let s = seed;
  const next = () => ((s = (s * 48271) % 2147483647) % words.length);
  return Array.from({ length: 4 }, (_, l) => Array.from({ length: 12 }, () => words[next()]).join(' ') + ` ${seed}.${l}`);
}

test('a 300-page document compares in well under a few seconds', () => {
  const pagesA = Array.from({ length: 300 }, (_, p) => Array.from({ length: 6 }, (_, k) => para(p * 6 + k + 1)));
  const pagesB = pagesA.map((pg, p) => (p % 25 === 0 ? [...pg.slice(0, 2), ['An inserted remark.'], ...pg.slice(2)] : pg));
  const a = model(makeDoc('a', pagesA));
  const b = model(makeDoc('b', pagesB));
  const t0 = performance.now();
  const r = compareDocs(a, b);
  const ms = performance.now() - t0;
  assert.equal(r.changes.length, 12);
  assert.ok(ms < 5000, `took ${ms.toFixed(0)} ms`);
});
