// Visual stage, fix round 8: the colour and weight of words next to an
// overlay (review round 7). An overlay is what one version draws over or
// behind a word that the other does not: a page tint or a panel fill, a
// cell fill, a stamp, a seal, an icon, a watermark that was added, removed,
// replaced, moved or recoloured. The word is compared outside the overlay's
// ink, and its glyphs' chroma may differ by what the overlay's own colour
// explains where it touches them. Before: false "Text colour or weight
// changed" items on unchanged words under tints, stamps and seals, and real
// colour edits and strikes next to icons, fills, stamps and watermarks
// skipped silently. Each probe asserts what the reviewer must see, next to
// its control. Fixtures test/fixtures/probe8-R4-04-* … probe8-R7-06-* are
// copies of the SYNTHETIC probe and verifier PDFs of round 7 (Chromium via
// Playwright, LibreOffice Calc from openpyxl, reportlab).
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
const cases = new URL('../eval/cases/', import.meta.url).pathname;
const skip = !(await canRender()) && 'no canvas';

async function run(before: string, after: string, dir = fixtures): Promise<CompareResult> {
  const pa = await openPdf(dir + before);
  const pb = await openPdf(dir + after);
  const r = compareDocs(buildDocModel(await extractText(pa, 'old')), buildDocModel(await extractText(pb, 'new')));
  await addVisualChanges(r, (p) => renderPage(pa, p, 1.5), (p) => renderPage(pb, p, 1.5));
  return r;
}
const list = (cs: Change[]) => cs.map((c) => describeChange('en', c));
/** The words of the colour or weight items (new side). */
const recoloured = (r: CompareResult) => r.changes.filter((c) => c.format?.appearanceChanged && !c.format.decoration).map((c) => c.new.text ?? '');
const graphics = (r: CompareResult) => list(r.changes.filter((c) => c.kind === 'graphic' && !c.format && !c.pageChange));
const show = (r: CompareResult) => list(r.changes).join(' | ');

test('R6-04, R6-V02: a page tint added behind small or CJK text recolours no word', { skip }, async () => {
  // reportlab equipment schedule at 5.5 pt, one rating changed and a light
  // tint (#fdf8e4) put on all 9 pages. Before: 57 "Text colour or weight
  // changed" items on words such as “unit”.
  const small = await run('probe8-R6-04-small-old.pdf', 'probe8-R6-04-small-new.pdf');
  assert.deepEqual(recoloured(small), [], show(small));
  assert.ok(list(small.changes).includes('Number changed: 11.0 → 15.0 (+36%)'), show(small));
  assert.equal(graphics(small).length, 9, show(small));
  // Chromium progress reports with a #fffbe6 body background, in Chinese
  // (WenQuanYi Zen Hei 10.5 pt) and English. Before: 40 items on 额, 果 and
  // 规, and 5 on “agreed criteria” at the top of each page.
  for (const lang of ['zh', 'en']) {
    const r = await run(`probe8-R6-V02-${lang}-old.pdf`, `probe8-R6-V02-${lang}-new.pdf`);
    assert.deepEqual(recoloured(r), [], `${lang}: ${show(r)}`);
    assert.ok(list(r.changes).includes('Number changed: 4,800,000 → 4,300,000 (-10%)'), `${lang}: ${show(r)}`);
  }
});

test('R7-06, R4-12: a seal or a transparent stamp laid over words recolours none of them', { skip }, async () => {
  // reportlab contract: a red company seal (PNG, 85 % opaque) placed over
  // “乙方（盖章）：示例科技有限公司”. Before: “章” and “示例科技” recoloured.
  const seal = await run('probe8-R7-06-seal-before.pdf', 'probe8-R7-06-seal-after.pdf');
  assert.deepEqual(list(seal.changes), ['Graphic or image added'], show(seal));
  // Chromium remittance statement: semi-transparent PAID, RECEIVED and
  // CHECKED stamps over the amount columns, no figure edited. Before:
  // “223.71” under the P recoloured.
  const stamp = await run('probe8-R4-12-before.pdf', 'probe8-R4-12-stamp.pdf');
  assert.deepEqual(recoloured(stamp), [], show(stamp));
  for (const word of ['PAID', 'RECEIVED', 'CHECKED']) assert.ok(list(stamp.changes).includes(`Added “${word}”`), show(stamp));
});

