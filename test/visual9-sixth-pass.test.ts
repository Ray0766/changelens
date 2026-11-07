// Visual stage, fix round 9, sixth pass: what the verifier of the fifth
// pass still found.
// - A grey strike through a bold heading in a mid, saturated colour was
//   silent, with no item and no count, where the earlier engine (which
//   measured lines by luminance) listed it: dark olive (87,124,47), which a
//   browser writes for Office's light green #92d050, and #548235. Their
//   glyphs are darker than a grey line in the lowest channel, so the line
//   lightens them there and adds little; their luminance is only 54–57
//   above that channel, under the bound (77) above which a pair of boxes is
//   looked at by luminance too. The bound is now 48: red, mid greens and
//   mid blues are looked at so as well; black, grey and navy are not.
// Fixtures test/fixtures/probe9-V2-sixth-SYNTHETIC-*.pdf are SYNTHETIC:
// reportlab 5.0 (test/fixtures/gen9/v2-tinted-sixth-olive.py, v2-tinted-sixth-mid.py).
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
const counted = (r: CompareResult) => (r.coverage?.new.partlyCompared ?? []).reduce((n, u) => n + u.count, 0);

test('visual9 sixth pass: a grey strike through a bold heading in dark olive or a mid green is listed', { skip }, async () => {
  // Before: only "Cleared" (#70ad47) listed; "Closed" (#548235) counted and
  // "Passed" (87,124,47) neither listed nor counted.
  const O = 'probe9-V2-sixth-SYNTHETIC-t4o-';
  const r = await run(O + 'before.pdf', O + 'w15.pdf');
  assert.deepEqual(lines(r), ['Struck through: “Passed”', 'Struck through: “Cleared”', 'Struck through: “Closed”']);
  assert.equal(counted(r), 0);
  // The same strike through headings in red and a mid blue is listed too.
  const M = 'probe9-V2-sixth-SYNTHETIC-mid-';
  const g = await run(M + 'before.pdf', M + 'g15.pdf');
  assert.deepEqual(
    lines(g).filter((s) => /Passed|Closed|Cleared|Booked|Overdue|Parked/.test(s)),
    ['Struck through: “Passed”', 'Struck through: “Closed”', 'Struck through: “Cleared”', 'Struck through: “Booked”', 'Struck through: “Overdue”', 'Struck through: “Parked”'],
  );
  // A grey underline under them, in dark red and green as well.
  const u = await run(M + 'before.pdf', M + 'ul.pdf');
  for (const w of ['Overdue', 'Blocked', 'Settled']) assert.ok(lines(u).includes(`Underlined: “${w}”`), JSON.stringify(lines(u)));
  // Controls: black 0.4 pt strikes are found as before; a re-flow of 0.7 pt
  // and every heading recoloured to a darker shade of its hue give no line
  // and no count.
  assert.equal(lines(await run(M + 'before.pdf', M + 'k04.pdf')).length, 9);
  const moved = await run(M + 'before.pdf', M + 'dx07.pdf');
  assert.deepEqual(list(moved.changes), []);
  assert.equal(counted(moved), 0);
  const dark = await run(M + 'before.pdf', M + 'dark.pdf');
  assert.deepEqual(lines(dark), []);
  assert.ok(dark.changes.length > 0 && dark.changes.every((c) => describeChange('en', c) === 'Text colour or weight changed'));
  assert.equal(counted(dark), 0);
});
