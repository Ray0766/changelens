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

test('N2: an underline that runs a few points past its text is still an underline; a table rule along the row is not', { skip }, async () => {
  // reportlab letter: one line underlined, the line drawn 4 pt past its end
  // or past both ends. Chromium: <u>…&nbsp;&nbsp;</u>, about 5 pt past.
  // Before: "No differences found" (reportlab), or only an 8 pt "Graphic or
  // image added" at the line's end (Chromium).
  const UL = 'Underlined: “The deposit of 1,800.00 is refu…”';
  for (const [a, b] of [
    ['probe8-N2-before.pdf', 'probe8-N2-ul-right4.pdf'],
    ['probe8-N2-before.pdf', 'probe8-N2-ul-both4.pdf'],
    ['probe8-N2-c-before.pdf', 'probe8-N2-c-ul-nbsp.pdf'],
  ]) {
    const r = await run(a, b);
    assert.ok(list(r.changes).includes(UL), `${b}: ${list(r.changes).join(' | ')}`);
  }
  // The control of c523b58 holds: a Writer row's border, 58 pt past the
  // text after a split at the page foot, is no underline (R5-12, R5-V02 in
  // visual8-appearance). Nor is a red rule drawn right under a Calc header
  // band in white on blue, which the graphics comparison lists (the band
  // above it, paper below; the rule ends with the header's text).
  const band = await run('probe8-R5-13-before.pdf', 'probe8-N2-calc-rule-noins.pdf');
  assert.ok(!list(band.changes).some((d) => d.startsWith('Underlined')), list(band.changes).join(' | '));
  assert.ok(graphics(band).some((c) => hits(c, 'new', 3, 200, 88)), list(band.changes).join(' | '));
});

test('N3: a chart page that gains a vertical label or a diagonal watermark is still compared visually', { skip }, async () => {
  // reportlab chart page whose only words are "Figure 2" (the R5-03 base),
  // with bar 5 made taller, and a 9 pt "Revision 3 - issued for review" set
  // at 90° in the margin, or a 60 pt "CONFIDENTIAL" at 35°, added with
  // pypdf. Most of the new page's characters run another way; the words
  // both versions have do not. Before: "graphics and images were not
  // compared" for both p. 2, and the bar edit not listed.
  for (const [file, added] of [
    ['probe8-N3-vlabel-bar.pdf', 'Added “Revision 3 - issued for review”'],
    ['probe8-N3-wm-bar.pdf', 'Added “CONFIDENTIAL”'],
  ]) {
    const r = await run('probe8-R5-03-before.pdf', file);
    assert.ok(list(r.changes).includes(added), list(r.changes).join(' | '));
    assert.ok(graphics(r).some((c) => hits(c, 'old', 2, 270, 120) && hits(c, 'new', 2, 270, 120)), `${file}: ${list(r.changes).join(' | ')}`);
    assert.ok(!r.coverage?.old.visualSkipped?.length && !r.coverage?.new.visualSkipped?.length, file);
  }
});