test('a band behind white text that changed colour recolours none of its words', { skip }, async () => {
  // holdout4-g-draft-watermark (round 4): the letterhead band went from teal
  // to navy; its white firm name and tagline are unchanged. With each
  // side's band explaining the other's, the words were measured on the
  // band's pixels between their glyphs (light text on a dark fill), which
  // read as "Text colour or weight changed" on “information management”.
  const r = await run('holdout4-g-draft-watermark/before.pdf', 'holdout4-g-draft-watermark/after.pdf', cases);
  assert.deepEqual(recoloured(r), [], show(r));
  assert.ok(graphics(r).includes('Graphic or image changed'), show(r));
});

test('R4-04: a figure that turns red next to an added red arrow icon is listed', { skip }, async () => {
  // Chromium KPI table: “-4.2%” turns #c00000 and gets an 8 px red arrow
  // before it. Before: the arrow only (the icon's colour was read from its
  // anti-aliased edge, so its inside was not its ink and the word skipped).
  const r = await run('probe8-R4-04-before.pdf', 'probe8-R4-04-icon-red.pdf');
  const words = recoloured(r);
  assert.ok(words.some((t) => t.includes('-4.2')), show(r));
  assert.ok(words.some((t) => t.includes('+3.1')), show(r));
  assert.ok(graphics(r).includes('Graphic or image added'), show(r));
  // Control: the icons alone recolour nothing.
  const icons = await run('probe8-R4-04-before.pdf', 'probe8-R4-04-icon-only.pdf');
  assert.deepEqual(list(icons.changes), ['Graphic or image added'], show(icons));
  // 36 rows: arrows of 6, 8, 10 and 12 px, 0, 1 or 2 no-break spaces before
  // −4.2%, −4.2 or (1,250), each figure turned red. Before: 22 of 36 (14 with
  // the arrow's colour taken from its edge; then 7 with two spaces, where
  // nothing differs around the figure but the figure itself).
  const sweep = await run('probe8-R4-04-sweep-before.pdf', 'probe8-R4-04-sweep-after.pdf');
  assert.equal(recoloured(sweep).length, 36, show(sweep));
  const sweepIcons = await run('probe8-R4-04-sweep-before.pdf', 'probe8-R4-04-sweep-icons.pdf');
  assert.deepEqual(recoloured(sweepIcons), [], show(sweepIcons));
});

test('R4-05: figures recoloured inside a cell fill that was added or changed are listed', { skip }, async () => {
  // Calc budget: “light red fill with dark red text” on 1,850 and 2,900
  // (fill added) and on 6,200 (green fill and text before). Before: one
  // "Graphic or image changed" for the cells (the glyphs were all taken
  // for what the fill encloses, or the fill's strips for a rule across
  // the words).
  const r = await run('probe8-R4-05-before.pdf', 'probe8-R4-05-after.pdf');
  const words = recoloured(r);
  for (const w of ['1,850', '2,900', '6,200']) assert.ok(words.includes(w), `${w}: ${show(r)}`);
  assert.deepEqual(graphics(r), ['Graphic or image changed'], show(r));
  // Control: the fill alone recolours no figure.
  const fill = await run('probe8-R4-05-before.pdf', 'probe8-R4-05-fill-only.pdf');
  assert.deepEqual(list(fill.changes), ['Graphic or image changed'], show(fill));
});

