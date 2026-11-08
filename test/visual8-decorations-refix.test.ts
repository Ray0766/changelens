// Visual stage, fix round 8, second pass on strikes and underlines: rules
// added in the first pass hid or mislabelled real edits that the verifier's
// counter-probes showed (a cell rule or a bracket next to an underlined
// word taken for a frame, a sloped strike, a figure turned red, faux bold,
// a Calc cell border, a turned label). Each test asserts what the reviewer
// must see, next to its control. Fixtures test/fixtures/probe8-V2V*-* are
// copies of the verifier's SYNTHETIC counter-probes (reportlab; Chromium
// via Playwright; LibreOffice Calc from openpyxl), except
// probe8-V2V3-cp-* and probe8-V2N1-*, SYNTHETIC counter-probes made with
// reportlab in this pass.
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
  // changes. "fee" (black, struck in red at the height of the e's bars)
  // was a colour item until fix round 9, which measures lines on the
  // pixels' lowest channel (visual9-thin-lines.test.ts): a red line is
  // then as dark as a black one.
  const m = await run('probe8-V2V3-cp-before.pdf', 'probe8-V2V3-cp-marks.pdf');
  assert.deepEqual(list(m.changes), [
    'Struck through: “44”',
    colour,
    'Underlined: “74”',
    'Struck through: “4”',
    colour,
    'Struck through: “fee”',
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

test('V2-decorations-V5: an underline right above a cell border both versions have is no rule going on past the text', { skip }, async () => {
  // LibreOffice Calc: horizontal rules in the old version, all borders in
  // the new, three amounts left-aligned and underlined with their item
  // names. Before: "380.00" was missing (its underline's rows took in the
  // cell's bottom border, which runs on past the text).
  const r = await run('probe8-V2V5-before.pdf', 'probe8-V2V5-under.pdf');
  assert.deepEqual(list(r.changes.filter((c) => c.format?.decoration)), underlined('Cable tray, 3 m', '462.00', 'Testing and labelling', '380.00', 'Waste removal', '75.00'));
  // Control: the borders alone add no line.
  const c = await run('probe8-V2V5-before.pdf', 'probe8-V2V5-borders.pdf');
  assert.deepEqual(list(c.changes.filter((x) => x.format?.decoration)), []);
});

test('V2-decorations-V6: a label turned by a quarter and recoloured is a colour change, though it is not laid over itself', { skip }, async () => {
  // "44" upright and black, then turned 90° and red; the page has a turned
  // margin label in both versions. Before: "No differences found." (the
  // word-direction guard skipped the colour test too).
  const r = await run('probe8-V2V6-before.pdf', 'probe8-V2V6-turned-red.pdf');
  assert.ok(list(r.changes).includes('Text colour or weight changed'), list(r.changes).join(' | '));
  assert.deepEqual(list(r.changes.filter((c) => c.format?.decoration && c.new.text === '44')), []);
  // Controls: turned only gives no colour, weight or line item (nor any
  // item for the turn of a single word, a known limit); strikes on upright
  // figures of that page are listed.
  const t = await run('probe8-V2V6-before.pdf', 'probe8-V2V6-turned.pdf');
  assert.deepEqual(list(t.changes.filter((c) => c.format?.appearanceChanged)), []);
  const m = await run('probe8-V2V6-before.pdf', 'probe8-V2V6-marks.pdf');
  assert.deepEqual(list(m.changes), ['Struck through: “4”', 'Struck through: “24”']);
});

test('V2-decorations-V4: Latin text made bold by stroking its outlines gives weight items, not strikes; a real strike there is listed', { skip }, async () => {
  // Helvetica 10.5, text render mode 2: "nominated" and "writing" bold,
  // lines 6 and 8 bold as a whole, "statutory" struck. Before: false
  // strikes on contract, governed, laws, "Spare parts are" and "for seven
  // years" (their x-height band, grown on every side, read as a line).
  const items = (r: CompareResult) => r.changes.map((c) => `${describeChange('en', c)} | ${c.new.text}`);
  const w = (text: string) => `Text colour or weight changed | ${text}`;
  for (const after of ['probe8-V2V4-bold.pdf', 'probe8-V2V4-bold-06.pdf']) {
    const r = await run('probe8-V2V4-before.pdf', after);
    assert.deepEqual(items(r), [
      w('nominated'),
      'Struck through: “statutory” | statutory',
      w('writing'),
      w("The contract is governed by the laws of the seller's country"),
      w('Spare parts are kept available for seven years after delivery'),
    ]);
  }
  // Lines 3 and 7 bold as a whole, "statutory" (in line 3) and
  // "twenty-four" struck: both strikes are listed, and no false line on
  // the bold words around them ("Underlined: “Late”", "Struck through:
  // “at”" before, and the strike run on to "statutory rate per").
  const s = await run('probe8-V2V4-before.pdf', 'probe8-V2V4-bold-struck.pdf');
  assert.deepEqual(items(s), [
    w('Late payment bears interest at the'),
    'Struck through: “statutory” | statutory',
    w('rate per year'),
    'Struck through: “twenty-four” | twenty-four',
    w("Either party may terminate on ninety days' written notice"),
  ]);
});

test('V2-decorations-N1: a single figure struck along its advance, with the glyph at the same pixels, is listed', { skip }, async () => {
  // "Room 9 is booked …": "9" (Helvetica 10) struck with a 0.6 pt line from
  // its origin to its advance. Before: "No differences found." (the box's
  // last column holds the line's anti-aliased end, 0.4 dark, and every
  // column the glyph leaves light had to turn dark).
  const r = await run('probe8-V2N1-before.pdf', 'probe8-V2N1-nine.pdf');
  assert.deepEqual(list(r.changes), ['Struck through: “9”']);
  // Control: the other figures and a word struck the same way.
  const c = await run('probe8-V2N1-before.pdf', 'probe8-V2N1-figs.pdf');
  assert.deepEqual(list(c.changes), ['Struck through: “4”', 'Struck through: “9”', 'Struck through: “24”', 'Struck through: “for”']);
});
