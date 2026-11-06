// Visual stage, fix round 9, area V2-thin-light-lines (held-out round 5,
// cause 6): thin or light strikes and underlines were judged by luminance,
// and missed or mislabelled. A 0.73 pt #00ff00 underline was missed
// silently (pure green is as light as 41 % grey in luminance), a 0.73 pt red
// strike was listed as "Text colour or weight changed", and a 0.4 pt black
// strike that fpdf2 draws as a filled bar, on a row that re-flowed by a
// fraction of a pixel, was neither listed nor counted.
// Lines through and under words are now measured on each pixel's lowest
// channel (its distance from the paper), a fill's edge reaching into a
// word's box is no line, a fill under the word is taken off its darkness,
// and a line too thin to be found on one word is listed where the word next
// to it has it at the same rows, or else counted in the "compared only in
// part" notice.
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
import { reportNotices } from '../src/core/report.ts';
import { partlyCompared } from '../src/core/visual.ts';
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
const counted = (r: CompareResult) => (r.coverage?.new.partlyCompared ?? []).reduce((n, u) => n + u.count, 0);
const DELETED = 'Deleted “HT-1030 Garden fork, four tines each 6 26.40”';
const ROW = 'Anvil loppers 70 cm, ratchet';

test('V2-thin: a 0.4 pt strike that fpdf2 draws over a re-flowed row is listed (round 5, pricelist #5)', { skip }, async () => {
  // Before: "No differences found" for the row, and no count: the bar adds
  // a third of a line's darkness to the word's rows, below the 0.45 needed.
  const r = await probe('table-before', 'table-strike');
  assert.deepEqual(list(r.changes), [DELETED, `Struck through: “${ROW}”`]);
  assert.equal(counted(r), 0);
  const back = await probe('table-strike', 'table-before');
  assert.deepEqual(lines(back), [`Strikethrough removed: “${ROW}”`]);
  // fpdf2's underline (0.34 pt) on the same row.
  const ul = await probe('table-before', 'table-ul');
  assert.deepEqual(list(ul.changes), [DELETED, `Underlined: “${ROW}”`]);
  // The round-5 case itself: the struck row moved up 35.15 pt.
  const pl = await run(cases + 'holdout5-i-pricelist-gbp/before.pdf', cases + 'holdout5-i-pricelist-gbp/after.pdf');
  assert.deepEqual(lines(pl), [`Struck through: “${ROW}”`]);
});

test('V2-thin: controls — a re-flow alone gives no line and no count; real edits next to a thin strike stay listed', { skip }, async () => {
  const r = await probe('table-before', 'table-reflow');
  assert.deepEqual(list(r.changes), [DELETED]);
  assert.equal(counted(r), 0);
  // A price changed on the struck row and a description on the next row.
  const e = await probe('table-before', 'table-strike-edit');
  assert.deepEqual(list(e.changes), [DELETED, `Struck through: “${ROW}”`, 'Number changed: 39.50 → 41.50 (+5.1%)', 'Number changed: 240 → 260 (+8.3%)']);
  // Unmoved row: found before this change as well.
  const still = await probe('table-before', 'table-strike-still');
  assert.deepEqual(list(still.changes), [`Struck through: “${ROW}”`]);
});

test('V2-thin: a thin strike on a striped row that a re-flow flipped is listed; the stripes alone give no line', { skip }, async () => {
  // Before: "Struck through: “loppers 70”" and "Struck through: “ratchet”"
  // (the new stripe's tint made up the darkness the bar lacks); the stripe
  // is now taken off the words' darkness, and the bar is found as thin.
  const s = await probe('table-stripes-before', 'table-stripes-strike');
  assert.deepEqual(lines(s), [`Struck through: “${ROW}”`]);
  const c = await probe('table-stripes-before', 'table-stripes-reflow');
  assert.deepEqual(lines(c), []);
  // The words counted next to the flipped stripes, as before this change.
  assert.deepEqual(
    partlyCompared(c).flatMap((u) => u.words),
    ['rake', 'spring', 'seven', 'l'],
  );
  assert.deepEqual(partlyCompared(s), partlyCompared(c));
});

