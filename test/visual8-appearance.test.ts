// Visual stage, fix round 8: colour, weight and lines of matched text next
// to graphics (review round 7). Fixtures test/fixtures/probe8-R5-13-*.pdf
// are copies of the SYNTHETIC probe and verifier PDFs of round 7 (openpyxl
// → LibreOffice Calc 24.2; rules overlaid with pypdf).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openPdf } from '../src/node/pdf.ts';
import { renderPage, canRender } from '../src/node/render.ts';
import { extractText } from '../src/pdf/extract.ts';
import { buildDocModel } from '../src/core/tokenize.ts';
import { compareDocs } from '../src/core/compare.ts';
import { addVisualChanges } from '../src/core/pipeline.ts';
import { describeChange } from '../src/core/describe.ts';
import type { Change, CompareResult } from '../src/core/types.ts';

const fixtures = new URL('./fixtures/', import.meta.url).pathname;
const skip = !(await canRender()) && 'no canvas';

async function run(before: string, after: string): Promise<CompareResult> {
  const pa = await openPdf(fixtures + before);
  const pb = await openPdf(fixtures + after);
  const r = compareDocs(buildDocModel(await extractText(pa, 'old')), buildDocModel(await extractText(pb, 'new')));
  await addVisualChanges(r, (p) => renderPage(pa, p, 1.5), (p) => renderPage(pb, p, 1.5));
  return r;
}
const list = (cs: Change[]) => cs.map((c) => describeChange('en', c));

test('R5-13: a red rule drawn under a repeated header copy does not recolour the data row whose tall boxes reach it', { skip }, async () => {
  // Calc word boxes are 13.4 pt tall for 10 pt text; one row inserted near
  // the top re-flows the sheet. Before (round 6): "Text colour or weight
  // changed" for “IT-3089 Bearing 6205 B30 84 32.67”, unchanged and black.
  for (const [file, page] of [
    ['probe8-R5-13-ins-rule-p3.pdf', 3],
    ['probe8-R5-13-ins-rule-p2.pdf', 2],
  ] as const) {
    const r = await run('probe8-R5-13-before.pdf', file);
    assert.deepEqual(list(r.changes), ['Added “IT-2999 Anchor bolt M16 B07 12 3.4”', 'Graphic or image added'], file);
    const g = r.changes[1];
    assert.ok(g.new.rects.some((q) => q.page === page - 1 && q.rect.y < 92 && q.rect.y + q.rect.h > 84), JSON.stringify(g.new.rects));
  }
  // Control: the insertion alone.
  const c = await run('probe8-R5-13-before.pdf', 'probe8-R5-13-ins.pdf');
  assert.deepEqual(list(c.changes), ['Added “IT-2999 Anchor bolt M16 B07 12 3.4”']);
});
