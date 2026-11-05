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
const formatsOf = (r: CompareResult) => list(r.changes.filter((c) => c.format?.appearanceChanged));

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

const graphics = (r: CompareResult) => r.changes.filter((c) => c.kind === 'graphic' && !c.format && !c.pageChange);
const hits = (c: Change, side: 'old' | 'new', page: number, x: number, y: number) =>
  c[side].rects.some((q) => q.page === page - 1 && x >= q.rect.x - 2 && x <= q.rect.x + q.rect.w + 2 && y >= q.rect.y - 2 && y <= q.rect.y + q.rect.h + 2);

test('R5-08: a graphic edit under an added watermark or stamp, away from its letters, is listed', { skip }, async () => {
  // Chromium quotation with a light grey DRAFT added at 45°: its bounding
  // box is 398 × 364 pt. Before, the red amount cell and the signature
  // inside that box were places of "Added “DRAFT”".
  const cell = await run('probe8-R5-08-wm-before.pdf', 'probe8-R5-08-wm-cell.pdf');
  assert.deepEqual(list(cell.changes), ['Added “DRAFT”', 'Graphic or image changed']);
  assert.ok(hits(graphics(cell)[0], 'new', 1, 500, 238), JSON.stringify(graphics(cell)[0].new.rects));
  const sig = await run('probe8-R5-08-wm-before.pdf', 'probe8-R5-08-wm-sig.pdf');
  assert.deepEqual(list(sig.changes), ['Added “DRAFT”', 'Graphic or image added']);
  assert.ok(hits(graphics(sig)[0], 'new', 1, 200, 478), JSON.stringify(graphics(sig)[0].new.rects));
  const wm = await run('probe8-R5-08-wm-before.pdf', 'probe8-R5-08-wm-only.pdf');
  assert.deepEqual(list(wm.changes), ['Added “DRAFT”']);
  // reportlab status page: a tick 170 pt from the watermark's letters.
  const tick = await run('probe8-R5-01-rag-before.pdf', 'probe8-R5-08-status-wm-tick.pdf');
  assert.deepEqual(list(tick.changes), ['Added “DRAFT”', 'Graphic or image added']);
  assert.ok(hits(graphics(tick)[0], 'new', 2, 84, 424), JSON.stringify(graphics(tick)[0].new.rects));
  const only = await run('probe8-R5-01-rag-before.pdf', 'probe8-R5-08-status-wm-only.pdf');
  assert.deepEqual(list(only.changes), ['Added “DRAFT”']);
  // Chromium invoice with a rotated PAID stamp over rows 3–4: a tick 330 pt
  // to its left, a highlight on the description cell of row 3. Before,
  // both were places of "Added “PAID”" (its row band ran across the page).
  for (const [file, x, y] of [
    ['probe8-R5-08-stamp-tick.pdf', 82, 204],
    ['probe8-R5-08-stamp-hl.pdf', 200, 200],
  ] as const) {
    const r = await run('probe8-R5-08-stamp-before.pdf', file);
    assert.ok(graphics(r).some((c) => hits(c, 'new', 1, x, y)), `${file}: ${list(r.changes).join(' | ')}`);
    const stamp = r.changes.find((c) => c.kind === 'insert')!;
    assert.ok(!hits(stamp, 'new', 1, x, y), `${file}: ${JSON.stringify(stamp.new.rects)}`);
  }
  // Control: the stamp alone has no graphic of its own on the new page.
  const s = await run('probe8-R5-08-stamp-before.pdf', 'probe8-R5-08-stamp-only.pdf');
  assert.ok(list(s.changes).includes('Added “PAID”'));
  assert.ok(graphics(s).every((c) => !c.new.rects.length), list(s.changes).join(' | '));
});

test('R5-09: a full-width rule restyled next to an inserted or deleted paragraph is one change with both places', { skip }, async () => {
  // Chromium lease letter; the <hr> above the signature block becomes
  // 1.5 pt red. Before: "Graphic or image removed" (or "added") with one
  // place, the other hidden in the insertion's (deletion's) places.
  for (const [file, kind, side, y] of [
    ['probe8-R5-09-ins-rule.pdf', 'insert', 'new', 236],
    ['probe8-R5-09-del-rule.pdf', 'delete', 'old', 212],
  ] as const) {
    const r = await run('probe8-R5-09-before.pdf', file);
    const g = graphics(r);
    assert.deepEqual(list(g), ['Graphic or image changed'], `${file}: ${list(r.changes).join(' | ')}`);
    assert.ok(g[0].old.rects.length && g[0].new.rects.length, JSON.stringify(g[0]));
    const text = r.changes.find((c) => c.kind === kind)!;
    assert.ok(!hits(text, side, 1, 300, y), `${file}: ${JSON.stringify(text[side].rects)}`);
  }
  // Controls: the insertion or deletion alone.
  for (const [file, d] of [
    ['probe8-R5-09-ins-only.pdf', 'Added a paragraph'],
    ['probe8-R5-09-del-only.pdf', 'Deleted a paragraph'],
  ]) {
    const c = await run('probe8-R5-09-before.pdf', file);
    assert.deepEqual(list(c.changes), [d], file);
  }
});

