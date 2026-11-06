// Visual stage, fix round 8, after the text and visual streams were merged:
// interactions between the two streams and the problems the visual
// re-verifiers left open (ids F0–F9 of the final pass, T-V1… for the text
// verifier's round-9 problems).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { openPdf } from '../src/node/pdf.ts';
import { renderPage, canRender } from '../src/node/render.ts';
import { extractText } from '../src/pdf/extract.ts';
import { buildDocModel } from '../src/core/tokenize.ts';
import { compareDocs } from '../src/core/compare.ts';
import { addVisualChanges } from '../src/core/pipeline.ts';
import { describeChange } from '../src/core/describe.ts';
import { partlyCompared } from '../src/core/visual.ts';
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

test('F2: words under a dark watermark that show the same pixels in both versions are not counted as compared in part', { skip }, async () => {
  // SYNTHETIC (Chromium, review 8 overlay counter-probes): a service
  // agreement page with a 28 % grey DRAFT drawn in front of the text. The
  // page compared with itself gave "No differences found in what could be
  // compared, but not everything was compared" (33 words under the
  // watermark's letters) and exit code 3 with --fail-on-change.
  const partly = (r: CompareResult) => partlyCompared(r).flatMap((u) => u.words);
  const same = await run('probe8-F2-wm.pdf', 'probe8-F2-wm.pdf');
  assert.deepEqual([list(same.changes), partly(same)], [[], []]);
  const cli = new URL('../src/cli/cli.ts', import.meta.url).pathname;
  const exit = spawnSync(process.execPath, [cli, fixtures + 'probe8-F2-wm.pdf', fixtures + 'probe8-F2-wm.pdf', '--fail-on-change'], { encoding: 'utf8', env: { ...process.env, LC_ALL: '', LANG: 'C.UTF-8' } });
  assert.equal(exit.status, 0, exit.stdout + exit.stderr);
  assert.match(exit.stdout, /^No differences found\.$/m);
  // An amount edited away from the watermark: listed, and nothing counted.
  const far = await run('probe8-F2-wm.pdf', 'probe8-F2-wm-far.pdf');
  assert.deepEqual([list(far.changes), partly(far)], [['Number changed: 1,200 → 1,250 (+4.2%)'], []]);
  // Control: "ninety" struck through under the watermark's letters is
  // listed, or counted where it is not.
  const strike = await run('probe8-F2-wm.pdf', 'probe8-F2-wm-strike.pdf');
  assert.ok(list(strike.changes).includes('Struck through: “ninety”') || partly(strike).includes('ninety'), list(strike.changes).join(' | '));
});

test('F7: values of a form flattened with its widgets kept, drawn twice, are not listed as drawn heavier', { skip }, async () => {
  // SYNTHETIC (review 7 form probes, f10d): a filled form, then the same
  // form flattened (the values written into the page) with its widgets
  // kept, and one value edited. The widgets draw each value again over the
  // page's copy, so its anti-aliased edges are darker. Since the values in
  // the two versions are matched (one read from the fields, one from the
  // page), five unchanged values read "Text colour or weight changed".
  const r = await run('probe8-F7-before.pdf', 'probe8-F7-kept.pdf');
  assert.deepEqual(list(r.changes), ['Changed “Room 3.14 (Harbour)” → “Room 4.02 (Quay)”']);
  // Controls (pypdf): the page's copy of "J. Haverkamp" made faux bold
  // (render mode 2, 0.6 pt), or the widget's copy drawn red: listed.
  for (const file of ['probe8-F7-kept-bold.pdf', 'probe8-F7-kept-red-widget.pdf']) {
    const c = await run('probe8-F7-before.pdf', file);
    assert.ok(c.changes.some((x) => x.format?.appearanceChanged && hits(x, 'new', 1, 260, 132)), `${file}: ${list(c.changes).join(' | ')}`);
    assert.equal(c.changes.length, 2, `${file}: ${list(c.changes).join(' | ')}`);
  }
});

const lines = (r: CompareResult) => list(r.changes).filter((d) => /^(Struck through|Strikethrough removed|Underlined|Underline removed)/.test(d));

