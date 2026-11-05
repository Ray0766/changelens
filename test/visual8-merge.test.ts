// Visual stage, fix round 8: rules of the two visual streams that meet in
// one word after their merge (overlays and colour; strikes, underlines and
// weight). Each probe asserts what the reviewer must see, next to its
// control. Fixtures test/fixtures/probe8-M2-* are copies of the SYNTHETIC
// counter-probes of the round-8 overlay verifiers (Chromium via Playwright).
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
const lines = (r: CompareResult) => list(r.changes.filter((c) => c.format?.decoration));
/** The words of the colour or weight items (new side). */
const recoloured = (r: CompareResult) => r.changes.filter((c) => c.format?.appearanceChanged && !c.format.decoration).map((c) => c.new.text ?? '');
const show = (r: CompareResult) => list(r.changes).join(' | ');

test('M2: under a stamp or a watermark, a recoloured word or the overlay\'s hue does not turn the glyph edges into a line', { skip }, async () => {
  // Chromium invoice: a red PAID and a blue RECEIVED stamp (both
  // translucent) added over the same rows, and the figures “2”, “14” and
  // “95.00” turned #c00000. After the merge: 'Struck through: “14”' along
  // the bar of the 4, from the line test measuring each version in units
  // of its own ink (a recolour) while the stamps darken the red glyphs'
  // edges in the new version only.
  const hue = await run('probe8-M2-hue-before.pdf', 'probe8-M2-hue-twin2-red.pdf');
  assert.deepEqual(lines(hue), [], show(hue));
  // The real edits stay listed: the figures beside the stamps' letters.
  const words = recoloured(hue);
  assert.ok(words.includes('2') && words.includes('95.00'), show(hue));
  // Chromium notice under a DRAFT watermark that turned red at half
  // opacity, nothing else edited (control), and the same with three words
  // recoloured. After the merge: 'Underline removed: “by”' in both, from
  // the same scaling in the retry outside the moved watermark's letters,
  // whose red the hue test took for a recolour of the black word.
  const ctrl = await run('probe8-V3V1-wm-draft.pdf', 'probe8-M2-wm50-ctrl.pdf');
  assert.deepEqual(lines(ctrl), [], show(ctrl));
  const edits = await run('probe8-V3V1-wm-draft.pdf', 'probe8-M2-wm50-edits.pdf');
  assert.deepEqual(lines(edits), [], show(edits));
  assert.ok(recoloured(edits).length > recoloured(ctrl).length, show(edits));
});

test('M3: a word made bold at the same pixels in a row that was given a fill is listed, one word too', { skip }, async () => {
  // reportlab status list: four “Accepted” (9–12 pt) drawn faux bold (text
  // render mode 2, 0.5 pt stroke), each in a row that gets a yellow or a
  // light blue fill. Without the fill, the same edit gives four weight
  // items (see heavier). Before: none under the fill; the ink grows by
  // about a third, but each word stands alone on its row, and a weight
  // change needs a neighbour changed alike, or the test for glyphs drawn
  // heavier, which ran only where no overlay lay on the word.
  for (const after of ['probe8-M3-fill-bold.pdf', 'probe8-M3-fillblue-bold.pdf']) {
    const r = await run('probe8-M3-before.pdf', after);
    assert.deepEqual(recoloured(r), ['Accepted', 'Accepted', 'Accepted', 'Accepted'], `${after}: ${show(r)}`);
    assert.deepEqual(lines(r), [], `${after}: ${show(r)}`);
  }
  // Control: the fills alone change no word.
  const fill = await run('probe8-M3-before.pdf', 'probe8-M3-fill.pdf');
  assert.deepEqual(list(fill.changes), ['Graphic or image changed'], show(fill));
});
