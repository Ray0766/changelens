// Visual stage, fix round 8, second pass on strikes and underlines: rules
// added in the first pass hid or mislabelled real edits that the verifier's
// counter-probes showed (a cell rule or a bracket next to an underlined
// word taken for a frame). Each test asserts what the reviewer must see,
// next to its control. Fixtures test/fixtures/probe8-V2V*-* are copies of
// the verifier's SYNTHETIC counter-probes (reportlab; Chromium via
// Playwright).
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
const underlined = (...words: string[]) => words.map((w) => `Underlined: “${w}”`);

test('V2-decorations-V1: an underline next to a stroke new at one end only is no frame (a cell rule, a bracket or bar after the word)', { skip }, async () => {
  // A 0.5 pt vertical rule added 1.2 pt right of right-aligned amounts, two
  // of them underlined. Before: "No differences found." (the rule at the
  // underline's right end was read as a frame's side).
  const r = await run('probe8-V2V1-rule-before.pdf', 'probe8-V2V1-rule-under.pdf');
  assert.deepEqual(list(r.changes), underlined('3,480.00', '1,320.00'));
  // Control: the rule alone adds no line.
  const c = await run('probe8-V2V1-rule-before.pdf', 'probe8-V2V1-rule-only.pdf');
  assert.deepEqual(list(c.changes).filter((d) => /Underl|Struck|Strike/.test(d)), []);
  // "<u>Clause 12</u>[a]" and "<u>Tenant</u>|": before, a colour item for
  // Clause 12 and nothing for Tenant.
  const m = await run('probe8-V2V1-mark-before.pdf', 'probe8-V2V1-mark-after.pdf');
  assert.deepEqual(list(m.changes), [
    ...underlined('Section 4'),
    'Added “(b)”',
    ...underlined('Clause 12'),
    'Added “[a]”',
    ...underlined('Tenant'),
    'Added “|”',
    'Changed “Landlord” → “Landlordl”',
  ]);
  // A box drawn around words (both sides and a top edge) stays a graphic:
  // see R4-17 in visual8-decorations.test.ts.
});

test('V2-decorations-V2: a strike drawn with a slight slope (a line tool) is listed where no graphic or overlay explains the slant', { skip }, async () => {
  const struck = (...words: string[]) => words.map((w) => `Struck through: “${w}”`);
  // A 0.7 pt line rising 2.5 pt over "writing". Before: "No differences
  // found." (the levelness test meant for a stamp's border rejected it).
  const r = await run('probe8-V2V2-before.pdf', 'probe8-V2V2-slope.pdf');
  assert.deepEqual(list(r.changes), struck('writing'));
  // Eight marks rising 0–2.5 pt: before, twenty-four and writing were missing.
  const m = await run('probe8-V2V2-before.pdf', 'probe8-V2V2-marks.pdf');
  assert.deepEqual(list(m.changes), [...struck('thirty', 'nominated', 'statutory', 'twenty-four', 'writing'), ...underlined('laws'), ...struck('ninety'), ...underlined('seven')]);
  // Where a stamp drawn across the text is listed as a graphic, its slanted
  // border is still no line: see R7-V01 in visual8-decorations.test.ts.
});

test('V2-decorations-V3: figures turned pure red are a colour change, not a strikethrough removed; red strikes on them are listed', { skip }, async () => {
  const colour = 'Text colour or weight changed';
  // Labels in Helvetica 10 turned #ff0000. Before: "Strikethrough removed:
  // “44”" for the two at whole-pixel x (the black version's anti-aliased
  // edges, in units of the red ink, came out darker along the 4s' bars).
  const r = await run('probe8-V2V3-before.pdf', 'probe8-V2V3-red.pdf');
  assert.deepEqual(list(r.changes), Array(7).fill(colour));
  // Liberation Sans 9 (Chromium), 15 figures turned red: before, one was
  // "Strikethrough removed: “4”".
  const c = await run('probe8-V2V3-ls9-before.pdf', 'probe8-V2V3-ls9-red.pdf');
  assert.deepEqual(list(c.changes), Array(15).fill(colour));
  // Control (SYNTHETIC counter-probe): figures turned red and struck or
  // underlined in red, grey "25" struck in black and "8" turned red and
  // struck are listed as lines; "44" and "17" turned red only are colour
  // changes. "fee" (black, struck in red at the height of the e's bars) is
  // a colour item, as before this change: a known limit.
  const m = await run('probe8-V2V3-cp-before.pdf', 'probe8-V2V3-cp-marks.pdf');
  assert.deepEqual(list(m.changes), [
    'Struck through: “44”',
    colour,
    'Underlined: “74”',
    'Struck through: “4”',
    colour,
    colour,
    colour,
    'Struck through: “25”',
    'Struck through: “8”',
  ]);
  // Black CJK text after a re-flow by a fraction of a pixel keeps one unit
  // for both versions: a first version of this change, which told a
  // recolour by the darkest pixel outside rows dark all across, gave
  // "Underlined: “二”" and "Strikethrough removed: “一”" here (their
  // strokes are such rows).
  const zh = await run('before.pdf', 'after.pdf', cases + 'holdout3-c-zh-purchase-contract-reflow/');
  assert.deepEqual(list(zh.changes.filter((c) => c.format?.decoration)), []);
});