test('F4: lines looked for again next to a graphic that changed are not found in a shared band, a re-sampled bar or too few columns', { skip }, async () => {
  // SYNTHETIC (review 7 structure probes): a Chromium price list whose
  // navy header band widened by 6 pt when a row was added (white
  // "Description" on it re-sampled); a Calc sheet with a row added above
  // a zebra-striped table (a "4" moved off its stripe); a Chromium
  // maintenance table split across pages, its p. 4 alone (a row rule under
  // "bearings" in the old version only, the new version's rule elsewhere).
  // The second line test, with the changed graphic's ink left out, listed
  // "Struck through: “Description”", "Struck through: “4”" and "Underline
  // removed: “bearings”".
  for (const [a, b] of [
    ['probe8-F4-zebra-before.pdf', 'probe8-F4-zebra-ins-row.pdf'],
    ['probe8-F4-calc-before.pdf', 'probe8-F4-calc-ins.pdf'],
    ['probe8-F4-split-before.pdf', 'probe8-F4-split-after.pdf'],
  ]) {
    const r = await run(a, b);
    assert.deepEqual(lines(r), [], `${b}: ${list(r.changes).join(' | ')}`);
  }
  // Controls (reportlab overlays): "Description" struck through in black,
  // the "4" struck through, "bearings" underlined in the old version.
  const z = await run('probe8-F4-zebra-before.pdf', 'probe8-F4-zebra-ins-row-strike.pdf');
  assert.deepEqual(lines(z), ['Struck through: “Description”'], list(z.changes).join(' | '));
  const c = await run('probe8-F4-calc-before.pdf', 'probe8-F4-calc-ins-strike4.pdf');
  assert.deepEqual(lines(c), ['Struck through: “4”'], list(c.changes).join(' | '));
  const s = await run('probe8-F4-split-before-ul.pdf', 'probe8-F4-split-after.pdf');
  assert.deepEqual(lines(s), ['Underline removed: “bearings”'], list(s.changes).join(' | '));
  // And (Chromium, review 8 visual counter-probe) "Amount" in a shaded
  // header band underlined 1.5 pt above a red rule added along the band:
  // the rule's ink leaves too few columns to compare across three rows,
  // but the underline's own row shows it.
  const u = await run('probe8-F4-band-before.pdf', 'probe8-F4-band-rule-ul.pdf');
  assert.deepEqual(lines(u), ['Underlined: “Amount”'], list(u.changes).join(' | '));
});

test('F4: an opaque watermark letter over a header word accounts for the background it hides', { skip }, async () => {
  // SYNTHETIC (review 8 N4 counter-probe, pypdf): an opaque light grey
  // DRAFT added across the navy header of a Chromium stock sheet; one
  // letter covers "Bin". Before: "Text colour or weight changed" for
  // "Bin" next to "Added “DRAFT”": the old navy background had no overlay
  // of its own to account for it.
  const r = await run('probe8-R5-V02-before.pdf', 'probe8-F4-wmo.pdf');
  assert.ok(!r.changes.some((c) => c.format?.appearanceChanged), list(r.changes).join(' | '));
  assert.ok(list(r.changes).includes('Added “DRAFT”'), list(r.changes).join(' | '));
});

test('F8: words in the middle of a panel given a tint are not recoloured; a highlight in it is', { skip }, async () => {
  // SYNTHETIC (Chromium, review 8 overlay counter-probes): the "Key terms"
  // panel given a #fff4c2 tint. Its lines are set so close that the text
  // mask covers the panel between them, so nothing differs next to
  // "payment method within" in the middle of the third line: their
  // background turned from paper to the tint with no overlay found, and
  // they read "Text colour or weight changed" next to the panel's graphic.
  for (const [a, b] of [
    ['probe8-F1-before.pdf', 'probe8-F8-panel-yellow-fill.pdf'],
    ['probe8-F8-panel-yellow-fill.pdf', 'probe8-F1-before.pdf'],
  ]) {
    const r = await run(a, b);
    assert.deepEqual(r.changes.map((c) => [c.kind, !!c.format]), [['graphic', false]], list(r.changes).join(' | '));
  }
  // Control: the same tint with "within 14 days" highlighted in green
  // (#a5d6a7): the highlight is listed.
  const hl = await run('probe8-F1-before.pdf', 'probe8-F8-panel-yellow-farhl.pdf');
  assert.ok(colourAt(hl, 200, 180), list(hl.changes).join(' | '));
  assert.equal(hl.changes.filter((c) => c.format?.appearanceChanged).length, 1, list(hl.changes).join(' | '));
});

