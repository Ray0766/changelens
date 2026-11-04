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

test('R6-09: font names come from the page content’s operator list, without the widgets’ appearances', async () => {
  // A form of 2,000 fields took about 1 GB and 11 s per document when the
  // operator list included every widget's appearance stream and fonts.
  const calls: unknown[] = [];
  const page = {
    getViewport: () => ({ width: 595.28, height: 841.89, transform: [1, 0, 0, -1, 0, 841.89] }),
    getTextContent: async () => ({ items: [{ str: 'Total', transform: [10, 0, 0, 10, 56, 700], width: 24, hasEOL: true, fontName: 'f1' }], styles: { f1: { fontFamily: 'sans-serif', ascent: 0.9, descent: -0.2 } } }),
    getOperatorList: async (opts?: unknown) => void calls.push(opts),
    getAnnotations: async () => [],
    commonObjs: { get: () => ({ name: 'ABCDEF+Body-Bold' }) },
  };
  const { extractPage } = await import('../src/pdf/extract.ts');
  const p = await extractPage(page as never, 0);
  assert.deepEqual(calls, [{ annotationMode: 0 }]);
  assert.equal(p.runs[0].font, 'Body-Bold');
});
