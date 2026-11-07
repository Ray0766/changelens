// Visual stage, fix round 9, fourth pass: what the verifier of the third
// pass still found (areas V1-closing-rules and V2-thin-light-lines).
// - A short line 2.0–2.5 pt from the rule that closes a table fragment at a
//   moved page break, or a thin tick 2–3 pt tall across it, was folded with
//   the rule: the pixel row right outside the rule's rows (with their row
//   of blur) on each side was read by neither check. What is drawn beside
//   the rule's ink is now looked at, from the row above its blur to the row
//   below.
// Fixtures test/fixtures/probe9-V1-fourth-SYNTHETIC-*.pdf are SYNTHETIC:
// reportlab 5.0 and PyMuPDF 2.1 (test/fixtures/gen9/v1-closing-rules-fourth.py).
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
/** The centre of the rule closing the table's first fragment on page 1 of probe9-V1-fourth-SYNTHETIC-before.pdf. */
const RULE_Y = 749.27;

test('visual9 fourth pass: a mark within a pixel row of a folded closing rule is listed', { skip }, async () => {
  // Before: only "Added 39 words"; the mark was counted with the rule as
  // "2 rules closing a table". Now the rule and the mark are listed as a
  // graphic at their place; the other version's own closing rule is still
  // a consequence.
  const F = 'probe9-V1-fourth-SYNTHETIC-';
  const at = { dash2: 215, 'tick2-red': 420, 'tick3-grey': 290 };
  for (const [m, x] of Object.entries(at)) {
    const r = await run(F + `before-${m}.pdf`, F + 'after.pdf');
    assert.deepEqual(list(r.changes), ['Added 39 words', 'Graphic or image removed'], m);
    assert.equal(r.ignored.closingRules, 1, m);
    const place = r.changes[1].old.rects.some((q) => q.page === 0 && q.rect.x <= x && q.rect.x + q.rect.w >= x && q.rect.y <= RULE_Y && q.rect.y + q.rect.h >= RULE_Y);
    assert.ok(place, `${m}: ${JSON.stringify(r.changes[1].old.rects)}`);
  }
  const rev = await run(F + 'after.pdf', F + 'before-tick2-red.pdf');
  assert.deepEqual(list(rev.changes), ['Deleted 39 words', 'Graphic or image added']);
  // Control: the rules alone still fold, in both versions.
  const plain = await run(F + 'before.pdf', F + 'after.pdf');
  assert.deepEqual(list(plain.changes), ['Added 39 words']);
  assert.equal(plain.ignored.closingRules, 2);
});
