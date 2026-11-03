// Visual stage, fix round 4: noise from re-flowed pages (header rules,
// bitmaps, figures pushed to the next page, graphics shifted by a few
// points) and misses (a light bar that grew, a figure that text moved into
// the place of, a rule just above a line, a struck sentence that wraps).
// Fixtures: test/fixtures/make-visual4-fixtures.mjs (Chromium) and the blind
// round 3 cases in eval/cases/holdout3-* (LibreOffice Writer).
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

async function run(before: string, after: string): Promise<CompareResult> {
  const pa = await openPdf(before);
  const pb = await openPdf(after);
  const r = compareDocs(buildDocModel(await extractText(pa, 'old')), buildDocModel(await extractText(pb, 'new')));
  await addVisualChanges(r, (p) => renderPage(pa, p, 1.5), (p) => renderPage(pb, p, 1.5));
  return r;
}
const fixture = (a: string, b: string) => run(fixtures + a, fixtures + b);
const holdout = (id: string) => run(`${cases}${id}/before.pdf`, `${cases}${id}/after.pdf`);

const list = (cs: Change[]) => cs.map((c) => describeChange('en', c)).join(' | ');
const graphics = (r: CompareResult) => r.changes.filter((c) => c.kind === 'graphic' && !c.format && !c.pageChange);
/** Visual changes and minor shifts on one (1-based) page of the new version, or of the old one if they have no new side. */
const onPage = (r: CompareResult, page: number) => ({
  changes: r.changes.filter((c) => c.category === 'visual' && (c.new.pages.includes(page - 1) || (!c.new.pages.length && c.old.pages.includes(page - 1)))),
  minor: r.minor.filter((c) => c.new.pages.includes(page - 1) || c.old.pages.includes(page - 1)),
});

let reflow: CompareResult | null = null;
const reflow4 = async () => (reflow ??= await fixture('reflow4-before.pdf', 'reflow4-after.pdf'));

test('a running header rule on pages whose text re-flowed is not a graphic change (LibreOffice)', { skip }, async () => {
  // V1: the rule under the header stays where it is while the text below
  // moves up or down with the re-flow, and so does the top border of a table
  // continued from the previous page.
  for (const id of ['holdout3-c-en-supply-agreement-move', 'holdout3-c-en-retention-policy', 'holdout3-c-zh-purchase-contract-reflow']) {
    const r = await holdout(id);
    assert.deepEqual(list(graphics(r)), '', id);
  }
});

test('a sentence struck through over a line break is one change with a place on each line', { skip }, async () => {
  // V2, LibreOffice Writer.
  const r = await holdout('holdout3-d-writer-methods-report');
  const struck = r.changes.filter((c) => c.format?.decoration?.line === 'strike');
  assert.equal(struck.length, 1, list(struck));
  assert.equal(struck[0].new.text, 'Questions on car ownership were moved to the end of the questionnaire to reduce drop-outs');
  assert.equal(struck[0].new.rects.length, 2);
  assert.equal(struck[0].old.rects.length, 2);
  // Chromium.
  const { changes } = onPage(await reflow4(), 3);
  assert.equal(changes.length, 1, list(changes));
  assert.equal(changes[0].new.text, 'The duty engineer signs the visit log before leaving the site');
  assert.ok(changes[0].new.rects[0].rect.y < changes[0].new.rects[1].rect.y);
});

test('a screenshot moved down by a re-flowed line is not a graphic change', { skip }, async () => {
  const r = await fixture('shot4-before.pdf', 'shot4-after.pdf');
  assert.deepEqual(list(r.changes.filter((c) => c.category === 'visual')), '');
  assert.ok(r.changes.some((c) => c.kind === 'insert'));
});

test('a logo moved by 2 pt is a minor shift, not a graphic change', { skip }, async () => {
  const { changes, minor } = onPage(await reflow4(), 1);
  assert.deepEqual(list(changes), '');
  assert.equal(minor.length, 1);
});

test('a light bar with a thin outline that grew by 4 pt is a graphic change, not a minor shift', { skip }, async () => {
  const { changes, minor } = onPage(await reflow4(), 2);
  assert.equal(changes.length, 1, list(changes));
  assert.equal(describeChange('en', changes[0]), 'Graphic or image changed');
  assert.equal(minor.length, 0);
});

test('a rule added just above a paragraph is found along its whole length', { skip }, async () => {
  const { changes } = onPage(await reflow4(), 4);
  assert.equal(changes.length, 1, list(changes));
  assert.ok(changes[0].new.rects[0].rect.w > 400, JSON.stringify(changes[0].new.rects));
});

test('a chart that was deleted is found even where the text below moved into its place', { skip }, async () => {
  const { changes } = onPage(await reflow4(), 5);
  assert.equal(changes.length, 1, list(changes));
  assert.equal(describeChange('en', changes[0]), 'Graphic or image removed');
  assert.ok(changes[0].old.rects[0].rect.h > 40);
});

test('a chart pushed to the next page by added text is not reported; one that also changed is', { skip }, async () => {
  const same = await fixture('push4-before.pdf', 'push4-same-after.pdf');
  assert.deepEqual(list(same.changes.filter((c) => c.category === 'visual')), '');
  assert.equal(same.minor.length, 0);
  const grew = await fixture('push4-before.pdf', 'push4-grew-after.pdf');
  const g = graphics(grew);
  assert.equal(g.length, 1, list(g));
  assert.deepEqual(g[0].new.pages, [1]);
  assert.equal(grew.minor.length, 0);
});

test('charts that another page size moved to other places are not reported as removed and added', { skip }, async () => {
  const r = await fixture('letter4-a4.pdf', 'letter4-letter.pdf');
  assert.deepEqual(list(r.changes.filter((c) => c.category === 'visual')), 'Page size changed: 595 × 842 pt → 612 × 792 pt (in 2 places)');
});

test('a blank page added is described as blank', { skip }, async () => {
  const r = await fixture('blank4-before.pdf', 'blank4-after.pdf');
  assert.deepEqual(list(r.changes), 'Blank page added (no text, images or drawings)');
  const back = await fixture('blank4-after.pdf', 'blank4-before.pdf');
  assert.equal(describeChange('zh', back.changes[0]), '删除了一页空白页（没有文字、图片或图形）');
});