test('R4-06: edits under a watermark that was replaced by another are listed', { skip }, async () => {
  // Chromium letter: grey DRAFT at -40° replaced by a green APPROVED at
  // -25°. Each version's watermark made the other's word "partial", so
  // every word under both was skipped. “March” turned red.
  const r = await run('probe8-R4-06-draft.pdf', 'probe8-R4-06-approved-edits.pdf');
  assert.ok(list(r.changes).includes('Changed “DRAFT” → “APPROVED”'), show(r));
  assert.ok(recoloured(r).includes('March'), show(r));
  // Control: the replacement alone.
  const c = await run('probe8-R4-06-draft.pdf', 'probe8-R4-06-approved.pdf');
  assert.deepEqual(list(c.changes), ['Changed “DRAFT” → “APPROVED”'], show(c));
  // reportlab agreement: DRAFT grey 40° → APPROVED green 25°; “fifteen”
  // red, “ninety” and “six” struck under both. Before: 3 of the 6 edits.
  const v = await run('probe8-R4-06-v-draft.pdf', 'probe8-R4-06-v-approved-edits.pdf');
  assert.ok(recoloured(v).includes('fifteen'), show(v));
  for (const w of ['three', 'forty', 'eight', 'ninety', 'six']) assert.ok(list(v.changes).includes(`Struck through: “${w}”`), `${w}: ${show(v)}`);
});

test('R4-11: strikes and colours under and beside an added stamp are listed after a re-flow', { skip }, async () => {
  // Chromium invoice: a rotated 55 % red PAID stamp with a 3 pt frame over
  // the amount column; 2,150.00, 2,580.00 and 420.00 struck (420.00 under
  // the frame), 640.00 and 1,330.00 blue. The side without the stamp was
  // "partial" for the stamp's own pixels, so the words were skipped.
  const want = ['Struck through: “2,150.00”', 'Struck through: “2,580.00”', 'Struck through: “420.00”'];
  for (const file of ['probe8-R4-11-n0.pdf', 'probe8-R4-11-n33.pdf', 'probe8-R4-11-nostamp-n0.pdf']) {
    const r = await run('probe8-R4-11-before.pdf', file);
    for (const w of want) assert.ok(list(r.changes).includes(w), `${file} ${w}: ${show(r)}`);
    const words = recoloured(r);
    for (const w of ['640.00', '1,330.00']) assert.ok(words.includes(w), `${file} ${w}: ${show(r)}`);
  }
  // reportlab invoice, the table 14 pt lower under the same stamp: 1,330.00
  // under the stamp's letters turned blue.
  const v = await run('probe8-R4-11-v-before.pdf', 'probe8-R4-11-v-r140-stamp-edits.pdf');
  assert.ok(recoloured(v).includes('1,330.00'), show(v));
});

test('R4-13: a watermark that moved, turned or was recoloured recolours no word under it, and strikes there are listed', { skip }, async () => {
  // Chromium supply agreement, a 130 pt DRAFT at -45°, 35 % grey over the
  // text. Before: 12-15 "Text colour or weight changed" on unchanged words
  // under the watermark moved 30 pt right and 40 pt down, 9 when turned to
  // -30° or recoloured red.
  const moved = await run('probe8-R4-13-draft.pdf', 'probe8-R4-13-moved.pdf');
  assert.ok(list(moved.changes).includes('“DRAFT” moved 11 mm to the right'), show(moved));
  assert.ok(recoloured(moved).length <= 1, show(moved));
  const red = await run('probe8-R4-13-draft.pdf', 'probe8-R4-13-red.pdf');
  assert.deepEqual(recoloured(red), [], show(red));
  const angle = await run('probe8-R4-13-draft.pdf', 'probe8-R4-13-angle.pdf');
  assert.deepEqual(recoloured(angle), [], show(angle));
  // The same move with “thirty (30)” and “ninety” struck under it. Before:
  // the strikes were not listed (only colour items, as on the unchanged
  // words around them).
  const edits = await run('probe8-R4-13-draft.pdf', 'probe8-R4-13-moved-edits.pdf');
  for (const w of ['Struck through: “thirty (30)”', 'Struck through: “ninety”', 'Underlined: “exclusive”']) assert.ok(list(edits.changes).includes(w), `${w}: ${show(edits)}`);
  // Controls: the strikes under the watermark left as it was, or only
  // made lighter, are listed as before.
  for (const file of ['probe8-R4-13-draft-edits.pdf', 'probe8-R4-13-faint-edits.pdf']) {
    const c = await run('probe8-R4-13-draft.pdf', file);
    assert.ok(list(c.changes).some((d) => d.startsWith('Struck through: “') && d.includes('(30)')), `${file}: ${show(c)}`);
    assert.ok(list(c.changes).includes('Underlined: “exclusive”'), `${file}: ${show(c)}`);
  }
  // reportlab agreement, DRAFT moved 30 / -30 pt: five strikes and a red
  // word under it, and nothing else. Before: 11 more colour items.
  const v = await run('probe8-R4-06-v-draft.pdf', 'probe8-R4-13-v-moved-edits.pdf');
  assert.deepEqual(recoloured(v), ['fifteen'], show(v));
  for (const w of ['three', 'forty', 'eight', 'ninety', 'six']) assert.ok(list(v.changes).includes(`Struck through: “${w}”`), `${w}: ${show(v)}`);
  const vm = await run('probe8-R4-06-v-draft.pdf', 'probe8-R4-13-v-moved.pdf');
  assert.deepEqual(list(vm.changes), ['“DRAFT” moved 11 mm to the right'], show(vm));
});

