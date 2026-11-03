// Regression guard for the evaluation corpus (eval/cases + eval/extra-cases.json):
// every truth item must be found on the right page with no extra items.
// See docs/EVALUATION.md for what this does and does not prove.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { canRender } from '../src/node/render.ts';

test('evaluation corpus: all truth found and located, no noise', { skip: !(await canRender()) && 'no canvas', timeout: 300_000 }, () => {
  const out = join(mkdtempSync(join(tmpdir(), 'cl-eval-')), 'results.json');
  execFileSync(process.execPath, [new URL('../eval/run.ts', import.meta.url).pathname, '--json', out], { stdio: 'pipe' });
  const { totals, results } = JSON.parse(readFileSync(out, 'utf8'));
  const cl = totals.changelens;
  const failing = Object.entries(results as Record<string, { changelens: { found: number; located: number; total: number; extra: number } }>)
    .filter(([, r]) => r.changelens.found < r.changelens.total || r.changelens.located < r.changelens.total || r.changelens.extra > 0)
    .map(([id, r]) => `${id}: ${JSON.stringify(r.changelens)}`);
  assert.deepEqual(failing, []);
  assert.equal(cl.found, cl.total);
  assert.equal(cl.extra, 0);
});
