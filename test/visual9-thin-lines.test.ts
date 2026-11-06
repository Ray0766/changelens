// Visual stage, fix round 9, area V2-thin-light-lines (held-out round 5,
// cause 6): thin or light strikes and underlines were judged by luminance,
// and missed or mislabelled. A 0.73 pt #00ff00 underline was missed
// silently (pure green is as light as 41 % grey in luminance), a 0.73 pt red
// strike was listed as "Text colour or weight changed", and a 0.4 pt black
// strike that fpdf2 draws as a filled bar, on a row that re-flowed by a
// fraction of a pixel, was neither listed nor counted.
// Lines through and under words are now measured on each pixel's lowest
// channel (its distance from the paper), and a fill's edge reaching into a
// word's box is no line.
// Fixtures test/fixtures/probe9-V2-thin-*.pdf are SYNTHETIC (fpdf2 2.9, as
// the round-5 cases; lines drawn as page content with PyMuPDF 2.1), made by
// test/fixtures/gen9/v2-thin-lines.py. "table" is a price list in DejaVu
// Sans 7.8 pt; its "after" versions delete the row HT-1030, so every later
// row moves up 17.6 pt (26.4 px at 1.5 px/pt). "text" is an audit note in
// Liberation Sans 10 pt.
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
const probe = (a: string, b: string) => run(fixtures + `probe9-V2-thin-${a}.pdf`, fixtures + `probe9-V2-thin-${b}.pdf`);
const list = (cs: Change[]) => cs.map((c) => describeChange('en', c));
const lines = (r: CompareResult) => list(r.changes.filter((c) => c.format?.decoration));

test('V2-thin: light and mid-tone lines drawn over black text are found (round 5, audit #4 and #6)', { skip }, async () => {
  // A 0.73 pt #00ff00 underline over two lines. Before: "Text colour or
  // weight changed" on part of it.
  const g = await probe('text-before', 'text-green-ul');
  assert.deepEqual(list(g.changes), ['Underlined: “within 30 days of receiving thi…”']);
  // A 0.73 pt red strike over two lines. Before: "Text colour or weight changed".
  const red = await probe('text-before', 'text-red-strike');
  assert.deepEqual(list(red.changes), ['Struck through: “The finding is considered minor”']);
  // Pure yellow at 0.8 pt (a strike) and a light orange at 0.73 pt (an
  // underline). Before: "No differences found."
  const y = await probe('text-before', 'text-yellow');
  assert.deepEqual(list(y.changes), ['Struck through: “storage of finished parts”', 'Underlined: “target date”']);
  // Mid-blue (#2050c0) and green (#008000) strikes at 0.8 pt on one word
  // each. Before: "No differences found."

  const one = await probe('text-before', 'text-midtone-one');
  assert.deepEqual(lines(one), ['Struck through: “audited”', 'Struck through: “twelve”']);
  // The round-5 case: the same lines as PyMuPDF annotations, and a yellow
  // highlight, a colour item as before.
  const a = await run(cases + 'holdout5-j-audit-annotations/before.pdf', cases + 'holdout5-j-audit-annotations/after.pdf');
  assert.deepEqual(lines(a), ['Struck through: “The finding is considered minor”', 'Underlined: “within 30 days of receiving thi…”']);
  assert.deepEqual(a.changes.filter((c) => describeChange('en', c) === 'Text colour or weight changed').map((c) => c.new.text), ['Calibration records for two torque wrenches were missing']);
});

test('V2-thin: controls — a highlight’s edge or the strip where its quads overlap is no line', { skip }, async () => {
  // Round-4 case: a yellow highlight annotation (multiply) over three
  // lines, its quads overlapping in a darker strip under the second line:
  // one colour item, no underline.
  const h = await run(cases + 'holdout4-g-annotated-agreement/before.pdf', cases + 'holdout4-g-annotated-agreement/after.pdf');
  assert.deepEqual(lines(h), []);
  assert.equal(list(h.changes).filter((d) => d === 'Text colour or weight changed').length, 1);
});
