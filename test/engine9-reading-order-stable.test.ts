// Fix round 9, area T1 (reading order), third pass: a line drawn after the
// footer is placed by its position only where the evidence for the place is
// stable under small layout differences, so that unchanged text reads the
// same in both versions. The probes are SYNTHETIC Chromium pages whose
// position: fixed footer is declared first in the DOM, so that positioned
// content (a floated side note, footnote markers) is drawn after it; nothing
// was re-typed. They are made by test/fixtures/gen9/probe9-T1c.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openPdf } from '../src/node/pdf.ts';
import { extractText } from '../src/pdf/extract.ts';
import { buildDocModel } from '../src/core/tokenize.ts';
import { compareDocs } from '../src/core/compare.ts';
import { describeChange } from '../src/core/describe.ts';
import type { CompareResult, DocModel, TextRun } from '../src/core/types.ts';

const fixtures = new URL('./fixtures/', import.meta.url).pathname;
const load = async (name: string) => buildDocModel(await extractText(await openPdf(`${fixtures}probe9-T1-${name}.pdf`), name));
const pair = async (a: string, b: string): Promise<CompareResult> => compareDocs(await load(a), await load(b));
const listed = (r: CompareResult) => r.changes.map((c) => describeChange('en', c));
const lineTexts = (d: DocModel) => d.lines.map((l) => l.text);

test('T1: a side note drawn after the footer is not read into the rows of a list because a table stands above the list', async () => {
  // The price table's last row has a cell over the note; in the old version
  // the list starts 2.2 em under that row, in the new one a paragraph
  // inserted between them puts it 4.6 em under. The note is no cell of the
  // table, so it is read in the same place in both versions.
  const r = await pair('sidenote-before', 'sidenote-after');
  assert.deepEqual(listed(r), ['Added a paragraph']);
  for (const d of [r.oldDoc, r.newDoc]) {
    assert.ok(lineTexts(d).includes('Customer Harbourside Clinics Ltd'), JSON.stringify(lineTexts(d)));
    assert.ok(lineTexts(d).includes('Order no. SO-2026-0417'));
  }
  // The real edit in the note is listed as the word it is, not as the
  // note deleted and added.
  const e = await pair('sidenote-before', 'sidenote-edit');
  assert.deepEqual(listed(e), ['Added a paragraph', 'Changed “seal” → “spare”']);
  // Control: a value re-typed into a table row is still put into its row
  // by the cell of another row of the same table (engine9-reading-order).
  const f = compareDocs(
    buildDocModel(await extractText(await openPdf(`${fixtures}probe9-T1-firstrow-before.pdf`), 'a')),
    buildDocModel(await extractText(await openPdf(`${fixtures}probe9-T1-firstrow-after.pdf`), 'b')),
  );
  assert.deepEqual(listed(f), ['Number changed: 240.00 → 260.00 (+8.3%)', 'Deleted “18.50”']);
  assert.deepEqual(f.newDoc.pages[0].outOfOrder, { placed: 1 });
});

test('T1: footnote markers drawn after the footer are read on their lines in both versions', async () => {
  // normalize.css / Tailwind markers (75 %, top: -0.5em) stand 3.7 to
  // 4.5 pt above the baseline of 11 pt text, as Chromium rounds them: right
  // at a baseline tolerance of 0.35 em. A paragraph inserted at the top
  // moves every marker; the only other change is "March" -> "April".
  const r = await pair('sup-before', 'sup-after');
  assert.deepEqual(listed(r), ['Added a paragraph', 'Changed “March” → “April”']);
  // Each marker that stands inside a line or at the end of a line whose
  // neighbours reach past it is read on that line, in both versions.
  for (const d of [r.oldDoc, r.newDoc]) {
    const t = lineTexts(d);
    assert.ok(t.some((l) => /in spring\. ?1 The flow/.test(l)), JSON.stringify(t));
    assert.ok(t.some((l) => /^litres per minute\. ?2$/.test(l)), JSON.stringify(t));
    assert.ok(t.some((l) => /worn seals ?3 and/.test(l)), JSON.stringify(t));
    assert.ok(t.some((l) => /^out of service\. ?5$/.test(l)), JSON.stringify(t));
  }
  assert.deepEqual(r.oldDoc.pages[0].outOfOrder, r.newDoc.pages[0].outOfOrder);
  // Control: the same pages with the footer declared last, so that the
  // markers are drawn in reading order: the same two changes, nothing placed.
  const c = await pair('supend-before', 'supend-after');
  assert.deepEqual(listed(c), ['Added a paragraph', 'Changed “March” → “April”']);
  assert.equal(c.oldDoc.pages[0].outOfOrder, undefined);
  assert.equal(c.newDoc.pages[0].outOfOrder, undefined);
});

// Fourth pass: markers whose place on the page a real edit moves. The
// probes are made by test/fixtures/gen9/probe9-T1d.mjs.

