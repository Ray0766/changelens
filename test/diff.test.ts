import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanupSemantic, intern, matchSequences, opsFromMatches } from '../src/core/diff.ts';

function lcsLength(a: Int32Array, b: Int32Array): number {
  const dp = Array.from({ length: a.length + 1 }, () => new Int32Array(b.length + 1));
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
  return dp[a.length][b.length];
}

function rng(seed: number) {
  return () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
}

test('matches are a valid common subsequence', () => {
  const r = rng(7);
  for (let k = 0; k < 200; k++) {
    const n = Math.floor(r() * 40);
    const a = Int32Array.from({ length: n }, () => Math.floor(r() * 6));
    const b = Int32Array.from(a.filter(() => r() > 0.2)).map((v) => (r() > 0.85 ? Math.floor(r() * 6) : v));
    const m = matchSequences(a, b);
    let pa = -1;
    let pb = -1;
    for (let p = 0; p < m.length; p += 2) {
      assert.ok(m[p] > pa && m[p + 1] > pb, 'strictly increasing');
      assert.equal(a[m[p]], b[m[p + 1]]);
      pa = m[p];
      pb = m[p + 1];
    }
    // Patience diff is not always minimal, but it must stay close to the LCS.
    assert.ok(m.length / 2 >= lcsLength(a, b) * 0.6, `quality ${m.length / 2} vs ${lcsLength(a, b)}`);
  }
});

test('Myers finds the optimal LCS when there are no unique anchors', () => {
  const a = Int32Array.from([1, 2, 1, 2, 1, 2, 1]);
  const b = Int32Array.from([2, 1, 2, 1, 1, 2]);
  assert.equal(matchSequences(a, b).length / 2, lcsLength(a, b));
});

test('ops cover both sequences completely', () => {
  const [a, b] = intern('the price is 8,000 dollars'.split(' '), 'the total price is 9,500 dollars'.split(' '));
  const ops = opsFromMatches(matchSequences(a, b), a.length, b.length);
  let na = 0;
  let nb = 0;
  for (const op of ops) {
    na += op.a1 - op.a0;
    nb += op.b1 - op.b0;
  }
  assert.equal(na, a.length);
  assert.equal(nb, b.length);
  assert.deepEqual(
    ops.map((o) => o.type),
    ['equal', 'insert', 'equal', 'delete', 'insert', 'equal'],
  );
});

test('semantic clean-up dissolves tiny coincidental equalities', () => {
  const words = (s: string) => s.split(' ');
  const A = words('we will deliver the full website in ten weeks');
  const B = words('our team ships a new site to the client within ten weeks');
  const [a, b] = intern(A, B);
  const raw = opsFromMatches(matchSequences(a, b), a.length, b.length);
  const clean = cleanupSemantic(raw, (i) => A[i].length, (i) => B[i].length, (eq) => eq.a1 - eq.a0 <= 2);
  const changes = clean.filter((o) => o.type !== 'equal');
  assert.ok(changes.length <= 2, JSON.stringify(clean));
  assert.equal(clean[clean.length - 1].type, 'equal');
});
