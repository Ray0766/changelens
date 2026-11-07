// Visual stage, fix round 9, area V3-markup-annotations, second pass: what
// an independent check of the first pass found. Real edits of the page
// content under or beside an annotation that came with them were hidden
// with the annotation's own mark, or described as the annotation; and some
// annotations gave items where nothing else changed.
// Fixtures test/fixtures/probe9-V3-markup-*.pdf are SYNTHETIC: the page
// content of probe9-V3-markup-before.pdf by fpdf2 2.9 (see
// gen9/v3-markup.py), content edits and annotations by PyMuPDF 2.1 (see
// gen9/v3-markup-refix.py).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openPdf } from '../src/node/pdf.ts';
import { renderPage, canRender } from '../src/node/render.ts';
import { extractText, pageAnnotations, type AnnotationData } from '../src/pdf/extract.ts';
import { buildDocModel } from '../src/core/tokenize.ts';
import { compareDocs } from '../src/core/compare.ts';
import { addVisualChanges } from '../src/core/pipeline.ts';
import { describeChange } from '../src/core/describe.ts';
import { reportNotices } from '../src/core/report.ts';
import type { CompareResult, DiffOptions } from '../src/core/types.ts';

const fixtures = new URL('./fixtures/', import.meta.url).pathname;
const skip = !(await canRender()) && 'no canvas';

async function run(before: string, after: string, options: Partial<DiffOptions> = {}): Promise<CompareResult> {
  const pa = await openPdf(before);
  const pb = await openPdf(after);
  const r = compareDocs(buildDocModel(await extractText(pa, 'old')), buildDocModel(await extractText(pb, 'new')), options);
  await addVisualChanges(r, (p) => renderPage(pa, p, 1.5), (p) => renderPage(pb, p, 1.5));
  return r;
}
const probe = (a: string, b: string, options: Partial<DiffOptions> = {}) => run(fixtures + `probe9-V3-markup-${a}.pdf`, fixtures + `probe9-V3-markup-${b}.pdf`, options);
const list = (r: CompareResult) => r.changes.map((c) => describeChange('en', c));
/** The words that items other than the annotations' list, in order. */
const others = (r: CompareResult) =>
  r.changes
    .filter((c) => !c.format?.markup)
    .map((c) => c.new.text)
    .join(' ');

const HL = 'Highlighted (annotation): “Calibration records for two tor…”';
const SO = 'Struck through (annotation): “The finding is considered minor”';

test('V3-markup refix N1/N2: an underline of the page’s own under a new highlight or strike-out annotation stays listed', { skip }, async () => {
  // Controls: the underline alone; the annotations alone.
  assert.deepEqual(list(await probe('before', 'ulc')), ['Underlined: “Calibration records for two tor…”']);
  assert.deepEqual(list(await probe('before', 'hl')), [HL]);
  assert.deepEqual(list(await probe('before', 'strike')), [SO]);
  // N1. Before: "Underlined: “for”" was taken for the edge of the highlight
  // (any line within 1.5 pt of its quadrilateral's bottom) and dropped. The
  // underline is black, darker than the tint: it stays, with every word.
  const hl = await probe('before', 'ulc-hl');
  assert.ok(list(hl).includes(HL));
  assert.equal(others(hl), 'Calibration records for two torque wrenches were missing');
  assert.ok(list(hl).includes('Underlined: “for”'));
  // N2. Before: only the strike-out. The rows of the black underline were
  // left out as the strike-out's line (any differing row from 15 % to 140 %
  // of its quadrilateral), and on "The" and "finding", where the pixels
  // found the strike-out's line, the underline was dropped with it.
  const so = await probe('before', 'ulc-so');
  assert.ok(list(so).includes(SO));
  assert.equal(others(so), 'The finding is considered minor');
  assert.ok(so.changes.filter((c) => !c.format?.markup).every((c) => describeChange('en', c) === 'Text colour or weight changed'));
});

test('V3-markup refix N4: a graphic under a new highlight is dropped on both sides alike, and only where the highlight draws all that differs', { skip }, async () => {
  // Control: the dot recoloured, red → green, without an annotation.
  assert.deepEqual(list(await probe('dot-red', 'dot-green')), ['Graphic or image changed']);
  // An area highlight over the line and the unchanged dot. Before: a
  // "Graphic or image changed" (and, as the dot region was dropped on the
  // highlighted side only, "removed" where it lay apart) for the dot's
  // pixels under the tint. They are the old ones multiplied by it: nothing.
  const same = await probe('dot-red', 'dot-red-hl');
  assert.deepEqual(list(same), ['Highlighted (annotation): “Calibration records for two tor…”']);
  // The dot recoloured under the highlight: its pixels are not the tint
  // over the old ones. Listed, with its place on both pages.
  const recoloured = await probe('dot-red', 'dot-green-hl');
  assert.deepEqual(list(recoloured), ['Graphic or image changed', 'Highlighted (annotation): “Calibration records for two tor…”']);
  assert.ok(recoloured.changes[0].old.rects.length > 0 && recoloured.changes[0].new.rects.length > 0);
});

