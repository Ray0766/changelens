// Visual stage, fix round 6: real edits that the rules of round 5 hid next to
// the noise they suppress (adversarial probes of round 5, see the commit
// messages). Each probe asserts what the reviewer must see, and its control
// that the noise stays hidden. Fixtures test/fixtures/probe6-*.pdf are
// copies of the SYNTHETIC probe and verifier PDFs of round 5 (Chromium via
// Playwright, pypdf for /Rotate and overlays; WenQuanYi Zen Hei for CJK).
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
const visual = (r: CompareResult) => r.changes.filter((c) => c.category === 'visual');
const formats = (r: CompareResult) => r.changes.filter((c) => c.format?.appearanceChanged);
/** The format items, as "description @ x,y" of their first new place. */
const at = (cs: Change[]) => cs.map((c) => `${describeChange('en', c)} @ ${Math.round(c.new.rects[0].rect.x)},${Math.round(c.new.rects[0].rect.y)}`);

test('V06: CJK characters struck through or underlined are found after a re-flow by a fraction of a pixel', { skip }, async () => {
  // 第二条 with 二 struck reads as 第三条. Before: 二, 三 and the underline
  // on 王 were missing, and 二〇二六 became "Text colour or weight changed"
  // for 二〇二 plus a strike on 六.
  const r = await run('probe6-cjk-before.pdf', 'probe6-cjk-reflow-after.pdf');
  assert.deepEqual(list(formats(r)), ['Struck through: “二”', 'Struck through: “三”', 'Underlined: “王”', 'Struck through: “二〇二六”']);
  // 12 pt, line height 1.5, a lead of 6.67 pt: 3 of 4 strikes were hidden.
  const v = await run('probe6-cjkv-before.pdf', 'probe6-cjkv-after.pdf');
  assert.deepEqual(list(formats(v)), ['Struck through: “二”', 'Struck through: “三”', 'Struck through: “十”', 'Struck through: “二”']);
  // Control: the same lead without strikes adds the line only.
  const c = await run('probe6-cjkv-before.pdf', 'probe6-cjkv-ctrl.pdf');
  assert.deepEqual(list(c.changes), ['Added “修订说明：本稿根据第二次会议意见修改。”']);
});

test('V07: a strike or a colour change under a removed watermark is listed; the watermark alone is one deletion', { skip }, async () => {
  // An opaque grey DRAFT over the text: "configuration" under it is struck
  // in the new version, "specification" elsewhere turns red.
  const s = await run('probe6-mark-before.pdf', 'probe6-mark-strike.pdf');
  assert.deepEqual(list(s.changes).sort(), ['Deleted “DRAFT”', 'Struck through: “configuration”', 'Text colour or weight changed']);
  // "records", under the A, turns red ("invoiced" turns bold, found as text).
  const red = await run('probe6-mark-before.pdf', 'probe6-mark-red.pdf');
  assert.deepEqual(at(formats(red)), ['Text colour or weight changed @ 167,330', 'Text colour or weight changed @ 380,369']);
  assert.ok(formats(red)[1].new.text.includes('records'), formats(red)[1].new.text);
  const ctrl = await run('probe6-mark-before.pdf', 'probe6-mark-ctrl.pdf');
  assert.deepEqual(list(ctrl.changes), ['Deleted “DRAFT”']);
  // A light grey watermark behind the text: underline, strike and a red
  // amount under it, each listed; removing the watermark only is one item.
  const wm = await run('probe6-wm-before.pdf', 'probe6-wm-after.pdf');
  assert.deepEqual(list(wm.changes).sort(), ['Deleted “DRAFT”', 'Struck through: “written”', 'Text colour or weight changed', 'Underlined: “written”']);
  assert.ok(formats(wm).some((c) => c.new.text.includes('EUR 5 million')), formats(wm).map((c) => c.new.text).join(' | '));
  const wmc = await run('probe6-wm-before.pdf', 'probe6-wm-ctrl.pdf');
  assert.deepEqual(list(wmc.changes), ['Deleted “DRAFT”']);
});

test('V08: a figure under an added semi-transparent stamp that turned blue or was struck is listed; the stamp alone adds no noise', { skip }, async () => {
  const blue = await run('probe6-stamp-before.pdf', 'probe6-stamp-blue.pdf');
  assert.deepEqual(list(blue.changes), ['Added “PAID”', 'Text colour or weight changed', 'Text colour or weight changed']);
  assert.deepEqual(
    formats(blue).map((c) => c.new.text),
    ['640.00', '11,190.00'],
  );
  // Control: the stamp and the red total only; the figures under the stamp are not changes.
  const ctrl = await run('probe6-stamp-before.pdf', 'probe6-stamp-ctrl.pdf');
  assert.deepEqual(
    formats(ctrl).map((c) => c.new.text),
    ['11,190.00'],
  );
  // 2,150.00 struck through where the stamp's border crosses its start.
  const st = await run('probe6-st-before.pdf', 'probe6-st-strike.pdf');
  assert.deepEqual(list(st.changes), ['Added “PAID”', 'Struck through: “2,150.00”']);
  const stc = await run('probe6-st-before.pdf', 'probe6-st-ctrl.pdf');
  assert.deepEqual(list(stc.changes), ['Added “PAID”']);
  assert.equal(visual(stc).length, 0);
});

