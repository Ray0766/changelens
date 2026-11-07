// Visual stage, fix round 8, third pass: what the re-verifier of the second
// pass left open (V1-L*). Fixtures test/fixtures/probe8-V1-L*-*.pdf are
// copies of the re-verifier's SYNTHETIC counter-probes (Chromium, reportlab,
// pypdf /Rotate), and of two of the fixer's (reportlab,
// probe8-V1-L4-g-check and -long-check-kept).
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

test('V1-L1: a word underlined on a shaded header row is listed when another edit sits on the row', { skip }, async () => {
  // Chromium order table, header cells on #dde4f0 whose band ends right
  // under the words; "Amount" underlined (offset 1.5 pt) and a 6 pt red
  // square added after "Item". Before: only "Graphic or image changed" for
  // the square. reportlab: the same with "Qty".
  for (const [a, b, word, x, y] of [
    ['probe8-V1-L1-before.pdf', 'probe8-V1-L1-ul-tick.pdf', 'Amount', 98, 130],
    ['probe8-V1-L1-b-before.pdf', 'probe8-V1-L1-b-ul-qty-tick.pdf', 'Qty', 0, 0],
  ] as const) {
    const r = await run(a, b);
    assert.ok(list(r.changes).includes(`Underlined: “${word}”`), `${b}: ${list(r.changes).join(' | ')}`);
    assert.equal(graphics(r).length, 1, `${b}: ${list(r.changes).join(' | ')}`);
    if (x) assert.ok(hits(graphics(r)[0], 'new', 1, x, y), JSON.stringify(graphics(r)[0].new.rects));
  }
  // Offset 2 pt: the underline lies partly below the band, where the
  // graphics comparison sees it. Before: "Graphic or image added" there and
  // no underline; now the underline, with that place.
  const low = await run('probe8-V1-L1-before.pdf', 'probe8-V1-L1-ul2pt-tick.pdf');
  assert.deepEqual(list(low.changes).sort(), ['Graphic or image changed', 'Underlined: “Amount”']);
  // Controls: the square alone is the only item; a red rule drawn along a
  // Calc header band's lower edge, past its words, is a graphic and no
  // underline (see N2 in visual8-refix).
  const tick = await run('probe8-V1-L1-before.pdf', 'probe8-V1-L1-tick.pdf');
  assert.deepEqual(list(tick.changes), ['Graphic or image changed']);
  const band = await run('probe8-R5-13-before.pdf', 'probe8-N2-calc-rule-noins.pdf');
  assert.ok(!list(band.changes).some((d) => d.startsWith('Underlined')), list(band.changes).join(' | '));
  assert.ok(graphics(band).some((c) => hits(c, 'new', 3, 200, 88)), list(band.changes).join(' | '));
});

test('V1-L2: an axis label that changes direction does not turn its chart page', { skip }, async () => {
  // Chromium chart page: "Figure 2" and a 28-character axis label set
  // horizontally (h) or vertically one way or the other (v, v270); bar 5
  // grows from 180 to 240. No /Rotate, same page size. Before: "Page turned
  // by 270°" or "Page turned by 180°", and the bar edit not shown.
  for (const [a, b] of [
    ['probe8-V1-L2-h-before.pdf', 'probe8-V1-L2-v-bar.pdf'],
    ['probe8-V1-L2-v-before.pdf', 'probe8-V1-L2-v270-bar.pdf'],
  ]) {
    const r = await run(a, b);
    assert.deepEqual(list(r.changes), ['Graphic or image changed'], `${b}: ${list(r.changes).join(' | ')}`);
    assert.ok(hits(graphics(r)[0], 'old', 2, 270, 120) && hits(graphics(r)[0], 'new', 2, 270, 120), JSON.stringify(graphics(r)[0]));
  }
  // Control: the page turned by /Rotate 90 with the bar edit is still a
  // page change, and the bar is placed where the turn puts it.
  const rot = await run('probe8-V1-L2-v-before.pdf', 'probe8-V1-L2-v-bar-rot90.pdf');
  assert.deepEqual(list(rot.changes), ['Page size changed: 595 × 842 pt → 842 × 595 pt', 'Graphic or image changed']);
  assert.ok(hits(graphics(rot)[0], 'old', 2, 270, 120) && hits(graphics(rot)[0], 'new', 2, 717, 270), JSON.stringify(graphics(rot)[0]));
});

