// Form fields, visual stage (fix round 8). Fixtures test/fixtures/probe8-R3-*
// are copies of SYNTHETIC review-round-7 probes (reportlab AcroForms filled
// and flattened by pypdf).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openPdf } from '../src/node/pdf.ts';
import { renderPage, canRender } from '../src/node/render.ts';
import { extractText } from '../src/pdf/extract.ts';
import { buildDocModel } from '../src/core/tokenize.ts';
import { compareDocs } from '../src/core/compare.ts';
import { addVisualChanges } from '../src/core/pipeline.ts';
import { describeChange } from '../src/core/describe.ts';
import type { CompareResult } from '../src/core/types.ts';

const fixtures = new URL('./fixtures/', import.meta.url).pathname;
const skip = !(await canRender()) && 'no canvas';

async function run(before: string, after: string): Promise<CompareResult> {
  const pa = await openPdf(`${fixtures}probe8-${before}.pdf`);
  const pb = await openPdf(`${fixtures}probe8-${after}.pdf`);
  const r = compareDocs(buildDocModel(await extractText(pa, 'old')), buildDocModel(await extractText(pb, 'new')));
  await addVisualChanges(r, (p) => renderPage(pa, p, 1.5), (p) => renderPage(pb, p, 1.5));
  return r;
}
const listed = (r: CompareResult) => r.changes.map((c) => describeChange('en', c));

test('R3-02: a field value has the glyph box of the same text burned into the page (no underline or colour noise)', { skip }, async () => {
  // The two renders are alike pixel for pixel; the field boxes (estimated
  // from the font size) once differed from the flattened text's boxes by a
  // point, and "Underlined: “J”" and "Underlined: “8”" were listed.
  let r = await run('R3-02-filled', 'R3-02-flat');
  assert.deepEqual(listed(r), []);
  r = await run('R3-02-filled', 'R3-02-flat-edit');
  assert.deepEqual(listed(r), ['Number changed: 8 → 18 (+125%)']);
});

test('R3-06: lines of a multi-line field drawn from its value lie where the viewer draws them', { skip }, async () => {
  // Incident report, values in /V only (NeedAppearances): a first line
  // inserted in "Actions taken" moves the three lines below it down one line;
  // "pump 2" → "pump 3" elsewhere. The boxes were estimated at 1.2 × the
  // font size from the top and drifted off the drawn lines, so a line that
  // only moved down was "Text colour or weight changed" and the rows it left
  // were "Graphic or image added".
  let r = await run('R3-06-before', 'R3-06-after');
  assert.deepEqual(listed(r), ['Number changed: 2 → 3 (+50%) (form field)', 'Added “Line stopped for 2 hours.” (form field)']);
  // Every word box of the field values covers its drawn glyphs: it holds
  // ink, and the point above and below it holds none (rules of the box left
  // out; the lines are 1.35 × the size apart, so the next line is further).
  const pb = await openPdf(`${fixtures}probe8-R3-06-after.pdf`);
  const img = await renderPage(pb, 0, 2);
  const inkRow = (x0: number, x1: number, y: number) => {
    let n = 0;
    for (let x = x0; x < x1; x++) if (img.data[(y * img.width + x) * 4] < 128) n++;
    return n > 0.9 * (x1 - x0) ? 0 : n;
  };
  for (const t of r.newDoc.tokens.filter((t) => t.field && t.kind === 'word')) {
    const q = t.rects[0];
    const [x0, x1] = [Math.ceil(q.x * 2) + 1, Math.floor((q.x + q.w) * 2) - 1];
    const sum = (from: number, to: number) => {
      let n = 0;
      for (let y = Math.round(from * 2); y < Math.round(to * 2); y++) n += inkRow(x0, x1, y);
      return n;
    };
    assert.ok(sum(q.y, q.y + q.h) > 0 && sum(q.y - 1, q.y) === 0 && sum(q.y + q.h, q.y + q.h + 1) === 0, `${t.text} ${JSON.stringify(q)}`);
  }
  // Expense report (reportlab), the same edit pattern: no underline noise on a moved line.
  r = await run('R3-06-rl-before', 'R3-06-rl-after');
  assert.deepEqual(listed(r), ['Number changed: 48,120 → 48,210 (+0.2%) (form field)', 'Added 11 words (form field)']);
});

test('T3-forms-V2: a value set in a bold standard font is measured with the bold widths (no graphic at its end)', { skip }, async () => {
  // LibreOffice form (ExportFormFields): the new version sets the value in
  // Times-Bold (/TiBo). Measured with the regular Times widths, the end of
  // the drawn value lay outside its box and came out as "Graphic or image added".
  let r = await run('V2-lo-before', 'V2-lo-bold');
  assert.deepEqual(listed(r), ['“Lisbon harbour depot” now bold']);
  // pypdf, values in /V: the room set in Helvetica-Bold (/HeBo).
  r = await run('V2-hebo-before', 'V2-hebo-bold');
  assert.deepEqual(listed(r), ['“Room 3.14 (Harbour)” now bold']);
  // Control: a word added at the end of the bold value is listed.
  r = await run('V2-hebo-before', 'V2-hebo-bold-edit');
  assert.deepEqual(listed(r), ['Added “B” (form field)', '“Room 3.14 (Harbour)” now bold']);
});
