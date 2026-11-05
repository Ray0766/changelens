// Visual stage, fix round 8, fourth pass: what the verifier of the third
// pass found (V-leftovers-V*). Fixtures test/fixtures/probe8-VL-V*-*.pdf are
// copies of the verifier's SYNTHETIC counter-probes (reportlab, Chromium) and
// of the fixer's (reportlab, probe8-VL-V1-k-*).
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
/** Strike and underline items. */
const lines = (r: CompareResult) => list(r.changes.filter((c) => c.format?.decoration));
const struck = (...words: string[]) => words.map((w) => `Struck through: “${w}”`);

test('V-leftovers-V1: a sloped strike is listed when a separate mark is added next to or above the word', { skip }, async () => {
  const added = (r: CompareResult) => list(r.changes).filter((d) => d === 'Graphic or image added').length;
  // reportlab: a 0.8 pt strike rising 1.5 pt over the last word of three
  // lines, and a red 5 pt square 4 pt after each word. Before: only the
  // three squares.
  const tick = await run('probe8-VL-V1-before.pdf', 'probe8-VL-V1-tick.pdf');
  assert.deepEqual(lines(tick), struck('agrees', 'tenant', 'order'));
  assert.equal(added(tick), 3);
  // The square 6 pt above the struck word.
  const above = await run('probe8-VL-V1-h3-before.pdf', 'probe8-VL-V1-h3-above.pdf');
  assert.deepEqual(lines(above), struck('agrees', 'tenant', 'order'));
  assert.equal(added(above), 3);
  // A black square 2 pt after the strike's end ("agrees"), and one above
  // "landlord". Before: the strike through "agrees" was missing.
  const black = await run('probe8-VL-V1-k-before.pdf', 'probe8-VL-V1-k-black.pdf');
  assert.deepEqual(lines(black), struck('agrees', 'landlord'));
  // Control: a stamp's border drawn across words, whose stroke goes on out
  // of each word's box into the stamp, is still no line (see R7-V01 in
  // visual8-decorations.test.ts).
  const stamp = await run('probe8-R7-V01-before.pdf', 'probe8-R7-V01-after.pdf');
  assert.deepEqual(lines(stamp), []);
});

test('V-leftovers-V3: an underline drawn on past its line above a rule both versions keep is an underline', { skip }, async () => {
  const underlined = (r: CompareResult) => list(r.changes).filter((d) => d.startsWith('Underlined'));
  // reportlab letter: a grey separator rule 6 pt under "Tenant: Adaeze
  // Okafor" in both versions; the new one underlines the line and draws the
  // underline 60 pt past its end. Before: only "Graphic or image changed"
  // for the tail, with a piece of the kept rule as its old place.
  const sep = await run('probe8-VL-V3-sep6-before.pdf', 'probe8-VL-V3-sep6-name-ul60.pdf');
  assert.deepEqual(underlined(sep), ['Underlined: “Tenant: Adaeze Okafor”']);
  // Controls: a table rule and a band's lower edge that moved against the
  // re-flowed text (by 11.7 pt in Writer, by 0.7 pt under a navy header in
  // Chromium) are no underlines (see R5-12, R5-V02 in visual8-appearance).
  const writer = await run('probe8-R5-12-before.pdf', 'probe8-R5-12-reflow.pdf');
  assert.deepEqual(underlined(writer), []);
  const navy = await run('probe8-R5-V02-before.pdf', 'probe8-R5-V02-two-notes.pdf');
  assert.deepEqual(list(navy.changes), ['Added 2 paragraphs']);
});