test('R5-V03: a thin rule recoloured at the same width is changed, not removed', { skip }, async () => {
  // reportlab minutes: a 1 pt dark grey rule turned green on paper, or red
  // along the bottom of a light tinted box. Before: "Graphic or image
  // removed" with the old place only (the new colour's anti-aliased
  // pixels lie within the old rule's range of greys).
  for (const [a, b] of [
    ['probe8-R5-V03-paper-before.pdf', 'probe8-R5-V03-paper-green.pdf'],
    ['probe8-R5-V03-tint-before.pdf', 'probe8-R5-V03-tint-red.pdf'],
  ]) {
    const r = await run(a, b);
    assert.deepEqual(list(r.changes), ['Graphic or image changed'], b);
    assert.ok(hits(r.changes[0], 'old', 1, 300, 150) && hits(r.changes[0], 'new', 1, 300, 150), JSON.stringify(r.changes[0]));
  }
});

test('R3-V01: words added or deleted in a shaded cell or a filled field are not also a graphic change; a fill put there is', { skip }, async () => {
  // reportlab: "Pump service" → "Pump service and replacement of the shaft
  // seal" in a zebra-shaded row, and the same in a form field with a light
  // blue fill. Before: "Graphic or image removed" where the new words
  // stand (the fill under them faces their glyphs), "added" for a deletion.
  for (const [a, b, d] of [
    ['probe8-R3-V01-cell-before.pdf', 'probe8-R3-V01-cell-after.pdf', 'Added “and replacement of the shaft seal”'],
    ['probe8-R3-V01-cell-after.pdf', 'probe8-R3-V01-cell-before.pdf', 'Deleted “and replacement of the shaft seal”'],
    ['probe8-R3-V01-field-before.pdf', 'probe8-R3-V01-field-after.pdf', 'Added “and replacement of the shaft seal” (form field)'],
    ['probe8-R3-V01-field-after.pdf', 'probe8-R3-V01-field-before.pdf', 'Deleted “and replacement of the shaft seal” (form field)'],
  ]) {
    const r = await run(a, b);
    assert.deepEqual(list(r.changes), [d], `${a} → ${b}`);
  }
  // Controls (synthetic, pypdf overlays): a red fill drawn where the words
  // were deleted, and a red tint over part of the added words, are listed.
  const red = await run('probe8-R3-V01-cell-after.pdf', 'probe8-R3-V01-cell-deleted-red.pdf');
  assert.ok(graphics(red).some((c) => hits(c, 'new', 1, 190, 154)), list(red.changes).join(' | '));
  const tint = await run('probe8-R3-V01-cell-before.pdf', 'probe8-R3-V01-cell-added-tint.pdf');
  assert.ok(graphics(tint).some((c) => hits(c, 'new', 1, 310, 154)), list(tint.changes).join(' | '));
});

test('R5-12, R5-V02: a table rule or a fill edge along a re-flowed row is not an underline of its text', { skip }, async () => {
  // LibreOffice Writer: the row "PUM-023 Test alarms 20 Contractor" was
  // split at the foot of old p. 1, its bottom border right under the text;
  // two notes added at the top put it whole on new p. 2. Before: "Underline
  // removed: “PUM-023 Test alarms 20 Contract…”".
  const w = await run('probe8-R5-12-before.pdf', 'probe8-R5-12-reflow.pdf');
  assert.deepEqual(formatsOf(w), [], list(w.changes).join(' | '));
  assert.ok(w.changes.some((c) => c.kind === 'insert'));
  // Chromium: a header row in white on navy moved down by two notes; the
  // band's lower edge lands 0.7 pt off the text's displacement. Before:
  // "Underlined: “Item Description Bin Qty Unit c…”".
  const d = await run('probe8-R5-V02-before.pdf', 'probe8-R5-V02-two-notes.pdf');
  assert.deepEqual(list(d.changes), ['Added 2 paragraphs']);
  // Real underlines elsewhere (CJK, under a watermark, on a running header
  // row) are still found: see V06, V07 and V12 in visual6-probes.
});
