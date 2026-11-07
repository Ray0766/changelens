// Visual stage, fix round 9, fourth pass: what the verifier of the third
// pass still found (areas V1-closing-rules and V2-thin-light-lines).
// - A short line 2.0–2.5 pt from the rule that closes a table fragment at a
//   moved page break, or a thin tick 2–3 pt tall across it, was folded with
//   the rule: the pixel row right outside the rule's rows (with their row
//   of blur) on each side was read by neither check. What is drawn beside
//   the rule's ink is now looked at, from the row above its blur to the row
//   below.
// - A strike drawn by hand over a short word that overshoots it by 8 pt or
//   more at the same slope was taken for the border of a turned stamp and
//   dropped with no item and no count. Only a slanted line that goes on so
//   from 3.5 to 20 pt past the word is now dropped; one that goes on to 10
//   pt only is weighed as a fainter line: listed with a line next to it,
//   or counted as compared only in part.
// Fixtures test/fixtures/probe9-V1-fourth-SYNTHETIC-*.pdf are SYNTHETIC:
// reportlab 5.0 and PyMuPDF 2.1 (test/fixtures/gen9/v1-closing-rules-fourth.py);
// probe9-V2-steep-SYNTHETIC-over12.pdf: fpdf2 2.9 and PyMuPDF 2.1
// (v2-steep-strikes.py, v2-steep-overshoot.py).
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
const lines = (r: CompareResult) => list(r.changes.filter((c) => c.format?.decoration));
const counted = (r: CompareResult) => r.coverage?.new.partlyCompared?.flatMap((u) => u.words) ?? [];
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

test('visual9 fourth pass: a hand strike that overshoots a short word by 12 pt is counted where it is not listed', { skip }, async () => {
  // Before: "12" listed, "30" neither listed nor counted.
  const S = 'probe9-V2-steep-SYNTHETIC-';
  const r = await run(S + 'before.pdf', S + 'over12.pdf');
  assert.deepEqual(lines(r), ['Struck through: “12”']);
  assert.deepEqual(counted(r), ['30']);
  // Counted with the words a graphic lies over, not as a line too thin or too light.
  assert.equal(r.coverage?.new.partlyCompared?.[0].faint, undefined);
  // Control: the border of a stamp turned by 18° goes on past the figures
  // it crosses: still no line, and the same words counted as before.
  const stamp = await run('probe9-V2-refix-stamp-SYNTHETIC-before.pdf', 'probe9-V2-refix-stamp-SYNTHETIC-n25.pdf');
  assert.deepEqual(lines(stamp), []);
  assert.equal(counted(stamp).length, 3);
});
