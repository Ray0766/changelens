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

test('T3-forms-N2: the widgets are drawn only on a page whose fields name their font by a key the form does not standardise', async () => {
  const { extractPage, OPS_READ } = await import('../src/pdf/extract.ts');
  // The operator codes read are those of the installed PDF.js.
  const { OPS } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  assert.deepEqual(OPS_READ, {
    save: OPS.save,
    restore: OPS.restore,
    setFont: OPS.setFont,
    setTextRenderingMode: OPS.setTextRenderingMode,
    showText: [OPS.showText, OPS.showSpacedText, OPS.nextLineShowText, OPS.nextLineSetSpacingShowText],
    paintFormXObjectBegin: OPS.paintFormXObjectBegin,
    paintFormXObjectEnd: OPS.paintFormXObjectEnd,
    beginAnnotation: OPS.beginAnnotation,
    endAnnotation: OPS.endAnnotation,
  });
  const page = (fontName: string, calls: unknown[]) => ({
    getViewport: () => ({ width: 595.28, height: 841.89, transform: [1, 0, 0, -1, 0, 841.89] }),
    getTextContent: async () => ({ items: [{ str: 'Date', transform: [10, 0, 0, 10, 56, 700], width: 20, hasEOL: true, fontName: 'f1' }], styles: { f1: { fontFamily: 'sans-serif', ascent: 0.9, descent: -0.2 } } }),
    getOperatorList: async (opts: { annotationMode: number }) => {
      calls.push(opts);
      // With the widgets: the field's appearance sets font g_d0_f2 and shows its text.
      return opts.annotationMode === 1
        ? { fnArray: [OPS.beginAnnotation, OPS.setFont, OPS.showText, OPS.endAnnotation], argsArray: [['12R'], ['g_d0_f2', 10], [[]], []] }
        : { fnArray: [], argsArray: [] };
    },
    getAnnotations: async () => [{ id: '12R', subtype: 'Widget', fieldType: 'Tx', rect: [235, 690, 535, 708], fieldValue: '12 May 2026', defaultAppearanceData: { fontSize: 10, fontName } }],
    commonObjs: { get: (id: string) => ({ name: id === 'g_d0_f2' ? 'Times-Roman' : 'Helvetica' }) },
  });
  let calls: unknown[] = [];
  let p = await extractPage(page('Helv', calls) as never, 0);
  assert.deepEqual(calls, [{ annotationMode: 0 }]);
  assert.equal(p.runs.find((r) => r.field)?.font, 'Helvetica');
  calls = [];
  const formFonts = new Map<string, string>();
  p = await extractPage(page('F1', calls) as never, 0, formFonts);
  assert.deepEqual(calls, [{ annotationMode: 0 }, { annotationMode: 1 }]);
  assert.equal(p.runs.find((r) => r.field)?.font, 'Times-Roman');
  // A key is read once per document: the next page with /F1 is not drawn.
  calls = [];
  p = await extractPage(page('F1', calls) as never, 1, formFonts);
  assert.deepEqual(calls, [{ annotationMode: 0 }]);
  assert.equal(p.runs.find((r) => r.field)?.font, 'Times-Roman');
});