test('V1-L3: an underline drawn on past its line where the other version has no rule is an underline', { skip }, async () => {
  // reportlab letter: the line underlined from its start to 16 pt past its
  // end; a name underlined to 60 pt past it. Before: only "Graphic or image
  // added" for the part past the text.
  const deposit = await run('probe8-V1-L3-before.pdf', 'probe8-V1-L3-ul16.pdf');
  assert.ok(list(deposit.changes).includes('Underlined: “The deposit of 1,800.00 is refu…”'), list(deposit.changes).join(' | '));
  const name = await run('probe8-V1-L3-before.pdf', 'probe8-V1-L3-name-ul60.pdf');
  assert.ok(list(name.changes).includes('Underlined: “Tenant: Adaeze Okafor”'), list(name.changes).join(' | '));
  // The controls of R5-12 and R5-V02 (visual8-appearance) hold: a table
  // rule or a band edge that both versions have along a re-flowed row is
  // no underline.
  const w = await run('probe8-R5-12-before.pdf', 'probe8-R5-12-reflow.pdf');
  assert.ok(!list(w.changes).some((d) => d.startsWith('Underline')), list(w.changes).join(' | '));
  const d = await run('probe8-R5-V02-before.pdf', 'probe8-R5-V02-two-notes.pdf');
  assert.deepEqual(list(d.changes), ['Added 2 paragraphs']);
});

test('V1-L4: a mark removed where new words are now printed, on an unshaded row, is listed', { skip }, async () => {
  // reportlab invoice without shading: a 7 pt check mark or a 5 pt x-mark
  // where "Pump service" grows into "Pump service and replacement of the
  // shaft seal". Before: only the text item.
  for (const [file, x, y] of [
    ['probe8-V1-L4-check.pdf', 173, 152],
    ['probe8-V1-L4-xmark.pdf', 202, 153],
  ] as const) {
    const r = await run(file, 'probe8-V1-L4-long.pdf');
    assert.deepEqual(list(r.changes).sort(), ['Added “and replacement of the shaft seal”', 'Graphic or image removed'], file);
    assert.ok(hits(graphics(r)[0], 'old', 1, x, y), JSON.stringify(graphics(r)[0].old.rects));
    // And the other way: the words deleted, the mark drawn where they were.
    const back = await run('probe8-V1-L4-long.pdf', file);
    assert.deepEqual(list(back.changes).sort(), ['Deleted “and replacement of the shaft seal”', 'Graphic or image added'], file);
  }
  // Control: the check mark kept, the new words printed over it, is no
  // graphic change.
  const kept = await run('probe8-V1-L4-g-check.pdf', 'probe8-V1-L4-long-check-kept.pdf');
  assert.deepEqual(list(kept.changes), ['Added “and replacement of the shaft seal”']);
});

test('V1-L5: an x-mark removed in a shaded cell whose words changed is placed over its strokes', { skip }, async () => {
  // reportlab invoice, zebra-shaded: a 5 pt x-mark of two 0.9 pt strokes
  // where the longer value goes. Before: placed as 2 × 2 pt, its crossing.
  const r = await run('probe8-V1-L5-shaded-xmark.pdf', 'probe8-V1-L5-shaded-long.pdf');
  assert.deepEqual(list(r.changes).sort(), ['Added “and replacement of the shaft seal”', 'Graphic or image removed']);
  const q = graphics(r)[0].old.rects[0].rect;
  assert.ok(q.w >= 4 && q.h >= 4 && q.w <= 9 && q.h <= 9 && hits(graphics(r)[0], 'old', 1, 202.5, 153.5), JSON.stringify(q));
});
