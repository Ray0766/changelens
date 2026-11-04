// Extraction (fix round 8): a text run whose matrix is not finite (a scale
// of 401 digits, read as Infinity) has no position. It is left out and its
// characters are counted in the unreadable-characters notice, so unchanged
// lines are not reported as "moved NaN mm". The PDFs are review-round-7
// probes (synthetic raw PDF and reportlab), copied to test/fixtures/probe8-R6-11-*.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openPdf } from '../src/node/pdf.ts';
import { extractText } from '../src/pdf/extract.ts';
import { buildDocModel } from '../src/core/tokenize.ts';
import { compareDocs } from '../src/core/compare.ts';
import { describeChange, notices } from '../src/core/describe.ts';
import type { CompareResult } from '../src/core/types.ts';

const fixtures = new URL('./fixtures/', import.meta.url).pathname;
async function run(before: string, after: string): Promise<CompareResult> {
  const a = buildDocModel(await extractText(await openPdf(`${fixtures}probe8-${before}.pdf`), 'before.pdf'));
  const b = buildDocModel(await extractText(await openPdf(`${fixtures}probe8-${after}.pdf`), 'after.pdf'));
  return compareDocs(a, b);
}

test('R6-11: a run with an infinite text matrix is counted as unreadable, not compared', async () => {
  for (const [before, after, figure] of [
    ['R6-11-before', 'R6-11-after', 'Number changed: 4,800.00 → 4,300.00 (-10%)'],
    ['R6-11-cm-before', 'R6-11-cm-after', 'Number changed: 240 → 230 (-4.2%)'],
  ]) {
    const r = await run(before, after);
    assert.deepEqual(r.changes.map((c) => describeChange('en', c)), [figure]);
    assert.ok(r.oldDoc.tokens.every((t) => t.rects.every((x) => [x.x, x.y, x.w, x.h].every(Number.isFinite))));
    assert.ok(r.coverage.old.unreadable.length === 1 && r.coverage.new.unreadable.length === 1, JSON.stringify(r.coverage));
    assert.ok(notices('en', r).some((n) => /characters? could not be read as text/.test(n.text)));
  }
});
