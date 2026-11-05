// Form fields (fix round 8). The PDFs are review-round-7 probes (synthetic:
// reportlab AcroForms, values written by pypdf or reportlab), copied to
// test/fixtures/probe8-R3-*.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openPdf } from '../src/node/pdf.ts';
import { extractText, fieldRuns, placeFieldRuns, type WidgetData } from '../src/pdf/extract.ts';
import { buildDocModel } from '../src/core/tokenize.ts';
import { compareDocs } from '../src/core/compare.ts';
import { describeChange } from '../src/core/describe.ts';
import type { CompareResult, TextRun } from '../src/core/types.ts';

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

test('T3-forms-N3: header and footer field values are compared page by page when the text re-flows', async () => {
  // Policy conditions, 3 pages: "Policy number" in the header of every page
  // (one field, a widget per page), "Holder initials" in the footer (a field
  // per page). A paragraph is inserted on p. 1, so the text re-flows over
  // the page breaks.
  const bodyOnly = (r: CompareResult) => r.changes.filter((c) => !c.field).map((c) => describeChange('en', c));
  // Control: the values are unchanged, only the insertion is listed.
  let r = await run('N3-before', 'N3-reflow-same');
  assert.deepEqual(listed(r), ['Added 54 words']);
  // The policy number changed on every page: no initials deleted and added again.
  r = await run('N3-before', 'N3-reflow-polno');
  assert.deepEqual(listed(r), ['Number changed: PN-0042-771 → PN-0042-717 (in 3 places) (form field)', 'Added 54 words']);
  assert.deepEqual(pages(r)[0], [
    [1, 2, 3],
    [1, 2, 3],
  ]);
  assert.deepEqual(r.minor, []);
  // The initials of p. 2 cleared: listed on p. 2, at the footer; the policy
  // number of p. 3 is not taken for a repeated table header.
  r = await run('N3-before', 'N3-reflow-initials-blank');
  assert.deepEqual(listed(r), ['Added 54 words', 'Deleted “K.A.” (form field)']);
  const cleared = r.changes[1];
  assert.deepEqual([cleared.old.rects.map((x) => x.page), cleared.new.caret?.page], [[1], 1]);
  assert.ok(cleared.new.caret!.y > 780, JSON.stringify(cleared.new.caret));
  assert.equal(cleared.contextBefore.endsWith('Holder initials'), true, cleared.contextBefore);
  assert.deepEqual(r.minor, []);
  // A reference per page, changed on p. 2 only.
  r = await run('N3-ref-before', 'N3-ref-reflow-p2');
  assert.deepEqual(listed(r), ['Added 54 words', 'Number changed: REF-2207 → REF-2270 (form field)']);
  assert.deepEqual(pages(r)[1], [[2], [2]]);
  assert.deepEqual(r.minor, []);
  // 40 lines inserted: the new version has a page more. The values of the
  // page left over repeat the header and footer of the other pages: counted
  // with the header and footer differences (5 printed lines + 2 values).
  r = await run('N3-before', 'N3-page-added');
  assert.deepEqual(listed(r), ['Added a paragraph']);
  assert.equal(r.ignored.furniture, 7);
  // Control: initials on that page that no other page has are listed.
  r = await run('N3-before', 'N3-page-added-leftover-initials');
  assert.deepEqual(listed(r), ['Added a paragraph', 'Added “Z.Z.” (form field)']);
  assert.deepEqual(bodyOnly(r), ['Added a paragraph']);
  assert.deepEqual(pages(r)[1][1], [1]);
  assert.equal(r.ignored.furniture, 6);
});

test('T3-forms-N3: a page moved elsewhere keeps its header field value', async () => {
  // Four sheets, each with its own reference in the header (REF-A … REF-D);
  // the new version puts sheet 2 after sheet 3, its reference with it.
  let r = await run('N3-swap-before', 'N3-swap-same');
  assert.deepEqual(listed(r), ['Moved a paragraph']);
  // The moved sheet's reference also changed: one change, from p. 2 to p. 3.
  r = await run('N3-swap-before', 'N3-swap-ref-edit');
  assert.deepEqual(listed(r), ['Changed “REF-B” → “REF-X” (form field)', 'Moved a paragraph']);
  assert.deepEqual(pages(r)[0], [[2], [3]]);
});

