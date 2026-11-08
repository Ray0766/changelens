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

test('T1: the lines of a side note drawn after the footer are not read into the lines that end where the note starts', async () => {
  // A note floated right with no margin beside ragged text: some lines of
  // the paragraph end within a word space of where the note's lines start.
  // The note's lines stand one under the other at one x, so they are a
  // block, not words set against the paragraph's.
  const r = await pair('float-before', 'float-after');
  assert.deepEqual(listed(r), ['Added “and eastern”']);
  for (const d of [r.oldDoc, r.newDoc]) {
    const t = lineTexts(d);
    assert.ok(t.includes('for station 4 are provisional until'), JSON.stringify(t));
    assert.ok(!t.some((l) => /per minute.*provisional/.test(l)), JSON.stringify(t));
  }
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

test('T1: the markers of a footnote list drawn after the footer read the same in both versions when a footnote is added', async () => {
  // Chromium (<sup> markers in a 9 pt list) and reportlab (6.5 pt markers
  // drawn last, before each footnote line), gen9/probe9-T1e.*. With two
  // footnotes, the list's markers stand one under the other at one x: they
  // are single words, each set against its footnote, not a block drawn
  // last. A paragraph is inserted at the top as well.
  for (const [a, b] of [
    ['fnlist-one', 'fnlist-two'],
    ['rlfn-one', 'rlfn-two'],
  ]) {
    const r = await pair(a, b);
    assert.deepEqual(listed(r), ['Added a paragraph', 'Added “2”', 'Added “2 Hose sets are sold in pairs only.”'], a);
    for (const d of [r.oldDoc, r.newDoc]) assert.ok(lineTexts(d).includes('1 Calibration certificates are kept by the SYNTHETIC district office.'), JSON.stringify(lineTexts(d)));
    assert.ok(lineTexts(r.newDoc).includes('2 Hose sets are sold in pairs only.'), JSON.stringify(lineTexts(r.newDoc)));
  }
  // Control: the lines of a side note at one x are still a block, not words
  // set against the lines that end where the note starts.
  const f = await pair('float-before', 'float-after');
  assert.deepEqual(listed(f), ['Added “and eastern”']);
  for (const d of [f.oldDoc, f.newDoc]) assert.ok(!lineTexts(d).some((l) => /per minute.*provisional/.test(l)), JSON.stringify(lineTexts(d)));
});

test('T1: a right-aligned or centred side note drawn after the footer is not read into the lines it stands beside', async () => {
  // Chromium and reportlab (gen9/probe9-T1e.*): a note right-aligned or
  // centred 1 to 2 pt from a paragraph, so each of its lines ends a word
  // space from where the paragraph line beside it starts. Its lines end at
  // one x or share a centre: a block drawn last. A line of words in the
  // paragraph's size is not set against the paragraph's words either.
  for (const [a, b] of [
    ['rnote-before', 'rnote-body'],
    ['cnote-before', 'cnote-body'],
    ['rlnote-before', 'rlnote-body'],
  ]) {
    const r = await pair(a, b);
    assert.deepEqual(listed(r), ['Added “and eastern”'], b);
    for (const d of [r.oldDoc, r.newDoc]) {
      const t = lineTexts(d);
      assert.ok(t.includes('office confirms the calibration') && t.includes('certificate.'), JSON.stringify(t));
      assert.ok(!t.some((l) => /Note: the SYNTHETIC ./.test(l)), JSON.stringify(t));
    }
  }
  // An edit in the note is the word it is.
  assert.deepEqual(listed(await pair('rnote-before', 'rnote-note')), ['Changed “calibration” → “new”']);
  // Control: a word styled position: relative, at full size, is still read
  // where it is set against the words of its line (see the test above).
  assert.deepEqual(listed(await pair('word-before', 'word-new')), ['Added “new”']);
});

test('T1: a footnote marker drawn under a positioned line of words is read on its own line in both versions', async () => {
  // Chromium (gen9/probe9-T1e.mjs): a line styled position: relative right
  // above a line that ends with a marker; the marker is drawn right after
  // it, under its words in one version and past its end in the other. A
  // marker set smaller than that line is no line of a block with it.
  const r = await pair('sumline-before', 'sumline-short');
  assert.deepEqual(listed(r), ['Deleted “inspected all stations”']);
  for (const d of [r.oldDoc, r.newDoc]) assert.ok(lineTexts(d).some((l) => /per minute\. ?1$/.test(l)), JSON.stringify(lineTexts(d)));
  assert.deepEqual(r.oldDoc.pages[0].outOfOrder, r.newDoc.pages[0].outOfOrder);
});

test('T1: a narrow side note of one word, or a few Chinese characters, per line is read as a block', async () => {
  // Chromium (gen9/probe9-T1e.mjs): a note 6 to 6.5 em wide floated left,
  // text-align: right, right against a paragraph, in the paragraph's size.
  // Each of its lines is a single word (or at most six Chinese characters)
  // that ends a word space from where the paragraph line beside it starts.
  // They are the lines of a block drawn last, not markers set against those
  // lines: an insertion in the paragraph is the insertion alone.
  for (const [a, b, edit, line] of [
    ['wnote-before', 'wnote-body', 'Added “and eastern”', 'provisional'],
    ['znote-before', 'znote-body', 'Added “和东部”', '注：四号站读'],
  ]) {
    const r = await pair(a, b);
    assert.deepEqual(listed(r), [edit], b);
    for (const d of [r.oldDoc, r.newDoc]) assert.ok(lineTexts(d).includes(line), JSON.stringify(lineTexts(d)));
  }
  assert.deepEqual(listed(await pair('wnote-before', 'wnote-note')), ['Changed “calibration” → “new”']);
  // Control: footnote markers, single words set smaller than their lines,
  // are still placed on their lines (see the footnote-list test above).
  assert.deepEqual(listed(await pair('fnlist-one', 'fnlist-two')), ['Added a paragraph', 'Added “2”', 'Added “2 Hose sets are sold in pairs only.”']);
});

test('T1: a narrow side note set smaller than the text, one word or a few Chinese characters per line, is read as a block', async () => {
  // Chromium (gen9/probe9-T1f.mjs): a note 3.2 em wide in 9 pt, or 4.5 em
  // wide in Chinese at 8 pt, floated right against a justified 11 pt
  // paragraph. Its lines ("held", "until", "次到访") are single words set
  // smaller than the lines they stand on, but no footnote markers, which
  // are figures, letters or symbols of one or two characters: the note's
  // lines are a block drawn last, not words set against the paragraph.
  for (const [a, b, edit] of [
    ['snote-before', 'snote-body', 'Added “and eastern”'],
    ['snote-before', 'snote-note', 'Changed “held” → “final”'],
    ['sznote-before', 'sznote-body', 'Added “和东区”'],
  ]) {
    const r = await pair(a, b);
    assert.deepEqual(listed(r), [edit], b);
    for (const d of [r.oldDoc, r.newDoc]) assert.equal(d.pages[0].outOfOrder?.placed ?? 0, 0, b);
  }
  // Control: the markers of a footnote list, one under the other, are still
  // placed against their footnotes (see the footnote-list test above).
  assert.deepEqual(listed(await pair('fnlist-one', 'fnlist-two')), ['Added a paragraph', 'Added “2”', 'Added “2 Hose sets are sold in pairs only.”']);
  assert.deepEqual(listed(await pair('rlfn-one', 'rlfn-two')), ['Added a paragraph', 'Added “2”', 'Added “2 Hose sets are sold in pairs only.”']);
});

test('T1: a narrow note of two Chinese characters or two-letter words per line is no list of footnote markers', async () => {
  // Fifth pass: a note set smaller than the text, floated beside a
  // paragraph, with lines such as "暂时" or "be" was taken for footnote
  // markers one under the other, so it skipped the block guard and was read
  // into the paragraph on a re-wrap. A marker is figures, one Latin letter,
  // a small roman numeral or a few symbols. Probes from
  // gen9/probe9-T1m.mjs (Chromium) and gen9/probe9-T1m.py (reportlab).
  for (const [a, b, edit] of [
    ['m2note-before', 'm2note-ins', 'Added “和东区”'],
    ['m3note-before', 'm3note-ins', 'Added “and eastern”'],
    ['r2note-before', 'r2note-ins', 'Added “和东区”'],
  ]) {
    assert.deepEqual(listed(await pair(a, b)), [edit], b);
  }
  // Controls: real markers of three figures and roman numerals are still
  // placed against their words.
  assert.deepEqual(listed(await pair('r1big-before', 'r1big-add')), ['Added “123”', 'Added 9 words']);
  assert.deepEqual(listed(await pair('m1roman-before', 'm1roman-word')), ['Changed “litres” → “carefully”']);
  assert.deepEqual(listed(await pair('fnlist-one', 'fnlist-two')), ['Added a paragraph', 'Added “2”', 'Added “2 Hose sets are sold in pairs only.”']);
});
