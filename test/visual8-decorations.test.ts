// Visual stage, fix round 8: strikes and underlines (review round 7,
// appearance and robustness probes). Each probe asserts what the reviewer
// must see, next to its control. Fixtures test/fixtures/probe8-R6-05-* and
// probe8-R7-05-* are copies of the SYNTHETIC probe and verifier PDFs of
// round 7 (Chromium via Playwright, reportlab; pypdf for /Rotate).
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

async function compare(before: string, after: string): Promise<CompareResult> {
  const pa = await openPdf(before);
  const pb = await openPdf(after);
  const r = compareDocs(buildDocModel(await extractText(pa, 'old')), buildDocModel(await extractText(pb, 'new')));
  await addVisualChanges(r, (p) => renderPage(pa, p, 1.5), (p) => renderPage(pb, p, 1.5));
  return r;
}
const run = (before: string, after: string) => compare(fixtures + before, fixtures + after);
const list = (cs: Change[]) => cs.map((c) => describeChange('en', c));

test('R6-05, R7-05: a page turned by /Rotate gives no strike or underline on its figures and short words', { skip }, async () => {
  // Before (fix round 7): "Strikethrough removed: “44”" on a page turned by
  // 90°, "Struck through: “is”" twice on one turned by 180°, and 50 items on
  // a Chinese notice turned by 180°.
  const q = await run('probe8-R6-05-old.pdf', 'probe8-R6-05-new90.pdf');
  assert.deepEqual(list(q.changes), ['Page size changed: 595 × 842 pt → 842 × 595 pt']);
  const h = await run('probe8-R7-05-before.pdf', 'probe8-R7-05-after.pdf');
  assert.deepEqual(list(h.changes), ['Page turned by 180°']);
  const cjk = await run('probe8-R7-05-cjk-before.pdf', 'probe8-R7-05-cjk-after.pdf');
  assert.deepEqual(list(cjk.changes), ['Page turned by 180°']);
});
