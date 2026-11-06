// Visual stage, fix round 8, the last pass: what the independent verifier
// of the final engine found (ids V-V1… of its round-9 problems). Fixtures
// test/fixtures/probe8-V-V*-*.pdf are SYNTHETIC (reportlab, from the
// verifier's generators or the fixer's).
import { test } from 'node:test';
import assert from 'node:assert/strict';
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
const lines = (r: CompareResult) => list(r.changes.filter((c) => c.format?.decoration));
const recoloured = (r: CompareResult) => r.changes.filter((c) => describeChange('en', c) === 'Text colour or weight changed').map((c) => c.new.text);
const counted = (r: CompareResult) => partlyCompared(r).flatMap((p) => p.words);

test('V-V3: a sloped strike followed within a point by a mark of another colour or course is listed', { skip }, async () => {
  // SYNTHETIC (reportlab): a black 0.8 pt strike rising 1.5 pt over
  // "agrees", and a 40 pt line drawn 1 pt after its end. Before: the strike
  // was taken for the line's stroke (a stroke followed out of the word into
  // a graphic that changed), and only the line was listed.
  for (const [after, what] of [
    ['probe8-V-V3-red-level.pdf', 'a red level line'],
    ['probe8-V-V3-black-level.pdf', 'a black level line'],
    ['probe8-V-V3-red-slope.pdf', 'a red line rising as the strike does'],
  ]) {
    const r = await run('probe8-V-V3-before.pdf', after);
    assert.deepEqual(list(r.changes).sort(), ['Graphic or image added', 'Struck through: “agrees”'], what);
  }
  // Control: a stamp's border drawn across words, in one colour and on one
  // course into the stamp, is still no line (R7-V01).
  const stamp = await run('probe8-R7-V01-before.pdf', 'probe8-R7-V01-after.pdf');
  assert.deepEqual(lines(stamp), []);
});

test('V-V1: a pale highlight drawn close around a word is listed', { skip }, async () => {
  // SYNTHETIC (reportlab, the verifier's generator): "landlord" highlighted
  // 0.5 pt around its line box in #d9d9d9 and in Office's light blue
  // #deebf7, 2 pt around it in #ededed; and in #c6dbef on a #e8f0fa panel
  // both versions have. Before: "No differences found." The highlight lies
  // inside the text's mask, where the graphics comparison does not look,
  // and its colour is within 40 levels of what lay behind the word.
  for (const [before, after] of [
    ['probe8-V-V1-before.pdf', 'probe8-V-V1-grey.pdf'],
    ['probe8-V-V1-grey.pdf', 'probe8-V-V1-before.pdf'],
    ['probe8-V-V1-before.pdf', 'probe8-V-V1-blue.pdf'],
    ['probe8-V-V1-before.pdf', 'probe8-V-V1-faint.pdf'],
    ['probe8-V-V1-panel.pdf', 'probe8-V-V1-panel-hl.pdf'],
  ]) {
    const r = await run(before, after);
    assert.deepEqual(list(r.changes), ['Text colour or weight changed'], after);
    assert.deepEqual(recoloured(r), ['landlord'], after);
  }
});

test('V-V1: pale stripes, panels, gradients, bands and tints the words moved in or that are listed are no highlight', { skip }, async () => {
  // SYNTHETIC (reportlab): a #deebf7 panel both versions have at the same
  // place, and a vertical gradient behind the text; a sentence inserted
  // above moves every line down by one under them.
  const moved = await run('probe8-V-V1-moved-before.pdf', 'probe8-V-V1-moved.pdf');
  assert.deepEqual(recoloured(moved), []);
  const grad = await run('probe8-V-V1-grad-before.pdf', 'probe8-V-V1-grad.pdf');
  assert.deepEqual(recoloured(grad), []);
  // A Calc table whose stripes (#eef2f7) moved by an inserted row: rows
  // that moved onto a stripe, or off one, the other version has next to
  // them.
  const calc = await run('probe8-F4-calc-before.pdf', 'probe8-F4-calc-ins.pdf');
  assert.deepEqual(recoloured(calc), []);
  // A shade given to a line, listed past its words (Chromium), and a cream
  // tint given to every page, listed, that ends at the last line.
  const band = await run('probe8-V-V1-band-before.pdf', 'probe8-V-V1-band.pdf');
  assert.deepEqual(list(band.changes), ['Graphic or image added']);
  const tint = await run('probe8-V-V1-tint-before.pdf', 'probe8-V-V1-tint.pdf');
  assert.deepEqual(recoloured(tint), []);
  // Control: a #d9d9d9 highlight put on "post" in the moved text is listed.
  const hl = await run('probe8-V-V1-moved-before.pdf', 'probe8-V-V1-moved-hl.pdf');
  assert.deepEqual(recoloured(hl), ['post']);
});

test('V-V2: a word struck or recoloured under an image stamp both versions draw is counted as compared in part', { skip }, async () => {
  // SYNTHETIC (reportlab and PIL, the verifier's generator): a blue
  // "APPROVED" PNG stamp over the second line in both versions, at 59 % and
  // 86 % opacity; "written" under its lettering struck through, or turned
  // red. Before: "No differences found.", and no notice.
  const strike = await run('probe8-V-V2-a150.pdf', 'probe8-V-V2-a150-strike.pdf');
  assert.ok(counted(strike).includes('written'), JSON.stringify(partlyCompared(strike)));
  const red = await run('probe8-V-V2-a220.pdf', 'probe8-V-V2-a220-red.pdf');
  assert.ok(counted(red).includes('written'), JSON.stringify(partlyCompared(red)));
  // Controls: the stamped page compared with itself counts nothing; a strike
  // on "by", clear of the lettering, is listed.
  const same = await run('probe8-V-V2-a150.pdf', 'probe8-V-V2-a150.pdf');
  assert.deepEqual([list(same.changes), counted(same)], [[], []]);
  const by = await run('probe8-V-V2-a150.pdf', 'probe8-V-V2-a150-strike-by.pdf');
  assert.deepEqual(list(by.changes), ['Struck through: “by”']);
});

test('V-V5: rows re-spaced by a cell padding, with nothing else changed, are not counted as compared in part', { skip }, async () => {
  // SYNTHETIC (Chromium, the verifier's generator): an invoice table with
  // zebra rows and grey row rules, cell padding 4 px → 6 px. Before: "Seal",
  // "31.00" and "217.00" were counted (the rules moved a pixel next to
  // them, grey like the glyphs' edges), and --fail-on-change exited with 3.
  const pad = await run('probe8-V-V5-before.pdf', 'probe8-V-V5-pad6.pdf');
  assert.deepEqual([list(pad.changes), counted(pad)], [[], []]);
  // Control: "Gasket set" struck through in the table re-spaced by 5 px.
  const strike = await run('probe8-V-V5-before.pdf', 'probe8-V-V5-pad5-strike.pdf');
  assert.deepEqual(list(strike.changes), ['Struck through: “Gasket set”']);
});
