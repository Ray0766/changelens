// Visual stage, fix round 8, second pass on strikes and underlines: rules
// added in the first pass hid or mislabelled real edits that the verifier's
// counter-probes showed (a cell rule or a bracket next to an underlined
// word taken for a frame). Each test asserts what the reviewer must see,
// next to its control. Fixtures test/fixtures/probe8-V2V*-* are copies of
// the verifier's SYNTHETIC counter-probes (reportlab; Chromium via
// Playwright).
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
const underlined = (...words: string[]) => words.map((w) => `Underlined: “${w}”`);

test('V2-decorations-V1: an underline next to a stroke new at one end only is no frame (a cell rule, a bracket or bar after the word)', { skip }, async () => {
  // A 0.5 pt vertical rule added 1.2 pt right of right-aligned amounts, two
  // of them underlined. Before: "No differences found." (the rule at the
  // underline's right end was read as a frame's side).
  const r = await run('probe8-V2V1-rule-before.pdf', 'probe8-V2V1-rule-under.pdf');
  assert.deepEqual(list(r.changes), underlined('3,480.00', '1,320.00'));
  // Control: the rule alone adds no line.
  const c = await run('probe8-V2V1-rule-before.pdf', 'probe8-V2V1-rule-only.pdf');
  assert.deepEqual(list(c.changes).filter((d) => /Underl|Struck|Strike/.test(d)), []);
  // "<u>Clause 12</u>[a]" and "<u>Tenant</u>|": before, a colour item for
  // Clause 12 and nothing for Tenant.
  const m = await run('probe8-V2V1-mark-before.pdf', 'probe8-V2V1-mark-after.pdf');
  assert.deepEqual(list(m.changes), [
    ...underlined('Section 4'),
    'Added “(b)”',
    ...underlined('Clause 12'),
    'Added “[a]”',
    ...underlined('Tenant'),
    'Added “|”',
    'Changed “Landlord” → “Landlordl”',
  ]);
  // A box drawn around words (both sides and a top edge) stays a graphic:
  // see R4-17 in visual8-decorations.test.ts.
});