test('T1: footnote markers read the same in both versions when a one-word edit re-wraps the line they stand on', async () => {
  // "March" -> "April" brings "The readings" up a line: markers 4 and 5 now
  // stand on one baseline, drawn one after the other, and 5 at the end of
  // the line under a short line. Each is set against its word, so it is read
  // with that word in both versions, whatever lines stand around it.
  const r = await pair('rewrap-before', 'rewrap-april');
  assert.deepEqual(listed(r), ['Changed “March” → “April”']);
  for (const d of [r.oldDoc, r.newDoc]) {
    const t = lineTexts(d);
    assert.ok(t.some((l) => /calibrated in (March|April)\. ?4 The/.test(l)), JSON.stringify(t));
    assert.ok(t.some((l) => /readings ?5( are|$)/.test(l)), JSON.stringify(t));
    assert.ok(t.some((l) => /out of service\. ?6$/.test(l)), JSON.stringify(t));
  }
  const all = await pair('rewrap-before', 'rewrap-all');
  assert.deepEqual(listed(all), ['Changed “The” → “All”']);
  // Control: the same pages with the footer declared last, markers drawn in
  // reading order: the same change, nothing placed.
  const c = await pair('rewrapend-before', 'rewrapend-april');
  assert.deepEqual(listed(c), ['Changed “March” → “April”']);
  assert.equal(c.newDoc.pages[0].outOfOrder, undefined);
});

test('T1: a word drawn after the footer reads the same in both versions when an edit moves it to the end of a line', async () => {
  // Words styled position: relative (at full size) are drawn after the
  // footer. Deleting "outlet" or adding "new" moves "readings" or "years"
  // between the end of a line and its middle. Set a word space after the
  // word before it, each is read there in both versions.
  assert.deepEqual(listed(await pair('word-before', 'word-outlet')), ['Deleted “outlet”']);
  const r = await pair('word-before', 'word-new');
  assert.deepEqual(listed(r), ['Added “new”']);
  for (const d of [r.oldDoc, r.newDoc]) {
    const t = lineTexts(d);
    assert.ok(t.some((l) => /(^|The )readings( are|$)/.test(l)), JSON.stringify(t));
    assert.ok(t.some((l) => /for ten years ?\.$/.test(l)), JSON.stringify(t));
  }
  // Each of the seven words is placed, in both versions: none is left as a
  // line of its own.
  const lone = /^(spring|visit|seals|plan|readings|years|service)$/;
  for (const d of [r.oldDoc, r.newDoc]) assert.deepEqual(lineTexts(d).filter((l) => lone.test(l)), []);
});

test('T1: a marker raised 0.7 em at 85 % is read on its line in both versions, and a raised marker does not join two paragraphs', async () => {
  // Chromium rounds the raise to 6.0 pt in one version and 6.75 pt in the
  // other: about half the marker's height inside its line either way. Set
  // against its word, it is on its line with a quarter of its height there.
  const r = await pair('raise7-before', 'raise7-after');
  assert.deepEqual(listed(r), ['Added a paragraph', 'Changed “March” → “April”']);
  for (const d of [r.oldDoc, r.newDoc]) assert.ok(lineTexts(d).some((l) => /out of service\. ?6$/.test(l)), JSON.stringify(lineTexts(d)));
  assert.deepEqual(r.oldDoc.pages[0].outOfOrder, r.newDoc.pages[0].outOfOrder);
  // Raised 0.8 em, the markers are placed too. The gap to the line above is
  // measured without a placed marker, so the inserted paragraph stays a
  // paragraph of its own ("Added a paragraph", not "Added 19 words").
  const h = await pair('raise8-before', 'raise8-after');
  assert.deepEqual(listed(h), ['Added a paragraph', 'Changed “March” → “April”']);
  assert.ok(lineTexts(h.newDoc).some((l) => /in spring\. ?1 The flow/.test(l)), JSON.stringify(lineTexts(h.newDoc)));
});

test('T1: a marker drawn apart from its word is not listed as moved when a re-wrap moves the word', async () => {
  // "service⁸." is one text run around the marker, so the marker is not
  // placed: it stays a line of its own at the end of the page. "autumn" ->
  // "late autumn" moves "service." 13 mm to the right, and the marker with it.
  const r = await pair('punct-before', 'punct-late');
  assert.deepEqual(listed(r), ['Added “late”']);
  // Control: a small line that moves away from the word it was set against
  // is listed as moved.
  const page = (markerX: number, words: string) => {
    const runs: TextRun[] = [];
    const run = (str: string, x: number, baseline: number, size = 11): TextRun => ({ str, x, y: baseline - 0.9 * size, w: str.length * 0.5 * size, h: 1.1 * size, baseline, fontSize: size, font: 'Body-Regular', family: 'sans-serif', eol: true, angle: 0 });
    ['Alpha beta gamma delta epsilon', 'Zeta eta theta iota kappa', words, 'Lambda mu nu xi omicron', 'Pi rho sigma tau upsilon'].forEach((s, k) => {
      runs.push(run(s, 56, 90 + 16 * k));
      if (k === 2) runs.push(run('8', markerX, 90 + 16 * k - 6, 7));
    });
    return buildDocModel({ name: 'm', pages: [{ index: 0, width: 595, height: 842, runs }] });
  };
  const end = (s: string) => 56 + s.length * 5.5;
  const words = 'Phi chi psi omega final';
  const edited = 'Phi chi psi long omega final';
  // The word moved by the edit, and the marker with it: no move listed.
  assert.deepEqual(listed(compareDocs(page(end(words), words), page(end(edited), edited))), ['Added “long”']);
  // The marker moved 44 pt to the right, away from its word.
  assert.deepEqual(listed(compareDocs(page(end(words), words), page(end(words) + 44, words))), ['“8” moved 16 mm to the right']);
});
