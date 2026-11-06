// Visual stage, fix round 9, area V3-markup-annotations (held-out round 5,
// holdout5-j-audit-annotations): PDF annotations were compared only as the
// pixels PDF.js draws. A yellow Highlight and a red StrikeOut were listed as
// "Text colour or weight changed", and a green Underline over two lines was
// missed (fix round 9 found it in the pixels as "Underlined").
// Text-markup annotations (StrikeOut, Underline, Squiggly, Highlight) are now
// read from the PDF and listed on the words they cover, "(annotation)", when
// one came, went or changed colour; what they draw is not listed again from
// the pixels where the glyphs outside their ink are the same in both
// versions.
// Fixtures test/fixtures/probe9-V3-markup-*.pdf are SYNTHETIC (page content
// by fpdf2 2.9, annotations by PyMuPDF 2.1, as the round-5 case), made by
// test/fixtures/gen9/v3-markup.py: a two-page audit note in Liberation Sans
// 10.5 pt with a running header and footer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openPdf } from '../src/node/pdf.ts';
import { renderPage, canRender } from '../src/node/render.ts';
import { extractText, pageAnnotations, MAX_MARKUP, type AnnotationData } from '../src/pdf/extract.ts';
import { buildDocModel } from '../src/core/tokenize.ts';
import { compareDocs } from '../src/core/compare.ts';
import { addVisualChanges } from '../src/core/pipeline.ts';
import { describeChange, notices } from '../src/core/describe.ts';
import { reportNotices } from '../src/core/report.ts';
import type { Change, CompareResult, DiffOptions } from '../src/core/types.ts';

const fixtures = new URL('./fixtures/', import.meta.url).pathname;
const cases = new URL('../eval/cases/', import.meta.url).pathname;
const skip = !(await canRender()) && 'no canvas';

async function run(before: string, after: string, options: Partial<DiffOptions> = {}, visual = true): Promise<CompareResult> {
  const pa = await openPdf(before);
  const pb = await openPdf(after);
  const r = compareDocs(buildDocModel(await extractText(pa, 'old')), buildDocModel(await extractText(pb, 'new')), options);
  if (visual) await addVisualChanges(r, (p) => renderPage(pa, p, 1.5), (p) => renderPage(pb, p, 1.5));
  return r;
}
const probe = (a: string, b: string, options: Partial<DiffOptions> = {}) => run(fixtures + `probe9-V3-markup-${a}.pdf`, fixtures + `probe9-V3-markup-${b}.pdf`, options);
const list = (r: CompareResult) => r.changes.map((c) => describeChange('en', c));
const counted = (r: CompareResult) => (r.coverage?.new.partlyCompared ?? []).reduce((n, u) => n + u.count, 0);
const at = (c: Change, side: 'old' | 'new') => c[side].rects.map((q) => [q.page + 1, Math.round(q.rect.x), Math.round(q.rect.y)]);

const HL = 'Highlighted (annotation): “Calibration records for two tor…”';
const SO = 'Struck through (annotation): “The finding is considered minor”';
const UL = 'Underlined (annotation): “within 30 days of receiving thi…”';

test('V3-markup: a highlight, a strike-out, an underline and a squiggly annotation are listed once, on the words they cover (round 5, audit #3, #4, #6)', { skip }, async () => {
  // Before: "Text colour or weight changed"; "Struck through: …" and
  // "Underlined: …" found in the pixels, not named as annotations; the
  // squiggly line as "Underlined".
  const hl = await probe('before', 'hl');
  assert.deepEqual(list(hl), [HL]);
  const c = hl.changes[0];
  assert.equal(c.new.text, 'Calibration records for two torque wrenches were missing');
  assert.deepEqual(c.format?.markup, { kind: 'highlight', change: 'added' });
  // On the words in both versions.
  assert.deepEqual(at(c, 'old'), [[1, 59, 149]]);
  assert.deepEqual(at(c, 'new'), [[1, 59, 149]]);
  assert.equal(c.kind, 'graphic');
  const so = await probe('before', 'strike');
  assert.deepEqual(list(so), [SO]);
  assert.deepEqual(at(so.changes[0], 'new'), [
    [1, 370, 243],
    [1, 59, 258],
  ]);
  const ul = await probe('before', 'ul');
  assert.deepEqual(list(ul), [UL]);
  assert.deepEqual(at(ul.changes[0], 'new'), [
    [2, 294, 95],
    [2, 59, 110],
  ]);
  const sq = await probe('before', 'squiggly');
  assert.deepEqual(list(sq), ['Underlined with a wavy line (annotation): “evidence of closure must be sen…”']);
  // In Chinese too.
  assert.equal(describeChange('zh', hl.changes[0]), '加了高亮（批注）：「Calibration records for two tor…」');
  assert.equal(describeChange('zh', so.changes[0]), '加了删除线（批注）：「The finding is considered minor」');
  for (const r of [hl, so, ul, sq]) assert.equal(counted(r), 0);
});