test('F9: the words of an auto-sized field value refitted after an edit are not listed as lighter', { skip }, async () => {
  // SYNTHETIC (review 7 form probe f14, values in /V only): the address in
  // a field with an automatic font size made longer, so the viewer draws
  // the whole value smaller. The text comparison lists the added words and
  // does not list the other words' new size (it follows from the edit),
  // but their glyphs have less ink: "Text colour or weight changed" twice.
  const r = await run('probe8-R3-06-auto-before.pdf', 'probe8-R3-06-auto-after.pdf');
  assert.deepEqual(list(r.changes), ['Added “Industrial Estate, Maryhill Road” (form field)', 'Number changed: 77812 → 77821 (form field)']);
  // The same with appearance streams written by pypdf, which keep the
  // boxes' height: the words' boxes are narrower.
  const p = await run('probe8-F9-pypdf-before.pdf', 'probe8-F9-pypdf-after.pdf');
  assert.ok(!p.changes.some((c) => c.format?.appearanceChanged), list(p.changes).join(' | '));
  // Control (pypdf): the same value also drawn red (/DA): its colour is listed.
  const red = await run('probe8-R3-06-auto-before.pdf', 'probe8-F9-auto-after-red.pdf');
  assert.ok(red.changes.some((c) => c.format?.appearanceChanged && hits(c, 'new', 1, 260, 150)), list(red.changes).join(' | '));
});

test('T-V2: words under the letters of a translucent watermark drawn in front of them are not listed as lighter', { skip }, async () => {
  // SYNTHETIC (reportlab memo, two pages; pypdf merge of a diagonal
  // "CONFIDENTIAL", Helvetica-Bold 90 pt, grey 0.6 at alpha 0.5, as review
  // 7 robust/p10-watermark). Merged over the page, the watermark lightens
  // the glyphs under its letters; measured against its colour as if it lay
  // behind them, "on" and "open" read "Text colour or weight changed" (24
  // such items on the 34-page memo). They are counted as compared in part.
  const partly = (r: CompareResult) => partlyCompared(r).flatMap((u) => u.words);
  const over = await run('probe8-T-V2-memo.pdf', 'probe8-T-V2-wm-over.pdf');
  assert.deepEqual(list(over.changes), ['Added “CONFIDENTIAL”', 'Added “CONFIDENTIAL”']);
  assert.ok(partly(over).includes('open'), partly(over).join(' '));
  // Merged under the page, its letters come before the words in the
  // page's drawing order: the words are compared in full, nothing counted.
  const under = await run('probe8-T-V2-memo.pdf', 'probe8-T-V2-wm-under.pdf');
  assert.deepEqual([list(under.changes), partly(under)], [['Added “CONFIDENTIAL”', 'Added “CONFIDENTIAL”'], []]);
  // Controls: "on" and "open" turned red under the letters in front, and
  // turned grey over the letters behind them: listed. Turned grey under
  // the letters in front, they are counted (a lighter word there is not
  // told from the watermark's veil).
  for (const file of ['probe8-T-V2-red-over.pdf', 'probe8-T-V2-grey-under.pdf']) {
    const r = await run('probe8-T-V2-memo.pdf', file);
    assert.ok(colourAt(r, 280, 460), `${file}: ${list(r.changes).join(' | ')}`);
    assert.equal(r.changes.length, 3, `${file}: ${list(r.changes).join(' | ')}`);
  }
  const grey = await run('probe8-T-V2-memo.pdf', 'probe8-T-V2-grey-over.pdf');
  assert.ok(colourAt(grey, 280, 460) || partly(grey).includes('open'), list(grey.changes).join(' | '));
});
