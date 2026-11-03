// Visual stage on real (synthetic, Chromium-made) PDFs: one scenario per
// page of test/fixtures/visual-*.pdf, and pages without text inserted or
// removed (test/fixtures/figpages-*.pdf). See make-visual-fixtures.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openPdf } from '../src/node/pdf.ts';
import { renderPage, canRender } from '../src/node/render.ts';
import { extractText } from '../src/pdf/extract.ts';
import { buildDocModel } from '../src/core/tokenize.ts';
import { compareDocs } from '../src/core/compare.ts';
import { addVisualChanges, countChanges } from '../src/core/pipeline.ts';
import { describeChange, notices } from '../src/core/describe.ts';
import { pageMapSvg } from '../src/core/report.ts';
import type { Change, CompareResult } from '../src/core/types.ts';

const dir = new URL('./fixtures/', import.meta.url).pathname;
const skip = !(await canRender()) && 'no canvas';

async function run(before: string, after: string): Promise<CompareResult> {
  const pa = await openPdf(dir + before);
  const pb = await openPdf(dir + after);
  const r = compareDocs(buildDocModel(await extractText(pa, 'old')), buildDocModel(await extractText(pb, 'new')));
  await addVisualChanges(r, (p) => renderPage(pa, p, 1.5), (p) => renderPage(pb, p, 1.5));
  return r;
}

let cached: CompareResult | null = null;
const visual = async () => (cached ??= await run('visual-before.pdf', 'visual-after.pdf'));
/** Visual changes and minor shifts on one (1-based) page of the new version. */
const onPage = (r: CompareResult, page: number) => ({
  changes: r.changes.filter((c) => c.category === 'visual' && (c.new.pages.includes(page - 1) || (!c.new.pages.length && c.old.pages.includes(page - 1)))),
  minor: r.minor.filter((c) => c.new.pages.includes(page - 1) || c.old.pages.includes(page - 1)),
});
const list = (cs: Change[]) => cs.map((c) => describeChange('en', c)).join(' | ');

test('lines through or under text and a rule above a paragraph are reported, not hidden by the text mask', { skip }, async () => {
  const { changes, minor } = onPage(await visual(), 1);
  const d = changes.map((c) => describeChange('en', c));
  assert.ok(d.includes('Struck through: “four”'), list(changes));
  assert.ok(d.includes('Struck through: “12,000”'), list(changes));
  assert.ok(d.includes('Underlined: “thirty days”'), list(changes));
  // The rule is a graphic of its own, and the paragraph below it is not
  // reported as a colour or weight change.
  const rule = changes.find((c) => !c.format && c.kind === 'graphic');
  assert.ok(rule && rule.new.rects[0].rect.w > 400 && rule.new.rects[0].rect.h < 10, list(changes));
  assert.ok(!d.includes('Text colour or weight changed'), list(changes));
  assert.equal(changes.length, 4, list(changes));
  assert.equal(minor.length, 0);
});

test('a band that changed colour next to a re-aligned line is reported', { skip }, async () => {
  const { changes } = onPage(await visual(), 2);
  assert.ok(changes.some((c) => c.kind === 'position'), list(changes));
  const band = changes.find((c) => c.kind === 'graphic');
  assert.ok(band, list(changes));
  assert.ok(band.old.rects[0].rect.w > 400 && band.new.rects[0].rect.w > 400);
});

test('a removed frame is kept next to the colour change of the text inside it', { skip }, async () => {
  const { changes } = onPage(await visual(), 3);
  assert.deepEqual(changes.map((c) => describeChange('en', c)).sort(), ['Graphic or image removed', 'Text colour or weight changed']);
});

test('colour changes on two stacked lines stay two changes, each with its own place and text', { skip }, async () => {
  const { changes } = onPage(await visual(), 4);
  assert.equal(changes.length, 2, list(changes));
  const [a, b] = [...changes].sort((x, y) => x.new.rects[0].rect.y - y.new.rects[0].rect.y);
  assert.equal(a.new.text, 'Emergency call-outs');
  assert.equal(b.new.text, 'hours of');
  for (const c of changes) assert.equal(c.old.rects.length, c.new.rects.length);
});

test('a bar that grew and a rule that became double are graphic changes, not minor shifts', { skip }, async () => {
  const { changes, minor } = onPage(await visual(), 5);
  assert.equal(changes.filter((c) => c.kind === 'graphic').length, 2, list(changes));
  assert.equal(minor.length, 0);
});

test('light grey shading and a light hairline are found', { skip }, async () => {
  const { changes } = onPage(await visual(), 6);
  const g = changes.filter((c) => c.kind === 'graphic');
  assert.equal(g.length, 2, list(changes));
  assert.ok(g.some((c) => c.new.rects[0].rect.h >= 20), 'shaded row');
  assert.ok(g.some((c) => c.new.rects[0].rect.h <= 6 && c.new.rects[0].rect.w > 400), 'hairline');
});

test('every place of a bold change is skipped by the colour check', { skip }, async () => {
  const { changes } = onPage(await visual(), 7);
  const r = await visual();
  // Four first sentences set in bold. Not a document-wide substitution, so
  // each place is its own format change (an aggregated one would carry the
  // rects of every place; the skip set works from rects either way).
  const fmt = r.changes.filter((c) => c.kind === 'format' && c.new.pages.includes(6));
  assert.equal(fmt.length, 4, list(fmt));
  assert.equal(changes.filter((c) => c.kind === 'graphic').length, 0, list(changes));
});

test('an inserted page without text is reported, and the chart page after it is still paired', { skip }, async () => {
  const r = await run('figpages-before.pdf', 'figpages-after.pdf');
  assert.equal(r.changes.length, 1, list(r.changes));
  const [c] = r.changes;
  assert.equal(c.pageChange, 'added');
  assert.deepEqual(c.new.pages, [1]);
  assert.equal(describeChange('en', c), 'Page without text added (images or drawings only)');
  assert.equal(countChanges(r.changes).visual, 1);
  // In the old version it goes before the chart page it pushed back.
  assert.equal(c.old.caret?.page, 1);
  // Old p. 2 and new p. 3 hold the same chart: compared, nothing to report.
  assert.ok(!r.changes.some((x) => x.old.pages.includes(1)));
});

test('pages without text that were paired by position are noted as such, not as "not compared"', { skip }, async () => {
  const r = await run('figpages-before.pdf', 'figpages-after.pdf');
  const n = notices('en', r);
  // The inserted page is a change; the chart pages were compared as images.
  assert.ok(!n.some((x) => x.level === 'warn'), JSON.stringify(n));
  assert.ok(n.some((x) => x.level === 'info' && x.text.includes('old p. 2 ↔ new p. 3') && x.action === 'pair'), JSON.stringify(n));
  // The page map draws that pairing.
  assert.match(pageMapSvg(r, 'en'), /<line class="image"/);
});

test('a removed page without text is reported', { skip }, async () => {
  const r = await run('figpages-after.pdf', 'figpages-before.pdf');
  assert.equal(r.changes.length, 1, list(r.changes));
  assert.equal(r.changes[0].pageChange, 'removed');
  assert.deepEqual(r.changes[0].old.pages, [1]);
  assert.equal(describeChange('zh', r.changes[0]), '删除了一页没有文字的页面（只有图片或图形）');
});