test('V3-markup: an annotation removed or recoloured is listed as such', { skip }, async () => {
  assert.deepEqual(list(await probe('hl', 'before')), ['Highlight removed (annotation): “Calibration records for two tor…”']);
  assert.deepEqual(list(await probe('strike', 'before')), ['Strike-out removed (annotation): “The finding is considered minor”']);
  assert.deepEqual(list(await probe('ul', 'before')), ['Underline removed (annotation): “within 30 days of receiving thi…”']);
  assert.deepEqual(list(await probe('hl', 'hl-green')), ['Highlight colour changed (annotation): “Calibration records for two tor…”']);
  // The same annotations in both versions: nothing.
  assert.deepEqual(list(await probe('hl', 'hl')), []);
});

test('V3-markup: annotations without an appearance stream, hidden ones, quadrilaterals in another order, turned pages', { skip }, async () => {
  // PDF.js draws a markup annotation without /AP from its QuadPoints and colour.
  assert.deepEqual(list(await probe('before', 'noap')), [HL, SO, UL]);
  // Flagged Hidden or NoView: not drawn, not listed, not counted.
  const hidden = await probe('before', 'hidden');
  assert.deepEqual(list(hidden), []);
  assert.deepEqual(notices('en', hidden), []);
  assert.deepEqual(list(await probe('before', 'quads-turned')), [HL, UL]);
  // Both versions turned by /Rotate 90: the words run down the page.
  const rot = await probe('rot90', 'rot90-hl');
  assert.deepEqual(list(rot), [HL]);
  assert.deepEqual(at(rot.changes[0], 'new'), [[1, 681, 59]]);
  // Only the new version turned: the pair is compared turned back.
  const turned = await probe('before', 'rot90-hl');
  assert.deepEqual(list(turned), ['Page size changed: 595 × 842 pt → 842 × 595 pt (in 2 places)', HL]);
  assert.deepEqual(at(turned.changes[1], 'old'), [[1, 59, 149]]);
  assert.deepEqual(at(turned.changes[1], 'new'), [[1, 681, 59]]);
});

test('V3-markup: controls — a real edit under or next to an annotation stays listed', { skip }, async () => {
  // The highlighted phrase also printed in red: the colour change is the
  // page's own, and listed beside the highlight.
  assert.deepEqual(list(await probe('red-before', 'red-hl')), ['Text colour or weight changed', HL]);
  assert.deepEqual(list(await probe('red-before', 'red-hl-only')), [HL]);
  // A red strike drawn in the page content over the words right after the
  // struck sentence, at its height: the pixels found one line over both;
  // the words the annotation covers are its item, the others a strike of
  // their own.
  assert.deepEqual(list(await probe('before', 'strike-next')), [SO, 'Struck through: “Finding F3 concerns”']);
  // A figure changed inside the highlighted phrase.
  assert.deepEqual(list(await probe('before', 'number-after')), ['Highlighted (annotation): “within 45 days of receiving thi…”', 'Number changed: 30 → 45 (+50%)']);
});

test('V3-markup: a grey underline annotation too faint for the pixels on one word is not counted there; a faint strike of the page’s own still is', { skip }, async () => {
  // Before: "Underlined: “within 30 days of receiving this”" and "report"
  // counted as compared in part, for the annotation's own line.
  const g = await probe('before', 'ul-grey');
  assert.deepEqual(list(g), [UL]);
  assert.equal(counted(g), 0);
  assert.ok(!reportNotices('en', g).some((n) => n.level === 'warn'));
  // A thin grey strike drawn in the page content over "this": still counted.
  const s = await probe('before', 'ul-grey-strike');
  assert.deepEqual(list(s), [UL]);
  assert.deepEqual(s.coverage?.new.partlyCompared, [{ page: 1, count: 1, words: ['this'], faint: 1 }]);
});

test('V3-markup: marks on the running header are counted with the header differences, or listed with --include-furniture', { skip }, async () => {
  const r = await probe('before', 'header');
  assert.deepEqual(list(r), []);
  assert.equal(r.ignored.furniture, 2);
  const all = await probe('before', 'header', { ignoreFurniture: false });
  assert.deepEqual(list(all), ['Highlighted (annotation): “Supplier audit note SQA-2026-031”', 'Struck through (annotation): “(SYNTHETIC)”']);
});