test('V2-thin: a thin strike on one word alone is counted as compared in part, with its own wording', { skip }, async () => {
  // A one-word cell struck with the 0.4 pt bar: too little to list on its
  // own. Before: dropped silently.
  const r = await probe('table-one-before', 'table-strike-one');
  assert.deepEqual(list(r.changes), [DELETED]);
  assert.deepEqual(r.coverage?.new.partlyCompared, [{ page: 0, count: 1, words: ['Whetstone'], faint: 1 }]);
  const en = reportNotices('en', r).find((n) => n.text.includes('compared only in part'));
  assert.equal(en?.level, 'warn');
  assert.ok(en?.text.startsWith('New version p. 1: 1 word has a line through or under it too thin or too light to tell from the glyphs'), en?.text);
  assert.ok(reportNotices('zh', r).some((n) => n.text.includes('太细或太浅')));
});

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
  // each. Before: "No differences found." (Grey there: see below.)
  const one = await probe('text-before', 'text-midtone-one');
  assert.deepEqual(lines(one), ['Struck through: “audited”', 'Struck through: “twelve”']);
  // The round-5 case: the same lines as PyMuPDF annotations, and a yellow
  // highlight. Since V3-markup-annotations, read as annotations and listed
  // once each (see visual9-markup.test.ts), not found again in the pixels.
  const a = await run(cases + 'holdout5-j-audit-annotations/before.pdf', cases + 'holdout5-j-audit-annotations/after.pdf');
  assert.deepEqual(lines(a), []);
  assert.deepEqual(
    a.changes.filter((c) => c.format?.markup).map((c) => describeChange('en', c)),
    ['Highlighted (annotation): “Calibration records for two tor…”', 'Struck through (annotation): “The finding is considered minor.”', 'Underlined (annotation): “within 30 days of receiving thi…”'],
  );
  assert.deepEqual(a.changes.filter((c) => describeChange('en', c) === 'Text colour or weight changed'), []);
});

test('V2-thin: controls — a highlight’s edge or the strip where its quads overlap is no line', { skip }, async () => {
  // Round-4 case: a yellow highlight annotation (multiply) over three
  // lines, its quads overlapping in a darker strip under the second line:
  // one item, no underline. (A colour item before V3-markup-annotations,
  // now the highlight read as an annotation.)
  const h = await run(cases + 'holdout4-g-annotated-agreement/before.pdf', cases + 'holdout4-g-annotated-agreement/after.pdf');
  assert.deepEqual(lines(h), []);
  assert.deepEqual(list(h.changes).filter((d) => d === 'Text colour or weight changed' || d.startsWith('Highlighted')), ['Highlighted (annotation): “The Supplier’s total liability …”']);
});

test('V2-thin: a grey strike over black text is found where it crosses several words, and counted on one word', { skip }, async () => {
  // Grey (#808080) at 0.8 pt over "two torque wrenches": it adds little
  // darkness, as it lightens the glyphs it crosses. Where the glyphs give
  // the very same pixels in both versions, it is told by its distance from
  // their colour. Before: "No differences found." for that phrase.
  const m = await probe('text-before', 'text-midtone');
  assert.deepEqual(list(m.changes), [
    'Struck through: “goods receipt”',
    'Struck through: “customer complaints”',
    'Struck through: “two torque wrenches”',
    'Struck through: “found within tolerance”',
  ]);
  // On one word, at 0.8 and 1.5 pt: counted. Before: dropped silently.
  const one = await probe('text-before', 'text-midtone-one');
  assert.deepEqual(partlyCompared(one), [{ page: 0, words: ['interviewed', 'humidity'], faint: 2 }]);
});

test('V2-thin: controls on the evaluation set — a re-flow alone and a table rule that a wrapped cell moved give no line and no count', { skip }, async () => {
  // Every line break and page break moves: words set again in justified
  // lines, their boxes a few pixels apart against their glyphs.
  const r = await run(cases + 'reflow-only/before.pdf', cases + 'reflow-only/after.pdf');
  assert.deepEqual(lines(r), []);
  assert.deepEqual(partlyCompared(r), []);
  // A cell of a table row wraps onto two lines: the row's bottom rule
  // reaches into the words' boxes in one version. It runs on past the
  // text, so it is no line of theirs, nor counted.
  const t = await run(cases + 'holdout4-e-docx-retention-redline/before.pdf', cases + 'holdout4-e-docx-retention-redline/after.pdf');
  assert.deepEqual(partlyCompared(t), []);
  assert.deepEqual(lines(t), ['Struck through: “Paper records may be scanned an…”']);
});