test('T3-forms-V1: a header or footer value cleared on a page the re-flow leaves unpaired is listed on that page', async () => {
  // Policy conditions, 3 pages (header "Policy number", footer "Holder
  // initials" K.A. on every page). 28 lines are inserted at the top of p. 2
  // and 10 dropped at the end, so most of old p. 2's text moves on to new
  // p. 3, and pages are paired old 1–new 1, old 2–new 3; old p. 3 and new
  // p. 2 are left over.
  const fieldItems = (r: CompareResult) => r.changes.filter((c) => c.field);
  const where = (c: CompareResult['changes'][number]) => [c.old.rects.map((x) => x.page + 1), c.new.rects.map((x) => x.page + 1), c.old.caret?.page ?? -1, c.new.caret?.page ?? -1];
  // Control: the values are unchanged, only the body is listed.
  let r = await run('V1-before', 'V1-reflow-same');
  assert.deepEqual(listed(r), ['Added 504 words', 'Deleted 160 words']);
  // The initials of new p. 2 cleared: listed on p. 2 of both versions, the
  // caret on new p. 2's footer line.
  r = await run('V1-before', 'V1-reflow-p2-blank');
  assert.deepEqual(listed(r), ['Added 504 words', 'Deleted “K.A.” (form field)', 'Deleted 160 words']);
  let [c] = fieldItems(r);
  assert.deepEqual(where(c), [[2], [], -1, 1]);
  assert.ok(c.new.caret!.y > 780, JSON.stringify(c.new.caret));
  assert.equal(c.contextBefore.endsWith('Holder initials'), true, c.contextBefore);
  // The same the other way round: filled in on p. 2.
  r = await run('V1-reflow-p2-blank', 'V1-before');
  assert.deepEqual(fieldItems(r).map((c) => [describeChange('en', c), ...where(c)]), [['Added “K.A.” (form field)', [], [2], 1, -1]]);
  // Nothing dropped (3 -> 4 pages), the initials of new p. 2 cleared.
  r = await run('V1-before', 'V1-page-more-p2-blank');
  assert.deepEqual(listed(r), ['Added 504 words', 'Deleted “K.A.” (form field)']);
  [c] = fieldItems(r);
  assert.deepEqual(where(c), [[2], [], -1, 1]);
  // Control: cleared on new p. 3, a page of the chain: listed once.
  r = await run('V1-before', 'V1-reflow-p3-blank');
  assert.deepEqual(fieldItems(r).map((c) => [describeChange('en', c), c.new.caret?.page]), [['Deleted “K.A.” (form field)', 2]]);
});

test('T3-forms-V1: a page code in the footer stays with its page when the text re-flows', async () => {
  // As above, but the footer field holds a code of its own on each page
  // (S-1, S-2, S-3). The chain pairs old p. 2 with new p. 3; each code
  // stands on the page left over that shares text with its page.
  const fieldItems = (r: CompareResult) => r.changes.filter((c) => c.field).map((c) => [describeChange('en', c), c.old.rects.map((x) => x.page + 1), c.new.rects.map((x) => x.page + 1)]);
  let r = await run('V1-codes-before', 'V1-codes-same');
  assert.deepEqual(fieldItems(r), []);
  // New p. 3's code changed: listed on p. 3, from the code it replaced.
  r = await run('V1-codes-before', 'V1-codes-p3-edit');
  assert.deepEqual(fieldItems(r), [['Number changed: S-3 → S-9 (form field)', [3], [3]]]);
  // New p. 2's code cleared: listed on p. 2.
  r = await run('V1-codes-before', 'V1-codes-p2-blank');
  assert.deepEqual(fieldItems(r), [['Deleted “S-2” (form field)', [2], []]]);
  assert.equal(r.changes.find((c) => c.field)!.new.caret?.page, 1);
});

