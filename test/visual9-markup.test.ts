// Extraction, fix round 9, area V3-markup-annotations (held-out round 5,
// holdout5-j-audit-annotations): PDF annotations were compared only as the
// pixels PDF.js draws; nothing read them. The annotations a page shows,
// other than form fields' widgets, links and pop-ups, are now read from
// page.getAnnotations(): counted by subtype, text markup (StrikeOut,
// Underline, Squiggly, Highlight) with its quadrilaterals and colour, and
// stamps, free-text notes and comments with their text.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openPdf } from '../src/node/pdf.ts';
import { extractText, pageAnnotations, MAX_MARKUP, type AnnotationData } from '../src/pdf/extract.ts';

const cases = new URL('../eval/cases/', import.meta.url).pathname;

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
