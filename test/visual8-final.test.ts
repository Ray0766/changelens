// Visual stage, fix round 8, after the text and visual streams were merged:
// interactions between the two streams and the problems the visual
// re-verifiers left open (ids F0–F6 of the final pass).
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

test('F0: a fill drawn in a form field where its words were deleted, or over part of the words added, is listed', { skip }, async () => {
  // The words alone are test/visual8-appearance.test.ts R3-V01. Since field
  // values are boxed with their font's real ascent and descent, the field's
  // border, 1 pt above and below the boxes, outnumbered the fill around the
  // added words, and the fill under them was listed as "Graphic or image
  // removed". The fill is now also read in the padding right around the
  // glyphs. SYNTHETIC controls (pypdf, field f2's appearance stream edited):
  // a red box where the deleted words stood, a translucent red tint in
  // front of part of the added words, and a green highlight behind them.
  const red = await run('probe8-R3-V01-field-after.pdf', 'probe8-F0-field-deleted-red.pdf');
  assert.deepEqual(list(red.changes), ['Graphic or image added', 'Deleted “and replacement of the shaft seal” (form field)']);
  assert.ok(hits(graphics(red)[0], 'new', 1, 290, 172), JSON.stringify(graphics(red)[0].new.rects));
  for (const file of ['probe8-F0-field-added-tint.pdf', 'probe8-F0-field-added-hl.pdf']) {
    const r = await run('probe8-R3-V01-field-before.pdf', file);
    assert.equal(graphics(r).length, 1, `${file}: ${list(r.changes).join(' | ')}`);
    assert.ok(list(r.changes).includes('Added “and replacement of the shaft seal” (form field)'), file);
    const g = graphics(r)[0];
    assert.ok(hits(g, 'old', 1, 300, 172) || hits(g, 'new', 1, 300, 172), `${file}: ${JSON.stringify([g.old.rects, g.new.rects])}`);
  }
});

const colourAt = (r: CompareResult, x: number, y: number) =>
  r.changes.some((c) => c.format?.appearanceChanged && describeChange('en', c) === 'Text colour or weight changed' && hits(c, 'new', 1, x, y));

test('F1: a highlight in a hue near a panel or row fill added with it is listed, not folded into the fill', { skip }, async () => {
  // SYNTHETIC (Chromium, review 8 overlay counter-probes): a "Key terms"
  // panel given a tint and "within 14 days" in it highlighted in a nearby
  // shade (#deebf7 and #bdd7ee; #fff4c2 and #ffe9a0), and a table row given
  // a fill with "Standard" in it highlighted (#ddebf7 and #bdd7ee). The
  // highlight's colour lay within 40 levels of the fill's, so the word's
  // background was taken for the fill's (listed as the graphic only).
  // Both directions.
  for (const [file, x, y] of [
    ['probe8-F1-panel-blue-hl.pdf', 200, 180],
    ['probe8-F1-panel-yellow-hl.pdf', 200, 180],
    ['probe8-F1-row-blue-hl.pdf', 80, 303],
    ['probe8-F1-row-far-hl.pdf', 80, 303],
  ] as const) {
    for (const [a, b] of [
      ['probe8-F1-before.pdf', file],
      [file, 'probe8-F1-before.pdf'],
    ]) {
      const r = await run(a, b);
      assert.equal(graphics(r).length, 1, `${a} → ${b}: ${list(r.changes).join(' | ')}`);
      assert.ok(colourAt(r, x, y), `${a} → ${b}: ${list(r.changes).join(' | ')}`);
    }
  }
  // Controls: the fill alone is the graphic alone; the highlight alone is
  // listed.
  for (const file of ['probe8-F1-panel-blue-fill.pdf', 'probe8-F1-row-blue-fill.pdf']) {
    const r = await run('probe8-F1-before.pdf', file);
    assert.deepEqual(
      r.changes.map((c) => c.kind),
      ['graphic'],
      list(r.changes).join(' | '),
    );
    assert.ok(!r.changes[0].format, list(r.changes).join(' | '));
  }
  const hl = await run('probe8-F1-before.pdf', 'probe8-F1-hl.pdf');
  assert.ok(colourAt(hl, 200, 180), list(hl.changes).join(' | '));
});
