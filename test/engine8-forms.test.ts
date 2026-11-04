// Form fields (fix round 8). The PDFs are review-round-7 probes (synthetic:
// reportlab AcroForms, values written by pypdf or reportlab), copied to
// test/fixtures/probe8-R3-*.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openPdf } from '../src/node/pdf.ts';
import { extractText } from '../src/pdf/extract.ts';
import { buildDocModel } from '../src/core/tokenize.ts';
import { compareDocs } from '../src/core/compare.ts';
import { describeChange } from '../src/core/describe.ts';
import type { CompareResult } from '../src/core/types.ts';

const fixtures = new URL('./fixtures/', import.meta.url).pathname;
async function run(before: string, after: string): Promise<CompareResult> {
  const a = buildDocModel(await extractText(await openPdf(`${fixtures}probe8-${before}.pdf`), 'before.pdf'));
  const b = buildDocModel(await extractText(await openPdf(`${fixtures}probe8-${after}.pdf`), 'after.pdf'));
  return compareDocs(a, b);
}
const listed = (r: CompareResult) => r.changes.map((c) => describeChange('en', c));
const pages = (r: CompareResult) => r.changes.map((c) => [c.old.rects.map((x) => x.page + 1), c.new.rects.map((x) => x.page + 1)]);

test('R3-01: a form field value in a running header or footer is compared, its label is not', async () => {
  // f06: "Policy number" in the header of both pages (one field, two widgets).
  let r = await run('R3-01-f06-before', 'R3-01-f06-after');
  assert.deepEqual(listed(r), [
    'Number changed: PN-0042-771 → PN-0042-717 (form field)',
    'Number changed: PN-0042-771 → PN-0042-717 (form field)',
    'Number changed: 1,840.00 → 1,480.00 (-20%) (form field)',
  ]);
  assert.deepEqual(pages(r), [[[1], [1]], [[2], [2]], [[2], [2]]]);
  // The printed header is unchanged: nothing else is counted as ignored.
  assert.equal(r.ignored.furniture, 0);
  // f18: tenant initials in the footer of each page (fields init1..3).
  r = await run('R3-01-f18-before', 'R3-01-f18-blank-p2');
  assert.deepEqual(listed(r), ['Deleted “K.A.” (form field)']);
  assert.deepEqual(r.changes[0].old.rects.map((x) => x.page), [1]);
  assert.equal(r.ignored.furniture, 0);
  r = await run('R3-01-f18-before', 'R3-01-f18-changed');
  assert.deepEqual(listed(r), ['Added “H.” (form field)', 'Added “H.” (form field)', 'Added “H.” (form field)']);
  assert.deepEqual(pages(r).map((p) => p[1]), [[1], [2], [3]]);
});

test('R3-01 control: a number printed in a running header is still ignored and counted', async () => {
  // The same agreement number printed as page text on every page (no fields).
  const r = await run('R3-01-printed-before', 'R3-01-printed-after');
  assert.deepEqual(listed(r), []);
  assert.equal(r.ignored.furniture, 3);
});

test('R3-05: a comb value is located on the cells it is drawn in (right-aligned, padded, centred)', async () => {
  // Annual income statement: 9-cell comb fields at x 383–545 (18 pt cells).
  // Right-aligned by the appearance (/Q 2, as Acrobat draws it), and
  // right-aligned by leading spaces ("    45320", pypdf fill).
  for (const id of ['right', 'padded']) {
    const r = await run(`R3-05-${id}-before`, `R3-05-${id}-after`);
    assert.deepEqual(listed(r), ['Number changed: 45230 → 45320 (form field)', 'Number changed: 1250 → 1520 (form field)'], id);
    r.changes.forEach((c, k) => {
      for (const s of [c.old, c.new]) {
        const q = s.rects[0].rect;
        // 5 digits in cells 4–8 (x 455–545), 4 digits in cells 5–8 (x 473–545).
        assert.ok(Math.abs(q.x - [455, 473][k]) < 1 && Math.abs(q.x + q.w - 545) < 1, `${id} ${JSON.stringify(q)}`);
      }
    });
  }
  // Customs declaration: centred comb fields (/Q 1), values only in /V, drawn by the viewer.
  const r = await run('R3-05-centred-before', 'R3-05-centred-after');
  assert.deepEqual(listed(r), ['Number changed: 847130 → 847150 (form field)', 'Number changed: 2450 → 2540 (form field)']);
  // 6 of 10 cells from x 345 (cells 2–7), 4 of 8 cells from x 385 (cells 2–5); 20 pt cells.
  const cells = [
    [385, 505],
    [425, 505],
  ];
  r.changes.forEach((c, k) => {
    const q = c.new.rects[0].rect;
    assert.ok(Math.abs(q.x - cells[k][0]) < 1 && Math.abs(q.x + q.w - cells[k][1]) < 1, JSON.stringify(q));
  });
});

