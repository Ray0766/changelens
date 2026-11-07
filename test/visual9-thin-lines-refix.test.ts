// Visual stage, fix round 9, area V2-thin-light-lines, second pass: what
// the verifier's counter-probes found after lines through and under words
// were first measured by their distance from the paper (each pixel's lowest
// channel).
// - On a highlighter's fill (pure yellow, bright green, cyan) the lowest
//   channel reads the fill as dark as the glyphs: 1 pt black strikes and
//   0.75 pt underlines over highlighted words were lost, mostly silently.
//   Such a pair of boxes is now measured by luminance, as before.
// - A thin underline in a filled table cell was taken for a table rule
//   (the fill runs on past the text) and dropped silently. A line is now
//   measured against what lies just above and below it.
// - A colour change of a word under a line found on it was lost: the line
//   replaced it. It is now told outside the line's rows and listed too,
//   unless the word took the line's own colour.
// - A stamp's border turned by 18° crossing a figure read as an underline.
//   A line that rises 10° or more across the word is no line of it.
// - A red arrow after a struck word lengthened the strike onto the next
//   word, and a word a strike was followed onto was counted as well.
// Fixtures test/fixtures/probe9-V2-refix-*.pdf are SYNTHETIC: fpdf2 2.9
// and PyMuPDF 2.1 (test/fixtures/gen9/v2-thin-lines-refix.py), and the
// stamp probe of review round 7 made with Chromium
// (test/fixtures/gen9/v2-stamp-frame.cjs).
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
  const pa = await openPdf(before);
  const pb = await openPdf(after);
  const r = compareDocs(buildDocModel(await extractText(pa, 'old')), buildDocModel(await extractText(pb, 'new')));
  await addVisualChanges(r, (p) => renderPage(pa, p, 1.5), (p) => renderPage(pb, p, 1.5));
  return r;
}
const probe = (a: string, b: string) => run(fixtures + `probe9-V2-refix-${a}.pdf`, fixtures + `probe9-V2-refix-${b}.pdf`);
const list = (cs: Change[]) => cs.map((c) => describeChange('en', c));
const lines = (r: CompareResult) => list(r.changes.filter((c) => c.format?.decoration));
const counted = (r: CompareResult) => (r.coverage?.new.partlyCompared ?? []).reduce((n, u) => n + u.count, 0);
const recoloured = (r: CompareResult) => r.changes.filter((c) => c.format?.appearanceChanged && !c.format.decoration).map((c) => c.new.text);
const DELETED = 'Deleted “HT-1030 Garden fork, four tines each 6 26.40”';
const ROW = 'Anvil loppers 70 cm, ratchet';

test('V2-thin refix: strikes and underlines on a highlighter’s yellow, green or cyan fill are found, moved or not', { skip }, async () => {
  // Before: "No differences found" for the black 1 pt strike on yellow and
  // the 0.75 pt underline on green (the lowest channel read the fill as
  // black). The red 0.5 pt strike on cyan is as faint as in luminance: it
  // is counted as compared in part where unmoved, and listed as a colour
  // where the text moved (both as before the lines were measured so).
  const r = await probe('hl-before', 'hl-marks');
  assert.deepEqual(lines(r), ['Struck through: “storage of finished parts”', 'Underlined: “within 30 days”']);
  assert.equal(counted(r), 2);
  const moved = await probe('hl-before', 'hl-shift-marks');
  assert.deepEqual(lines(moved), ['Struck through: “storage of finished parts”', 'Underlined: “within 30 days”']);
  // Control: the highlighted text moved 7 pt gives no line and no count.
  const ctrl = await probe('hl-before', 'hl-shift-before');
  assert.deepEqual(list(ctrl.changes), []);
  assert.equal(counted(ctrl), 0);
});