test('R4-07: graphic edits inside the box of a diagonal watermark in both versions are listed', { skip }, async () => {
  // Chromium purchase order with a grey COPY at -38° behind the content in
  // both versions: a red tick added, a row fill, the signature rule
  // removed. Before (round 7): the tick missing and the 200 pt rule
  // reported as a 12 pt sliver (the watermark's whole bounding box was
  // masked as text). Fixed by masking slanted text along its letters only.
  const r = await run('probe8-R4-07-wm-before.pdf', 'probe8-R4-07-wm-after.pdf');
  assert.deepEqual(graphics(r).sort(), ['Graphic or image added', 'Graphic or image changed', 'Graphic or image removed'], show(r));
  const removed = r.changes.find((c) => describeChange('en', c) === 'Graphic or image removed')!;
  assert.ok(removed.old.rects.some((q) => q.rect.w >= 150), JSON.stringify(removed.old.rects));
});

test('V3-V1: an overlay found by more than one test explains its colour once', { skip }, async () => {
  // Chromium invoice (counter-probe of review round 8): a semi-transparent
  // blue RECEIVED stamp added over the amount column, and 1,330.00 under
  // its letters turned #1f4fbf. The stamp is text on one side only, a
  // graphic that differs next to the figure and text set at a slant: three
  // covers of one colour. Before: its chroma was allowed three times over
  // and the figure was not listed, with no notice.
  const r = await run('probe8-V3V1-stamp-before.pdf', 'probe8-V3V1-stamp-blue.pdf');
  for (const w of ['640.00', '1,330.00']) assert.ok(recoloured(r).includes(w), `${w}: ${show(r)}`);
  assert.ok(list(r.changes).includes('Added “RECEIVED”'), show(r));
  // Control: the stamp alone recolours no figure.
  const ctrl = await run('probe8-V3V1-stamp-before.pdf', 'probe8-V3V1-stamp-blue-ctrl.pdf');
  assert.deepEqual(recoloured(ctrl), [], show(ctrl));
  // A grey DRAFT replaced by a red CONFIDENTIAL at -30° over the text, and
  // three words under it turned red, dark red and light red. Before:
  // “resell” (#8b0000) was not listed.
  const wm = await run('probe8-V3V1-wm-draft.pdf', 'probe8-V3V1-wm-conf-edits.pdf');
  assert.deepEqual(recoloured(wm), ['acceptance', 'resell', 'property'], show(wm));
  const wc = await run('probe8-V3V1-wm-draft.pdf', 'probe8-V3V1-wm-conf-ctrl.pdf');
  assert.deepEqual(recoloured(wc), [], show(wc));
});
