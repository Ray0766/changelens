// Visual stage, fix round 9, fifth pass: what the second verifier of the
// fourth pass still found.
// - A small page graphic recoloured under a new or removed highlight across
//   a long row (a status dot turned from red to green or orange in a
//   highlighted table row) was hidden on both sides: its pixels, which the
//   highlight's multiply model rejects, were under 3 % of the row's. A
//   block of 2 × 2 pt of pixels lighter than the other version's, which no
//   highlight draws, now keeps the region listed whatever its share.
// Fixtures test/fixtures/probe9-V3-fifth-SYNTHETIC-*.pdf are SYNTHETIC:
// fpdf2 2.9, PyMuPDF 2.1 and pypdf 6 (test/fixtures/gen9/v3-markup-fifth-*.py).
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
/** Whether a rect of `side` of the change takes in the point (x, y) on page 1. */
const at = (c: Change, side: 'old' | 'new', x: number, y: number) => c[side].rects.some((q) => q.page === 0 && q.rect.x <= x && q.rect.x + q.rect.w >= x && q.rect.y <= y && q.rect.y + q.rect.h >= y);

test('visual9 fifth pass: a status dot recoloured under a highlight across its whole row is listed', { skip }, async () => {
  // Before: only the highlight item (the dot's 82 pixels were under 3 % of
  // the row's), on both sides. The dot lies at (202, 136) on both pages.
  const H = 'probe9-V3-fifth-SYNTHETIC-';
  const HL = 'Highlighted (annotation): “Dock B lighting Checked by L. B…”';
  for (const after of ['hl-dot-green-Y40', 'hl-dot-orange-Y', 'hl-dot-orange-PP']) {
    const r = await run(H + 'hl-base.pdf', H + after + '.pdf');
    assert.deepEqual(list(r.changes), ['Graphic or image changed', HL], after);
    assert.ok(at(r.changes[0], 'old', 202, 136) && at(r.changes[0], 'new', 202, 136), after);
  }
  // The highlight removed, the dot back to red.
  const rev = await run(H + 'hl-dot-orange-Y.pdf', H + 'hl-base.pdf');
  assert.deepEqual(list(rev.changes), ['Graphic or image changed', HL.replace('Highlighted', 'Highlight removed')]);
  // A 12 pt dot under a highlight over a 372 pt row.
  const big = await run(H + 'hs-r6.0-base.pdf', H + 'hs-r6.0-green-row.pdf');
  assert.deepEqual(list(big.changes), ['Graphic or image changed', HL]);
  // Controls: the same highlights over the unchanged dots give the highlight only.
  assert.deepEqual(list((await run(H + 'hl-base.pdf', H + 'hl-base-Y40.pdf')).changes), [HL, 'Highlighted (annotation): “Fire doors east Two closers to …”']);
  assert.deepEqual(list((await run(H + 'hs-r6.0-base.pdf', H + 'hs-r6.0-base-row.pdf')).changes), [HL]);
});