test('V3-markup refix N3: a stamp is named alone only where the change lies within it; an added one reads "added"', { skip }, async () => {
  // Control: the logo recoloured, blue → red.
  assert.deepEqual(list(await probe('logo-blue', 'logo-red')), ['Graphic or image changed']);
  // A stamp added over the logo that is the same: the change lies within
  // the stamp's box, but what it covers of the logo differs as well, which
  // cannot be told from a change under it. Before: "Stamp changed".
  const over = await probe('logo-blue', 'logo-blue-stamp');
  assert.deepEqual(list(over), ['Graphic or image changed — Stamp added (annotation): “FOR COMMENT”']);
  assert.equal(describeChange('zh', over.changes[0]), '图形或图片有变化，其中新增图章（批注）：「FOR COMMENT」');
  // The logo recoloured under it: the change reaches out of the stamp's
  // box. Before: "Stamp changed (annotation): “FOR COMMENT”".
  assert.deepEqual(list(await probe('logo-blue', 'logo-red-stamp')), ['Graphic or image changed — Stamp added (annotation): “FOR COMMENT”']);
  // A stamp 10 pt beside the recoloured logo, in one region with it.
  // Before: "Stamp changed (annotation): “APPROVED”".
  assert.deepEqual(list(await probe('logo-blue', 'logo-red-near')), ['Graphic or image changed — Stamp added (annotation): “APPROVED”']);
  // A stamp on blank paper, and a note whose text changed in place: the
  // note alone, as before.
  assert.deepEqual(list(await probe('before', 'comment')), ['Stamp added (annotation): “APPROVED”', 'Comment added (annotation): “Ask for the calibration certificates. SYNTHETIC”', HL]);
  assert.deepEqual(list(await probe('note-before', 'note-changed')), ['Note changed (annotation): “Draft for internal review, SYNTHETIC” → “Reviewed 2 Nov 2026: plan accepted, SYN…”']);
  // Removed: from the version that has it.
  assert.deepEqual(list(await probe('comment', 'hl')), ['Stamp removed (annotation): “APPROVED”', 'Comment removed (annotation): “Ask for the calibration certificates. SYNTHETIC”']);
});

test('V3-markup refix N6: quadrilaterals off the page or far larger than it are not read as marks', () => {
  const vt = [1, 0, 0, -1, 0, 842];
  const page = { width: 595, height: 842 };
  const word = { subtype: 'StrikeOut', annotationFlags: 4, rect: [50, 700, 100, 712], quadPoints: [50, 712, 100, 712, 50, 700, 100, 700], color: [255, 0, 0] };
  const bad: AnnotationData[] = [
    // ±1e30 (pypdf, no appearance): PDF.js draws the line out of sight.
    { subtype: 'StrikeOut', annotationFlags: 4, rect: [-1e30, -1e30, 1e30, 1e30], quadPoints: [-1e30, 1e30, 1e30, 1e30, -1e30, -1e30, 1e30, -1e30], color: [255, 0, 0] },
    // Off the page.
    { subtype: 'Highlight', annotationFlags: 4, rect: [5000, 5000, 5100, 5010], quadPoints: [5000, 5010, 5100, 5010, 5000, 5000, 5100, 5000], color: [255, 255, 0] },
  ];
  const a = pageAnnotations([...bad, word], vt, page)!;
  assert.deepEqual(a.counts, { StrikeOut: 2, Highlight: 1 });
  assert.deepEqual(
    a.markup.map((m) => m.quads),
    [[{ x: 50, y: 130, w: 50, h: 12 }]],
  );
  // Before: every word of the page "Struck through (annotation)".
  assert.equal(pageAnnotations(bad, vt, page)!.markup.length, 0);
});

test('V3-markup refix N7: identical annotated files are compared in full; a changed pop-up text still warns', { skip }, async () => {
  // Before: two warnings, so "not everything was compared" (exit 3 with
  // --fail-on-change) for a file compared with itself.
  const same = await probe('comment', 'comment');
  assert.deepEqual(list(same), []);
  assert.deepEqual(
    reportNotices('en', same).map((n) => n.level),
    ['info', 'info'],
  );
  // Control: only the comment's pop-up text changed, which is not compared
  // (no item): the warnings stay.
  const popup = await probe('comment', 'comment-b');
  assert.deepEqual(list(popup), []);
  assert.deepEqual(
    reportNotices('en', popup).map((n) => n.level),
    ['warn', 'warn'],
  );
});

test('V3-markup refix N5: marks flattened into the page content are not listed as removed', { skip }, async () => {
  // Before: "Highlight removed (annotation)", the mark still on the page.
  const baked = await probe('hl', 'hl-baked');
  assert.deepEqual(list(baked), []);
  // Control: the highlight removed, and not drawn.
  assert.deepEqual(list(await probe('hl', 'before')), ['Highlight removed (annotation): “Calibration records for two tor…”']);
});

test('V3-markup refix N8: a see-through highlight (normal blend, 40 %) is listed once; a recolour under it stays', { skip }, async () => {
  // Before: "Text colour or weight changed" as well.
  assert.deepEqual(list(await probe('before', 'hl-normal')), [HL]);
  assert.deepEqual(list(await probe('hl-normal', 'hl-normal-pink')), ['Highlight colour changed (annotation): “Calibration records for two tor…”']);
  // Control: the phrase printed in red under it.
  assert.deepEqual(list(await probe('red-before', 'red-hl-normal')), ['Text colour or weight changed', HL]);
});