/** Graphic items (not text formatting, not page changes) with their new places, 1-based pages. */
const graphics = (r: CompareResult) => r.changes.filter((c) => c.kind === 'graphic' && !c.format && !c.pageChange);
const hits = (c: Change, side: 'old' | 'new', page: number, x: number, y: number) =>
  c[side].rects.some((q) => q.page === page - 1 && x >= q.rect.x - 2 && x <= q.rect.x + q.rect.w + 2 && y >= q.rect.y - 2 && y <= q.rect.y + q.rect.h + 2);

test('V11: a graphic edited on a page turned by /Rotate is listed beside the page change; the turn alone is one item', { skip }, async () => {
  // The callout fill turned from green to pink and a tick was added on the
  // turned page 2. Before: one "Page size changed" item, as for the turn alone.
  const r = await run('probe6-turn-before.pdf', 'probe6-turn-after.pdf');
  assert.deepEqual(list(visual(r)), ['Page size changed: 595 × 842 pt → 842 × 595 pt', 'Graphic or image changed', 'Graphic or image added']);
  const g = graphics(r);
  assert.ok(hits(g[0], 'new', 2, 550, 200) && hits(g[0], 'old', 2, 200, 280), JSON.stringify(g[0]));
  assert.ok(hits(g[1], 'new', 2, 530, 490), JSON.stringify(g[1].new.rects));
  // A figure partly whited out on the turned page.
  const w = await run('probe6-turn-before.pdf', 'probe6-turn-whiteout.pdf');
  assert.deepEqual(list(visual(w)), ['Page size changed: 595 × 842 pt → 842 × 595 pt', 'Graphic or image changed']);
  // Control: the turn alone; the turned figure goes with the page change.
  const c = await run('probe6-turn-before.pdf', 'probe6-turn-ctrl.pdf');
  assert.deepEqual(list(c.changes), ['Page size changed: 595 × 842 pt → 842 × 595 pt']);
});

test('V12: a tick, a tint or an underline on a running table header row after a re-flow is listed with its new place', { skip }, async () => {
  // Before: "Graphic or image removed" with the old page only.
  for (const [file, page, x, y] of [
    ['probe6-thead-tick.pdf', 3, 512, 66],
    ['probe6-thead-tint.pdf', 3, 300, 66],
    ['probe6-thead-underline.pdf', 4, 240, 74],
  ] as const) {
    const r = await run('probe6-thead-before.pdf', file);
    const g = graphics(r);
    assert.equal(g.length, 1, `${file}: ${list(r.changes).join(' | ')}`);
    assert.ok(hits(g[0], 'new', page, x, y), `${file}: ${JSON.stringify(g[0].new.rects)}`);
  }
  // Control: the re-flow alone.
  const c = await run('probe6-thead-before.pdf', 'probe6-thead-reflow.pdf');
  assert.deepEqual(list(c.changes), ['Added a paragraph']);
});

test('V01: a stamp, a tint or a highlight on one copy of a repeated header row is listed; copies that only came or went with a page break are not', { skip }, async () => {
  // The header row "Tank Volume (Ml) Bays" repeated at the top of new p. 3.
  // Before: hidden in the row's consequence, output as for the re-flow alone.
  for (const [file, x, y] of [
    ['probe6-rows-stamp.pdf', 358, 48],
    ['probe6-rows-tint.pdf', 200, 48],
    ['probe6-rows-highlight.pdf', 318, 49],
  ] as const) {
    const r = await run('probe6-rows-before.pdf', file);
    const g = graphics(r);
    assert.equal(g.length, 1, `${file}: ${list(r.changes).join(' | ')}`);
    assert.ok(hits(g[0], 'new', 3, x, y), `${file}: ${JSON.stringify(g[0].new.rects)}`);
    assert.equal(r.ignored.repeatedLines, 7);
  }
  // Controls: the re-flow alone lists the paragraph only, the header rows
  // are counted; the same stamp in a data row is listed as before.
  const base = await run('probe6-rows-before.pdf', 'probe6-rows-reflow.pdf');
  assert.deepEqual(list(base.changes), ['Added a paragraph']);
  assert.equal(base.ignored.repeatedLines, 7);
  const ctl = await run('probe6-rows-before.pdf', 'probe6-rows-ctl.pdf');
  assert.deepEqual(list(graphics(ctl)), ['Graphic or image changed']);
});
