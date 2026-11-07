// Visual stage, fix round 8: pages turned by /Rotate (review round 7,
// findings R5-01 to R5-04, R5-V01, R6-03, R6-V01 and R7-08). Before, a
// turned pair was compared as it was drawn, and each region found there
// was then checked against the same graphic turned with the page: edits
// below 15 % of a cluster's ink were folded into the page change, regions
// that the row mapping sent off the page were never compared, thin rules
// and light fills that turned were listed, and a half turn was no page
// change at all. Now the new page is turned back and compared as any other
// pair. Fixtures test/fixtures/probe8-R*.pdf are copies of the SYNTHETIC
// probe and verifier PDFs of round 7 (Chromium via Playwright and
// reportlab, turned with pypdf).
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
/** A place of the change on that side contains the point (1-based page, give or take 2 pt). */
const hits = (c: Change, side: 'old' | 'new', page: number, x: number, y: number) =>
  c[side].rects.some((q) => q.page === page - 1 && x >= q.rect.x - 2 && x <= q.rect.x + q.rect.w + 2 && y >= q.rect.y - 2 && y <= q.rect.y + q.rect.h + 2);
const TURNED = 'Page size changed: 595 × 842 pt → 842 × 595 pt';

test('R5-01: a cell filled red, a bar made taller or a status square recoloured on a turned page is listed at its place', { skip }, async () => {
  // Page 2 (chart, callout, ruled table) turned by 90°. Before: only the page
  // change, whose places were the whole cluster, as for the turn alone.
  // Old (x, y) is new (842 − y, x) after a quarter turn.
  const cell = await run('probe8-R5-01-before.pdf', 'probe8-R5-01-cell90.pdf');
  assert.deepEqual(list(cell.changes), [TURNED, 'Graphic or image changed']);
  const g = graphics(cell)[0];
  assert.ok(hits(g, 'old', 2, 490, 410) && hits(g, 'new', 2, 842 - 410, 490), JSON.stringify(g));
  const bar = await run('probe8-R5-01-before.pdf', 'probe8-R5-01-bar90.pdf');
  assert.deepEqual(list(bar.changes), [TURNED, 'Graphic or image changed']);
  assert.ok(hits(graphics(bar)[0], 'old', 2, 205, 212), JSON.stringify(graphics(bar)[0]));
  // reportlab, turned by 270°: the WP4 status square green → red.
  const rag = await run('probe8-R5-01-rag-before.pdf', 'probe8-R5-01-rag270.pdf');
  assert.deepEqual(list(rag.changes), [TURNED, 'Graphic or image changed']);
  assert.ok(hits(graphics(rag)[0], 'old', 2, 472, 254), JSON.stringify(graphics(rag)[0]));
  // Control: the turn alone is one item, and its places are the pages.
  const ctl = await run('probe8-R5-01-before.pdf', 'probe8-R5-01-ctl90.pdf');
  assert.deepEqual(list(ctl.changes), [TURNED]);
  assert.deepEqual(ctl.changes[0].new.rects.map((q) => [q.rect.w, q.rect.h].map(Math.round)), [[842, 595]]);
});

test('R5-V01, R6-V01: thin rules and signature lines that only turned with the page are not listed', { skip }, async () => {
  // 0.5 pt table rules (reportlab) and 0.6 pt signature lines turned by 90°:
  // before, "Graphic or image changed" / "added" beside the page change.
  const rag = await run('probe8-R5-01-rag-before.pdf', 'probe8-R5-V01-rag-rot90.pdf');
  assert.deepEqual(list(rag.changes), [TURNED]);
  const letter = await run('probe8-R5-V01-letter.pdf', 'probe8-R5-V01-letter90.pdf');
  assert.deepEqual(list(letter.changes), [TURNED]);
  // A 0.5 pt grid on both pages of an invoice, every page turned.
  const grid = await run('probe8-R6-V01-before.pdf', 'probe8-R6-V01-turned90.pdf');
  assert.deepEqual(list(grid.changes), [`${TURNED} (in 2 places)`]);
});

