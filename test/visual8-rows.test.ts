// Visual stage, fix round 8: table header rows repeated at moved page tops
// (review round 7, findings R5-05, R5-06 and R6-08). Before, a copy of the
// row was compared with its other copies on its text ±0.3 line heights
// only, and only for ink it had that a copy lacked, within 48 levels: a
// rule under one copy recoloured, thickened or taken off, or its light fill
// taken off or shaded darker, stayed hidden in the row's consequence. A
// mark found there was then listed at the whole header band and dropped
// as a figure that moved. Fixtures test/fixtures/probe8-R5-0[56]-*.pdf are
// copies of the SYNTHETIC probe and verifier PDFs of round 7 (reportlab;
// python-docx → LibreOffice Writer 24.2, pages passed through pypdf; marks
// overlaid with pypdf).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openPdf } from '../src/node/pdf.ts';
import { renderPage, canRender } from '../src/node/render.ts';
import { extractText } from '../src/pdf/extract.ts';
import { buildDocModel } from '../src/core/tokenize.ts';
import { compareDocs } from '../src/core/compare.ts';
import { addVisualChanges } from '../src/core/pipeline.ts';
import { describeChange } from '../src/core/describe.ts';
import { repeatedRows, rowCopies, rowDiffers } from '../src/core/visual.ts';
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

test('R5-05: a rule under one repeated header copy recoloured, thickened or taken off, or its fill taken off or shaded, is listed', { skip }, async () => {
  // reportlab asset register; three lines added at the top move every page
  // break, and the header copies on new p. 2–5 are repeated lines. Each
  // edit is on one copy only; before, each gave the re-flow's output.
  for (const [file, page, y] of [
    ['probe8-R5-05-rule-red.pdf', 4, 75.5],
    ['probe8-R5-05-no-fill.pdf', 4, 65],
    ['probe8-R5-05-no-rule.pdf', 4, 75.5],
  ] as const) {
    const r = await run('probe8-R5-05-before.pdf', file);
    const g = graphics(r);
    assert.equal(g.length, 1, `${file}: ${list(r.changes).join(' | ')}`);
    assert.ok(hits(g[0], 'new', page, 300, y), `${file}: ${JSON.stringify(g[0].new.rects)}`);
    assert.equal(r.ignored.repeatedLines, 7, file);
  }
  for (const [file, y] of [
    ['probe8-R5-05-v-fill-shade.pdf', 65],
    ['probe8-R5-05-v-rule-green.pdf', 75.5],
  ] as const) {
    const r = await run('probe8-R5-05-v-before.pdf', file);
    const g = graphics(r);
    assert.equal(g.length, 1, `${file}: ${list(r.changes).join(' | ')}`);
    assert.ok(hits(g[0], 'new', 3, 300, y), `${file}: ${JSON.stringify(g[0].new.rects)}`);
  }
  // Controls: the re-flow alone lists the added lines only.
  for (const [a, b] of [
    ['probe8-R5-05-before.pdf', 'probe8-R5-05-reflow.pdf'],
    ['probe8-R5-05-v-before.pdf', 'probe8-R5-05-v-reflow.pdf'],
  ]) {
    const c = await run(a, b);
    assert.deepEqual(list(c.changes), ['Added 42 words'], b);
    assert.equal(c.ignored.repeatedLines, 7, b);
  }
});

/** Graphic items with a place on new p. 2 at the repeated header row (y 60–100). */
const onHeader = (r: CompareResult) => graphics(r).filter((c) => c.new.rects.some((q) => q.page === 1 && q.rect.y < 100 && q.rect.y + q.rect.h > 60));

test('R5-05, R5-06: a red rule, a tick or a highlight on a Writer repeated header copy is listed at its place', { skip }, async () => {
  // Two paragraphs added at the top; the header copy at new p. 2 is a
  // repeated line. Before: the rule was hidden in the consequence; the tick
  // and the highlight were found, listed at the whole header band, and
  // then dropped as a figure that moved.
  for (const [file, x, y] of [
    ['probe8-R5-05-writer-rule.pdf', 300, 95.5],
    ['probe8-R5-06-tick.pdf', 375, 81],
    ['probe8-R5-06-highlight.pdf', 445, 80],
  ] as const) {
    const r = await run('probe8-R5-06-before.pdf', file);
    const g = onHeader(r);
    assert.equal(g.length, 1, `${file}: ${list(r.changes).join(' | ')}`);
    assert.ok(hits(g[0], 'new', 2, x, y), `${file}: ${JSON.stringify(g[0].new.rects)}`);
    // The place is the mark, not the 432 pt header band around it.
    assert.ok(g[0].new.rects.every((q) => q.rect.w < 440 && (file.includes('rule') || q.rect.w < 120)), `${file}: ${JSON.stringify(g[0].new.rects)}`);
  }
  // Control: the re-flow alone lists nothing on the header row.
  const c = await run('probe8-R5-06-before.pdf', 'probe8-R5-06-reflow.pdf');
  assert.deepEqual(onHeader(c), []);
  assert.ok(c.changes.some((x) => x.kind === 'insert'));
});

test('R6-08: comparing a repeated header row with a copy that looks alike stops at the first offset that fits', { skip }, async () => {
  // reportlab asset register re-flowed: 7 repeated rows. Before, each
  // comparison searched all 13 × 13 offsets over every sample (about 460 ms
  // a row on the reference VM; now about 90 ms for all three looks).
  const pa = await openPdf(fixtures + 'probe8-R5-05-before.pdf');
  const pb = await openPdf(fixtures + 'probe8-R5-05-reflow.pdf');
  const r = compareDocs(buildDocModel(await extractText(pa, 'old')), buildDocModel(await extractText(pb, 'new')));
  const rows = repeatedRows(r);
  assert.equal(rows.length, 7);
  let ms = 0;
  for (const row of rows) {
    const copy = rowCopies(r, row)[0];
    const ra = await renderPage(row.side === 'old' ? pa : pb, row.page, 1.5);
    const rc = await renderPage(copy.side === 'old' ? pa : pb, copy.page, 1.5);
    void ra.data;
    void rc.data;
    const t0 = performance.now();
    const d = rowDiffers(r, row, ra, copy, rc);
    ms += performance.now() - t0;
    assert.ok(!d.marks && !d.fill && !d.rules, JSON.stringify(d));
  }
  assert.ok(ms / rows.length < 230, `${(ms / rows.length).toFixed(0)} ms a row`);
});