test('T-leftovers-V1: a running footer value changed on a page the re-flow leaves unpaired is listed there', async () => {
  // The re-flow above (old p. 3 and new p. 2 left over); the holder's
  // initials are K.B., K.A., K.B. on pages 1–3. Old p. 3 is held against new
  // p. 3, the page sharing its text. Its K.B. stands on old p. 1 too (a
  // running value), but new p. 3 shows K.A. at its place, and no such change
  // is listed between paired pages: the initials of p. 3 changed.
  const fieldItems = (r: CompareResult) => r.changes.filter((c) => c.field).map((c) => [describeChange('en', c), c.old.rects.map((x) => x.page + 1), c.new.rects.map((x) => x.page + 1)]);
  let r = await run('TV1-initials-before', 'TV1-initials-p3-edit');
  assert.deepEqual(fieldItems(r), [['Changed “B” → “A” (form field)', [3], [3]]]);
  assert.equal(r.ignored.furniture, 3);
  r = await run('TV1-initials-p3-edit', 'TV1-initials-before');
  assert.deepEqual(fieldItems(r), [['Changed “A” → “B” (form field)', [3], [3]]]);
  // Control: the initials kept by page, the policy number changed on every
  // page. On the pages left over, the policy number faces the new one, the
  // same change as on the pages paired: it comes with its page and is
  // counted, not listed again.
  r = await run('TV1-initials-before', 'TV1-initials-polno');
  assert.deepEqual(fieldItems(r), [
    ['Number changed: PN-0042-771 → PN-0042-772 (form field)', [1], [1]],
    ['Number changed: PN-0042-771 → PN-0042-772 (form field)', [2], [3]],
  ]);
  assert.equal(r.ignored.furniture, 2);
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

test('T3-forms-N1: words matched at the same place are checked for formatting like other matched words', async () => {
  // The flattened copy sets the date in Helvetica-Bold (DA /HeBo) and
  // "Number of people" in 11.5 pt instead of 10 (pypdf fill against pypdf flatten).
  const formats = ['“12 May 2026” now bold', '“8” size 10 → 11.5 pt'];
  assert.deepEqual(listed(await run('R3-02-filled', 'R3-02-flat-format')), formats);
  // The same edits on a page drawn row by row (label, value) against labels
  // first and then the values (reportlab, no form fields).
  assert.deepEqual(listed(await run('R3-02-rows', 'R3-02-rows-format')), formats);
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

test('R3-09: a form font renamed in the resources is no font change; a standard form font is named', async () => {
  // Expense claim (reportlab): only the /DR key and the widgets' /DA change, /Helv → /F0;
  // the appearance streams are byte for byte the same.
  assert.deepEqual(listed(await run('R3-09-before', 'R3-09-renamed')), []);
  // LibreOffice export without and with form fields: the field values are
  // drawn in Times ("TiRo", a real change of face); "F3", the key of a font
  // of the form's own resources, stands for Liberation Sans, as before.
  const r = await run('R3-02-lo-plain', 'R3-02-lo-fields');
  assert.deepEqual(listed(r), [
    '“Lisbon” font LiberationSans → Times-Roman',
    '“2 1,250.00 2,500.00” font LiberationSans → Times-Roman',
    '“1 340.00 340.00” font LiberationSans → Times-Roman',
    '“1 180.00 180.00” font LiberationSans → Times-Roman',
  ]);
});

test('R3-09 control: a field set in another standard font is a font change', () => {
  const VT = [1, 0, 0, -1, 0, 841.89];
  const label: TextRun = { str: 'Amount', x: 56, y: 150, w: 40, h: 11, baseline: 159, fontSize: 10, font: 'Helvetica', family: 'sans-serif', eol: true, angle: 0 };
  const doc = (fontName: string) => {
    const w: WidgetData = { subtype: 'Widget', fieldType: 'Tx', rect: [235, 841.89 - 164, 535, 841.89 - 146], fieldValue: '1,250.00', defaultAppearanceData: { fontSize: 10, fontName } };
    return buildDocModel({ name: 'x', pages: [{ index: 0, width: 595.28, height: 841.89, runs: placeFieldRuns([label], fieldRuns([w], VT, [label]).runs) }] });
  };
  assert.deepEqual(listed(compareDocs(doc('Helv'), doc('TiRo'))), ['“1,250.00” font Helvetica → Times-Roman']);
  assert.deepEqual(listed(compareDocs(doc('Helv'), doc('HeBo'))), ['“1,250.00” now bold']);
  // Keys that are not standard, with no drawn font to tell (see T3-forms-N2): only the size is compared.
  assert.deepEqual(listed(compareDocs(doc('F1'), doc('F2'))), []);
});

test('T3-forms-N2: a field font named by a key of the form’s resources is the font the viewer draws', async () => {
  // Room booking (pypdf): the new version adds /F1 = Times-Roman to the form's
  // resources and sets the date and purpose fields to /F1. Values only in /V
  // (the viewer draws them), and filled with appearance streams.
  const times = ['“12 May 2026” font Helvetica → Times-Roman', '“Team meeting” font Helvetica → Times-Roman'];
  assert.deepEqual(listed(await run('R3-09-vonly', 'R3-09-vonly-times')), times);
  assert.deepEqual(listed(await run('R3-02-filled', 'R3-09-ap-times')), times);
  // reportlab names Times-Roman /Time.
  assert.deepEqual(listed(await run('R3-09-rl-before', 'R3-09-rl-times')), times);
  // Control: Helvetica under /F1 in one version and /F2 in the other.
  assert.deepEqual(listed(await run('R3-09-key-f1', 'R3-09-key-f2')), []);
});

test('R3-07: a widget turned by /MK /R is compared as text', async () => {
  // Sample submission: a vertical "Batch no." field along the left margin (/MK /R 90, value in /V).
  let r = await run('R3-07-before', 'R3-07-swap');
  assert.deepEqual(listed(r), ['Number changed: B-2026-0417 → B-2026-0471 (form field)']);
  // Located in the vertical widget (x 20–38, y 110–280 from the top), reading up the page.
  const q = r.changes[0].new.rects[0].rect;
  assert.ok(q.x >= 19 && q.x + q.w <= 39 && q.y >= 109 && q.y + q.h <= 281 && q.h > q.w, JSON.stringify(q));
  assert.equal(r.coverage.new.fieldsUnread, undefined);
  // Control: only the ordinary "Sample count" field changes.
  r = await run('R3-07-before', 'R3-07-control');
  assert.deepEqual(listed(r), ['Number changed: 12 → 21 (+75%) (form field)']);
  // A page with /Rotate 90 whose fields carry /R 90 (as Acrobat adds them): upright values after their labels.
  r = await run('R3-07-page-before', 'R3-07-page-after');
  assert.deepEqual(listed(r), ['Number changed: 48,120 → 84,120 (+75%) (form field)']);
  assert.equal(r.changes[0].contextBefore, 'Odometer (km)');
});

test('T3-forms-V4: a widget turned the other way (/MK /R 90 → 270) with the same value is a turn, not a value deleted and added', async () => {
  // Sample submission: the vertical "Batch no." field reads bottom to top
  // (/R 90, beside its label) and then top to bottom (/R 270): the value
  // reads against its label and comes at another point of the reading order.
  let r = await run('V4-before', 'V4-r270-same');
  assert.deepEqual(listed(r), ['“B-2026-0417” reads bottom to top → top to bottom']);
  const [c] = r.changes;
  assert.deepEqual([c.kind, c.old.text, c.new.text, c.old.rects.length, c.new.rects.length], ['format', 'B-2026-0417', 'B-2026-0417', 1, 1]);
  assert.equal(describeChange('zh', c), '「B-2026-0417」方向 从下到上 → 从上到下');
  // The other way round.
  r = await run('V4-r270-same', 'V4-before');
  assert.deepEqual(listed(r), ['“B-2026-0417” reads top to bottom → bottom to top']);
  // Control: turned and edited: the old and the new value are both listed.
  r = await run('V4-before', 'V4-r270-edit');
  assert.deepEqual(listed(r), ['Added “B-2026-0471” (form field)', 'Deleted “B-2026-0417” (form field)']);
  // Control: an edit of another field next to it is listed.
  r = await run('V4-before', 'V4-r270-count');
  assert.deepEqual(listed(r), ['“B-2026-0417” reads bottom to top → top to bottom', 'Number changed: 12 → 21 (+75%) (form field)']);
});

test('R3-06: a field in an automatic size is fitted to its value as the viewer fits it; its size is no edit', async () => {
  // Supplier address in auto-sized fields (DA size 0, values in /V): the
  // longer address is drawn smaller (11.9 → 8.2 pt). The size follows from
  // the value and the box, so only the text edits are listed.
  const r = await run('R3-06-auto-before', 'R3-06-auto-after');
  assert.deepEqual(listed(r), ['Added “Industrial Estate, Maryhill Road” (form field)', 'Number changed: 77812 → 77821 (form field)']);
  const sizes = (d: CompareResult['newDoc']) => [...new Set(d.tokens.filter((t) => t.field && t.text === 'Unit').map((t) => Math.round(t.size * 10) / 10))];
  assert.deepEqual([sizes(r.oldDoc), sizes(r.newDoc)], [[11.9], [8.2]]);
});

test('R3-06 control: a field set in a fixed size that changes is listed', () => {
  const VT = [1, 0, 0, -1, 0, 841.89];
  const label: TextRun = { str: 'Amount', x: 56, y: 150, w: 40, h: 11, baseline: 159, fontSize: 10, font: 'Helvetica', family: 'sans-serif', eol: true, angle: 0 };
  const doc = (fontSize: number) => {
    const w: WidgetData = { subtype: 'Widget', fieldType: 'Tx', rect: [235, 841.89 - 164, 535, 841.89 - 146], fieldValue: '1,250.00', defaultAppearanceData: { fontSize, fontName: 'Helv' } };
    return buildDocModel({ name: 'x', pages: [{ index: 0, width: 595.28, height: 841.89, runs: placeFieldRuns([label], fieldRuns([w], VT, [label]).runs) }] });
  };
  assert.deepEqual(listed(compareDocs(doc(10), doc(12))), ['“1,250.00” size 10 → 12 pt']);
});

test('T3-forms-N4: a one-line value in a box taller than its line stays on the line of the label level with the box', async () => {
  // Shipping label request: "Contents" in a 30 pt box, 10 → 14 pt (fixed
  // size), the viewer centring the value in the box. At 10 pt its baseline
  // is 5.5 pt below the label's; it still follows the label.
  const r = await run('N4-before', 'N4-after');
  assert.deepEqual(listed(r), ['Added “Industrial Estate, Maryhill Road” (form field)', '“Glassware, boxed” size 10 → 14 pt']);
  // The same from runs: a box from y 172 to 202, the label's baseline at
  // 185, the value's at 190.5. The value follows "Contents" on its line,
  // not the row above it.
  const VT = [1, 0, 0, -1, 0, 841.89];
  const run1 = (str: string, baseline: number): TextRun => ({ str, x: 56, y: baseline - 9.1, w: 50, h: 11.2, baseline, fontSize: 10, font: 'Helvetica', family: 'sans-serif', eol: true, angle: 0 });
  const above = run1('Reference', 149);
  const label = run1('Contents', 185);
  const w: WidgetData = { subtype: 'Widget', fieldType: 'Tx', rect: [235, 841.89 - 202, 495, 841.89 - 172], fieldValue: 'Glassware, boxed', defaultAppearanceData: { fontSize: 10, fontName: 'Helv' } };
  const placed = placeFieldRuns([above, label], fieldRuns([w], VT, [above, label]).runs);
  assert.deepEqual(placed.map((x) => [x.str, x.eol]), [['Reference', true], ['Contents', false], ['Glassware, boxed', true]]);
  // Control: a label above the box (not level with it) keeps its own line;
  // the value comes after it, as the nearest line above.
  const high = run1('Contents', 160);
  const alone = placeFieldRuns([above, high], fieldRuns([w], VT, [above, high]).runs);
  assert.deepEqual(alone.map((x) => [x.str, x.eol]), [['Reference', true], ['Contents', true], ['Glassware, boxed', true]]);
});

test('T3-forms-N5: an auto-sized value that reads the same and is fitted to a smaller box changed size', async () => {
  // Shipping label request: the "Consignee" box is 10 pt high instead of 18;
  // the value (auto size) is drawn at 5.9 pt instead of 11.9 pt.
  const r = await run('N5-before', 'N5-after');
  assert.deepEqual(listed(r), ['“Brightwater Labs” size 11.9 → 5.9 pt']);
  // Control: a value made longer is fitted smaller; that size follows from the
  // listed edit (see R3-06), so no size change is listed for its other words.
  const auto = await run('R3-06-auto-before', 'R3-06-auto-after');
  assert.deepEqual(auto.changes.filter((c) => c.kind === 'format'), []);
});

test('T3-forms-V3: an auto-sized value is told from the auto-sized value of the next widget', async () => {
  // Shipping label request, labels above two boxes side by side, so both
  // values come after the label line: "Brightwater Labs" → "Brightwater
  // Labs Ltd" (Consignee), and the Reference box 18 → 10 pt high, its value
  // 77812 the same. The two values were read as one, and the Consignee edit
  // hid the Reference's size change.
  const r = await run('V3-labels-above-before', 'V3-labels-above-after');
  assert.deepEqual(listed(r), ['“77812” size 11.9 → 5.9 pt', 'Added “Ltd” (form field)']);
  // The Consignee words keep no size item: their size follows from the edit.
  assert.deepEqual(r.changes.filter((c) => c.kind === 'format').map((c) => c.new.text), ['77812']);
});
