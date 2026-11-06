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
import { extractText } from '../src/pdf/extract.ts';
import { buildDocModel } from '../src/core/tokenize.ts';
import { compareDocs } from '../src/core/compare.ts';
import { addVisualChanges } from '../src/core/pipeline.ts';
import { describeChange } from '../src/core/describe.ts';
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