test('V3-markup: a highlight on every word (188) is read within the bound and listed by paragraph', { skip }, async () => {
  const t0 = performance.now();
  const r = await probe('before', 'many');
  assert.ok(performance.now() - t0 < 30000);
  assert.equal(r.changes.length, 9);
  assert.ok(r.changes.every((c) => c.format?.markup?.kind === 'highlight'));
  // On the header and footer: counted, not listed.
  assert.equal(r.ignored.furniture, 4);
});

test('V3-markup: the annotations a page shows are read with their kind, quadrilaterals, colour and text (round 5 case)', async () => {
  const d = await extractText(await openPdf(cases + 'holdout5-j-audit-annotations/after.pdf'), 'new');
  const [p1, p2] = d.pages.map((p) => p.annotations!);
  assert.deepEqual(p1.counts, { Stamp: 1, Highlight: 1, StrikeOut: 1, FreeText: 1 });
  assert.deepEqual(p2.counts, { Underline: 1, Ink: 1 });
  const round = (r: { x: number; y: number; w: number; h: number }) => [r.x, r.y, r.w, r.h].map((v) => Math.round(v));
  assert.deepEqual(
    p1.markup.map((m) => [m.kind, m.colour, m.quads.map(round)]),
    [
      ['highlight', [255, 255, 0], [[59, 249, 281, 12]]],
      [
        'strike',
        [255, 0, 0],
        [
          [362, 455, 18, 12],
          [383, 455, 34, 12],
          [420, 455, 11, 12],
          [59, 470, 83, 12],
        ],
      ],
    ],
  );
  assert.deepEqual(p2.markup.map((m) => [m.kind, m.colour]), [['underline', [0, 255, 0]]]);
  // The stamp's text as its appearance draws it; the note's.
  assert.deepEqual(
    p1.notes.map((n) => [n.kind, n.text, round(n.rect)]),
    [
      ['stamp', 'FOR COMMENT', [400, 54, 140, 37]],
      ['freetext', 'Reviewer: grade F1 as major? The records were missing for three weeks.', [441, 328, 140, 69]],
    ],
  );
  assert.equal(p1.withText, 2);
  assert.equal(p2.withText, 0);
  // None in the version without annotations.
  const b = await extractText(await openPdf(cases + 'holdout5-j-audit-annotations/before.pdf'), 'old');
  assert.ok(b.pages.every((p) => !p.annotations));
});

test('V3-markup: at most MAX_MARKUP markup annotations are read per page; the rest are counted', () => {
  const vt = [1, 0, 0, -1, 0, 842];
  const many: AnnotationData[] = Array.from({ length: MAX_MARKUP + 200 }, (_, k) => ({
    subtype: 'Highlight',
    annotationFlags: 4,
    rect: [50, 700 - (k % 50), 100, 712 - (k % 50)],
    quadPoints: [50, 712, 100, 712, 50, 700, 100, 700],
    color: [255, 255, 0],
  }));
  const a = pageAnnotations(many, vt)!;
  assert.equal(a.markup.length, MAX_MARKUP);
  assert.equal(a.unread, 200);
  assert.equal(a.counts.Highlight, MAX_MARKUP + 200);
  // Widgets, links and pop-ups are not counted; hidden ones and those
  // without usable quadrilaterals are not read as markup.
  const b = pageAnnotations(
    [
      { subtype: 'Widget', rect: [0, 0, 10, 10] },
      { subtype: 'Link', rect: [0, 0, 10, 10] },
      { subtype: 'Popup', rect: [0, 0, 10, 10] },
      { subtype: 'StrikeOut', annotationFlags: 2, rect: [0, 0, 10, 10], quadPoints: [0, 10, 10, 10, 0, 0, 10, 0] },
      { subtype: 'Underline', rect: [0, 0, 10, 10], quadPoints: [0, 10, 10, 10, 0] },
      // Corners in any order give the same box.
      { subtype: 'Squiggly', rect: [0, 0, 10, 10], quadPoints: [10, 0, 0, 10, 10, 10, 0, 0], color: null },
    ],
    vt,
  )!;
  assert.deepEqual(b.counts, { Underline: 1, Squiggly: 1 });
  assert.deepEqual(b.markup, [{ kind: 'squiggly', quads: [{ x: 0, y: 832, w: 10, h: 10 }], colour: null, rect: { x: 0, y: 832, w: 10, h: 10 } }]);
  assert.equal(pageAnnotations([{ subtype: 'Link', rect: [0, 0, 1, 1] }], vt), null);
});