test('V2-thin refix: a thin underline in a filled table cell is listed, not taken for a table rule', { skip }, async () => {
  // fpdf2's 0.34 pt underline on a row filled #fff2cc (as every row is).
  // Before: "No differences found" (the fill runs on past the text, and
  // was taken for a rule along the row); on grey 208 it was only counted.
  for (const fill of ['yel', 'g208']) {
    const r = await probe(`fill-${fill}-before`, `fill-${fill}-U`);
    assert.deepEqual(list(r.changes), [`Underlined: “${ROW}”`], fill);
    assert.equal(counted(r), 0, fill);
    const moved = await probe(`fill-${fill}-before`, `fill-${fill}-reflow-U`);
    assert.deepEqual(list(moved.changes), [DELETED, `Underlined: “${ROW}”`], fill);
    // Control: the re-flow alone.
    const ctrl = await probe(`fill-${fill}-before`, `fill-${fill}-reflow`);
    assert.deepEqual(list(ctrl.changes), [DELETED], fill);
    assert.equal(counted(ctrl), 0, fill);
  }
});

test('V2-thin refix: a word recoloured under a line drawn over its phrase lists both the line and the colour', { skip }, async () => {
  // "finished" turned red, and a grey 0.8 pt strike, a #00ff00 0.73 pt
  // underline or a yellow 0.8 pt strike over "storage of finished parts".
  // Before: the line only (the recolour was replaced by it).
  const struck = 'Struck through: “storage of finished parts”';
  for (const [after, line] of [
    ['recol-grey', struck],
    ['recol-green', 'Underlined: “storage of finished parts”'],
    ['recol-yellow', struck],
  ] as const) {
    const r = await probe('recol-before', after);
    assert.deepEqual(lines(r), [line], after);
    assert.deepEqual(recoloured(r), ['finished'], after);
  }
  // Controls: the recolour alone is a colour change; the grey strike alone
  // gives no colour change; a word given the line's own colour with it
  // (struck in the same red) is one change, the strike.
  assert.deepEqual(recoloured(await probe('recol-before', 'recol-text')), ['finished']);
  assert.deepEqual(recoloured(await probe('recol-before', 'recol-plain')), []);
  const same = await probe('recol-before', 'recol-same');
  assert.deepEqual(list(same.changes), ['Struck through: “finished”']);
});

test('V2-thin refix: a stamp’s border turned by 18° across a figure is no underline', { skip }, async () => {
  // Review round 7's probe p15: a red stamp at 55 % opacity, turned -18°,
  // whose border crosses the foot of "253.86", over a statement that a
  // note line re-flowed. Before: "Underlined: “253.86”".
  for (const after of ['n25', 'n90']) {
    const r = await run(fixtures + 'probe9-V2-refix-stamp-SYNTHETIC-before.pdf', fixtures + `probe9-V2-refix-stamp-SYNTHETIC-${after}.pdf`);
    assert.deepEqual(lines(r), [], after);
    assert.ok(list(r.changes).includes('Added “PAID”'), after);
  }
});

test('V2-thin refix: a word that a strike was followed onto is listed, not also counted', { skip }, async () => {
  // A grey 0.8 pt strike over "torque wrenches were missing" next to an
  // edit; "were" lies a pixel lower than the others. Before: listed in the
  // strike and counted as compared in part.
  const r = await probe('recol-before', 'were');
  assert.ok(lines(r).some((l) => l.includes('wrenches were missing')), lines(r).join(' | '));
  assert.equal(counted(r), 0);
});

test('V2-thin refix: a watermark made lighter is no faint line under the words it crosses', { skip }, async () => {
  // A grey "DRAFT" turned 45° over the text, 35 % → 15 % opacity, nothing
  // else changed. Before: a word counted as having "a line too thin or too
  // light", and --fail-on-change exited 3. The faint line is now looked for
  // outside the watermark's letters as well.
  const r = await probe('wm', 'wm-faint');
  assert.deepEqual(list(r.changes), []);
  assert.equal(counted(r), 0);
});
