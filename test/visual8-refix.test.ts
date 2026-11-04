// Visual stage, fix round 8, second pass: what the verifier of the first
// pass found hidden or misplaced. Fixtures test/fixtures/probe8-N*-*.pdf are
// copies of the verifier's SYNTHETIC counter-probes (reportlab, Chromium,
// pypdf overlays).
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
const graphics = (r: CompareResult) => r.changes.filter((c) => c.kind === 'graphic' && !c.format && !c.pageChange);
const hits = (c: Change, side: 'old' | 'new', page: number, x: number, y: number) =>
  c[side].rects.some((q) => q.page === page - 1 && x >= q.rect.x - 2 && x <= q.rect.x + q.rect.w + 2 && y >= q.rect.y - 2 && y <= q.rect.y + q.rect.h + 2);

test('N1: a mark removed or added in a shaded cell whose words changed is listed; the fill under the words is not', { skip }, async () => {
  // reportlab invoice with zebra-shaded rows: "Pump service" gets "and
  // replacement of the shaft seal" in the shaded row, and a 7 pt red status
  // square at (150, 149) where the new words go is removed. Before: only the
  // text item (the region, mark included, was taken for the fill under the
  // new words).
  const removed = await run('probe8-N1-short-tick.pdf', 'probe8-N1-long.pdf');
  assert.deepEqual(list(removed.changes), ['Added “and replacement of the shaft seal”', 'Graphic or image removed'], list(removed.changes).join(' | '));
  const g = graphics(removed)[0];
  assert.ok(hits(g, 'old', 1, 153, 152), JSON.stringify(g.old.rects));
  // Only the mark: not the fill under the new words.
  assert.ok(g.old.rects.every((q) => q.rect.w < 20), JSON.stringify(g.old.rects));
  const added = await run('probe8-N1-long.pdf', 'probe8-N1-short-tick.pdf');
  assert.deepEqual(list(added.changes), ['Deleted “and replacement of the shaft seal”', 'Graphic or image added'], list(added.changes).join(' | '));
  assert.ok(hits(graphics(added)[0], 'new', 1, 153, 152));
  // A yellow "URGENT" badge in the cell, deleted: its words lie in the
  // region, on another colour than the fill.
  const badge = await run('probe8-N1-short-badge.pdf', 'probe8-N1-long.pdf');
  assert.equal(graphics(badge).length, 1, list(badge.changes).join(' | '));
  assert.ok(hits(graphics(badge)[0], 'old', 1, 152, 150));
});
