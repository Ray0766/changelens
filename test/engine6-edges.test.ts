// Text at the edge of a page that became narrower is folded into "Content is
// cut off" only with geometric evidence that the page cut it (fix round 6):
// the visible part keeps the glyph positions it had, after the shift of the
// matched text around it, and the old text reached past the new page edge.
// A figure re-set inside the new page, or a sign removed from an amount that
// stays inside it, is the edit it is. The PDFs are round-5 probes
// (synthetic; reportlab and Chromium), copied to test/fixtures/probe6-*.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openPdf } from '../src/node/pdf.ts';
import { extractText } from '../src/pdf/extract.ts';
import { buildDocModel } from '../src/core/tokenize.ts';
import { compareDocs } from '../src/core/compare.ts';
import { describeChange } from '../src/core/describe.ts';
import type { CompareResult } from '../src/core/types.ts';

const fixtures = new URL('./fixtures/', import.meta.url).pathname;
async function probe(id: string): Promise<CompareResult> {
  const a = buildDocModel(await extractText(await openPdf(`${fixtures}probe6-${id}-before.pdf`), 'before.pdf'));
  const b = buildDocModel(await extractText(await openPdf(`${fixtures}probe6-${id}-after.pdf`), 'after.pdf'));
  return compareDocs(a, b);
}
const listed = (r: CompareResult) => r.changes.map((c) => describeChange('en', c));
const CUT_RIGHT = 'Content is cut off at the right edge of the page';

test('amounts shortened inside a narrower page are number changes, beside a real cut (fm13, p12)', async () => {
  // 595 → 545 pt wide; the amounts end at x 540, fully visible; a note line is really cut.
  const r = await probe('p12');
  assert.deepEqual(listed(r), ['Number changed: 1,000,000 → 1,000 (-100%)', 'Number changed: 3,480.50 → 3,480', CUT_RIGHT]);
  // Each number change is at its amount on the new page.
  for (const c of r.changes.slice(0, 2)) assert.ok(c.new.rects.every((x) => x.rect.x > 500 && x.rect.x + x.rect.w <= 545), JSON.stringify(c.new.rects));
  // The cut-off item holds the note only.
  const cut = r.changes[2];
  assert.equal(cut.old.text, 'annex 3 (limits).');
  assert.equal(cut.new.text, 'anne');
});

test('amounts shortened inside a narrower page are not called cut off (fm14, p13, Chromium receipt)', async () => {
  const p13 = await probe('p13');
  assert.deepEqual(listed(p13), ['Number changed: 1,000,000 → 1,000 (-100%)', 'Number changed: 3,480.50 → 3,480']);
  // An 80 mm receipt reprinted on 72 mm paper: the amounts re-flowed, nothing is cut.
  const v2 = await probe('v2');
  assert.deepEqual(listed(v2), ['Number changed: 1,250.50 → 1,250', 'Number changed: 1,000,000 → 1,000 (-100%)']);
});

test('a sign removed from an amount at a new left edge is a sign change (fm15, p14, Chromium ledger)', async () => {
  // Cropped 56 pt from the left; the amount starts 4 pt inside the new edge.
  const p14 = await probe('p14');
  assert.ok(listed(p14).includes('Number changed: −4,800.00 → 4,800.00 (sign changed)'), JSON.stringify(listed(p14)));
  const cut = p14.changes.find((c) => c.kind === 'overflow');
  assert.ok(cut && !cut.old.text.includes('4,800'), JSON.stringify(cut?.old.text));
  // The page lost width on the right only; the amount column starts at x 3.
  const v3 = await probe('v3');
  assert.deepEqual(listed(v3), ['Number changed: −45.00 → 45.00 (sign changed)', 'Number changed: -1,200.00 → 1,200.00 (sign changed)']);
});

test('control: a figure really cut at the new right edge is one cut-off item, an edit beside it is listed (p11)', async () => {
  const r = await probe('p11');
  assert.deepEqual(listed(r), [CUT_RIGHT, 'Number changed: 4,800 → 4,300 (-10%)']);
  assert.equal(r.changes[0].old.text, '4,800');
  assert.ok(!r.changes.some((c) => c.numeric?.to === '4,'));
});