test('R6-03: light zebra stripes on pages turned by 270° are not listed', { skip }, async () => {
  // #ececec stripes: before, every stripe region was "Graphic or image removed".
  const r = await run('probe8-R6-03-before.pdf', 'probe8-R6-03-turned270.pdf');
  assert.deepEqual(list(r.changes), [`${TURNED} (in 2 places)`]);
});

test('R5-02: a tick added on a turned page is found wherever the rows of the turned page map', { skip }, async () => {
  // Page 3 (text only) turned by 270°, a red tick at old (480, 300) in the
  // margin. Before: not compared at all, only the page change.
  const r = await run('probe8-R5-01-before.pdf', 'probe8-R5-02-tick270.pdf');
  assert.deepEqual(list(r.changes), [TURNED, 'Graphic or image added']);
  // Old (x, y) is new (y, 595 − x) after a turn by 270°.
  assert.ok(hits(graphics(r)[0], 'new', 3, 308, 595 - 488), JSON.stringify(graphics(r)[0]));
  // A letter turned by 90° with a 14 pt tick beside the text.
  const l = await run('probe8-R5-V01-letter.pdf', 'probe8-R5-02-letter90-tick.pdf');
  assert.deepEqual(list(l.changes), [TURNED, 'Graphic or image added']);
  assert.ok(hits(graphics(l)[0], 'new', 1, 842 - 407, 487), JSON.stringify(graphics(l)[0]));
});

test('R5-03: a bar made taller on a turned chart page whose only text is its caption is listed', { skip }, async () => {
  // "Figure 2" is too few words to fit the turn to; the turn comes from the
  // direction of the text and the page size.
  const r = await run('probe8-R5-03-before.pdf', 'probe8-R5-03-bar90.pdf');
  assert.deepEqual(list(r.changes), [TURNED, 'Graphic or image changed']);
  assert.ok(hits(graphics(r)[0], 'old', 2, 270, 120), JSON.stringify(graphics(r)[0]));
  const ctl = await run('probe8-R5-03-before.pdf', 'probe8-R5-03-ctl90.pdf');
  assert.deepEqual(list(ctl.changes), [TURNED]);
});

test('R5-04, R7-08: a page turned upside down is a page change, and a tick added on it is listed', { skip }, async () => {
  // Before: "No differences found" for a text page, a whole-page "Graphic
  // or image changed" for a chart page, with or without the tick.
  const text = await run('probe8-R5-01-before.pdf', 'probe8-R5-04-text180.pdf');
  assert.deepEqual(list(text.changes), ['Page turned by 180°']);
  assert.deepEqual(text.changes[0].new.pages, [2]);
  const letter = await run('probe8-R7-08-before.pdf', 'probe8-R7-08-after.pdf');
  assert.deepEqual(list(letter.changes), ['Page turned by 180°']);
  // reportlab: before, "Graphic or image added" and "Underlined: “7”" for the turn alone.
  const rl = await run('probe8-R5-V01-letter.pdf', 'probe8-R5-04-letter180.pdf');
  assert.deepEqual(list(rl.changes), ['Page turned by 180°']);
  // The red tick at new (99, 526) on the chart page turned by 180°.
  const tick = await run('probe8-R5-01-before.pdf', 'probe8-R5-04-tick180.pdf');
  assert.deepEqual(list(tick.changes), ['Page turned by 180°', 'Graphic or image changed']);
  assert.ok(hits(graphics(tick)[0], 'new', 2, 108, 532), JSON.stringify(graphics(tick)[0]));
  // Landscape pages flipped from /Rotate 90 to 270: a half turn of both.
  const flip = await run('probe8-R5-04-flip-before.pdf', 'probe8-R5-04-flip.pdf');
  assert.deepEqual(list(flip.changes), ['Page turned by 180° (in 2 places)']);
  const flipTick = await run('probe8-R5-04-flip-before.pdf', 'probe8-R5-04-flip-tick.pdf');
  assert.deepEqual(list(flipTick.changes), ['Page turned by 180° (in 2 places)', 'Graphic or image changed']);
  assert.ok(hits(graphics(flipTick)[0], 'new', 2, 308, 108), JSON.stringify(graphics(flipTick)[0]));
});