test('R3-03: field values on a page turned in the new version follow their labels', async () => {
  // Timesheet, 5 labelled fields; the new version is the same page saved turned (/Rotate 90).
  assert.deepEqual(listed(await run('R3-03-upright', 'R3-03-turned')), []);
  let r = await run('R3-03-upright', 'R3-03-turned-edit');
  assert.deepEqual(listed(r), ['Number changed: 7.5 → 5.7 (-24%) (form field)']);
  // The new value lies in the turned widget (the "Hours" row runs down the page).
  const q = r.changes[0].new.rects[0].rect;
  assert.ok(q.h > q.w && q.y > 200 && q.y + q.h < 300, JSON.stringify(q));
  // Control: both versions turned, two edits.
  r = await run('R3-03-turned', 'R3-03-turned-both-edit');
  assert.deepEqual(listed(r), ['Number changed: 7.5 → 5.7 (-24%) (form field)', 'Changed “Ndlovu” → “Ndlovu-Smit” (form field)']);
  // Purchase order (reportlab appearances), the new page turned by 270.
  r = await run('R3-03-rl-before', 'R3-03-rl-after');
  assert.deepEqual(listed(r), ['Number changed: 12 → 21 (+75%) (form field)']);
});

test('R3-02: a filled form against its flattened copy: the same words at the same place are unchanged', async () => {
  // Room booking form: pypdf fill against pypdf flatten (values burned into
  // the page after its content); the flattened copy has 8 → 18 people.
  assert.deepEqual(listed(await run('R3-02-filled', 'R3-02-flat')), []);
  let r = await run('R3-02-filled', 'R3-02-flat-edit');
  assert.deepEqual(listed(r), ['Number changed: 8 → 18 (+125%)']);
  // Located on the value in both versions (x 237, the "Number of people" row).
  for (const s of [r.changes[0].old, r.changes[0].new]) assert.ok(Math.abs(s.rects[0].rect.x - 237) < 1 && Math.abs(s.rects[0].rect.y - 239) < 2, JSON.stringify(s.rects));
  // Control without form fields: labels first, then the values, in the content stream.
  assert.deepEqual(listed(await run('R3-02-stream-before', 'R3-02-stream-after')), []);
  // One Word file exported by LibreOffice without and with form fields: a
  // wrapped label cell ("Inspection of cooling / unit") reads in another order.
  r = await run('R3-02-lo-plain', 'R3-02-lo-fields-edit');
  const text = listed(r).filter((d) => !d.includes(' font '));
  assert.deepEqual(text, ['Changed “Lisbon” → “Porto”', 'Changed “Standard” → “Express”', 'Number changed: 1,250.00 → 1,520.00 (+22%)']);
  r = await run('R3-02-lo-plain', 'R3-02-lo-fields');
  assert.ok(!r.changes.some((c) => c.category === 'text'), JSON.stringify(listed(r)));
});

test('R3-04: a longer field value inside its widget does not stick out into the margin', async () => {
  // Room booking: "Team meeting" → "Quarterly planning meeting with the
  // regional sales team" (ends at x 484, inside the box, 111 pt from the edge).
  let r = await run('R3-04-before', 'R3-04-after');
  assert.deepEqual(listed(r), ['Rewrote 8 words (form field)']);
  // Change of address form (reportlab): the value ends at x 519 in a box to x 545.
  r = await run('R3-04-rl-before', 'R3-04-rl-after');
  assert.deepEqual(listed(r), ['Rewrote 12 words (form field)']);
});