test('N4: a mark in the band of an added watermark, or just beyond a stamp frame, is listed', { skip }, async () => {
  // Chromium quotation (R5-08) with a light grey DRAFT added at 40°: a red
  // tick drawn between its letters "A" and "F", above its capitals and
  // below its baseline. Before: only 'Added “DRAFT”' (the letters' band was
  // masked whole).
  for (const [file, x, y] of [
    ['probe8-N4-wm-tick-gap.pdf', 332, 236],
    ['probe8-N4-wm-tick-above.pdf', 412, 136],
    ['probe8-N4-wm-tick-below.pdf', 356, 336],
  ] as const) {
    const r = await run('probe8-R5-08-wm-before.pdf', file);
    assert.ok(list(r.changes).includes('Added “DRAFT”'), list(r.changes).join(' | '));
    assert.ok(graphics(r).some((c) => hits(c, 'new', 1, x, y)), `${file}: ${list(r.changes).join(' | ')} ${JSON.stringify(graphics(r).map((c) => c.new.rects))}`);
  }
  // A PAID stamp added at -18° with a 6 pt tick against its frame, above or
  // below. Before: the tick went with the frame's region, which the stamp
  // explains.
  for (const [file, x, y] of [
    ['probe8-N4-stamp-tick-above.pdf', 458, 182],
    ['probe8-N4-stamp-tick-below.pdf', 458, 238],
  ] as const) {
    const r = await run('probe8-R5-08-stamp-before.pdf', file);
    assert.ok(graphics(r).some((c) => hits(c, 'new', 1, x, y)), `${file}: ${list(r.changes).join(' | ')}`);
  }
  // SYNTHETIC (pypdf overlay on the R5-V02 Chromium stock sheet): the same
  // 30 % grey DRAFT on both versions, the table moved down 42 pt by two
  // notes, and a tick drawn next to the "F" in the new one.
  const both = await run('probe8-N4-b-wmt.pdf', 'probe8-N4-n-wmt-tick.pdf');
  assert.deepEqual(list(both.changes), ['Added 2 paragraphs', 'Graphic or image added'], list(both.changes).join(' | '));
  assert.ok(hits(graphics(both)[0], 'new', 1, 210, 155));
  // Controls: the watermark alone, added or on both re-flowed versions,
  // gives no graphic item (see also R5-08 in visual8-appearance).
  const reflow = await run('probe8-N4-b-wmt.pdf', 'probe8-N4-n-wmt.pdf');
  assert.deepEqual(list(reflow.changes), ['Added 2 paragraphs']);
  const added = await run('probe8-R5-V02-before.pdf', 'probe8-N4-b-wmt.pdf');
  assert.deepEqual(graphics(added), [], list(added.changes).join(' | '));
});

test('N5: a tick on the row of an added stamp, and a red cell under a watermark, are placed where they are', { skip }, async () => {
  // A tick at (76, 200) on the row of a PAID stamp added at the right.
  // Before: one "Graphic or image changed" from the tick to the stamp,
  // 440 pt wide (the row's regions were merged, then compared).
  const r = await run('probe8-R5-08-stamp-before.pdf', 'probe8-R5-08-stamp-tick.pdf');
  const tick = graphics(r).find((c) => hits(c, 'new', 1, 82, 204));
  assert.ok(tick, list(r.changes).join(' | '));
  assert.ok(tick.new.rects.every((q) => q.rect.w < 30), JSON.stringify(tick.new.rects));
  // A cell filled red under the DRAFT watermark: the whole cell, 388–536 pt.
  // Before: only the part outside the letters' band, from 476 pt.
  const cell = await run('probe8-R5-08-wm-before.pdf', 'probe8-R5-08-wm-cell.pdf');
  assert.ok(graphics(cell).some((c) => hits(c, 'new', 1, 400, 238) && hits(c, 'new', 1, 520, 238)), JSON.stringify(graphics(cell).map((c) => c.new.rects)));
});

test('N6: two pages turned a quarter each way are one page item', { skip }, async () => {
  // reportlab (R5-01 base): p. 2 turned by /Rotate 90, p. 3 by /Rotate 270.
  // Before: "Page size changed: 595 × 842 pt → 842 × 595 pt" twice, the
  // same text for p. 2 and p. 3.
  const r = await run('probe8-R5-01-before.pdf', 'probe8-N6-mixed.pdf');
  assert.deepEqual(list(r.changes), ['Page size changed: 595 × 842 pt → 842 × 595 pt (in 2 places)']);
  // Turned differently: no single turn to name.
  assert.equal(r.changes[0].turned, undefined);
});

test('N7: a rule recoloured on a Writer repeated header copy is a graphic changed, with both places', { skip }, async () => {
  // LibreOffice Writer: two paragraphs added at the top; the rule under the
  // header copy at new p. 2 made red. Before: "Graphic or image added" with
  // the new place only (the old copy at the same place has its grey rule).
  const r = await run('probe8-R5-06-before.pdf', 'probe8-R5-05-writer-rule.pdf');
  const g = graphics(r).filter((c) => hits(c, 'new', 2, 300, 95.5));
  assert.equal(g.length, 1, list(r.changes).join(' | '));
  assert.equal(describeChange('en', g[0]), 'Graphic or image changed');
  assert.ok(hits(g[0], 'old', 2, 300, 95.5), JSON.stringify(g[0].old.rects));
  // A tick put on the copy (nothing there in the old copy) keeps its own
  // label and place (R5-06 in visual8-rows).
});
