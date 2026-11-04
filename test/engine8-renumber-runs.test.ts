// Which numbered runs count as evidence for a renumbering (fix round 8).
// The round-6 rule needs the label to number on from 1 among its siblings,
// and the shift to equal the net number of siblings added above it. Lists
// that continue another part's numbering ("12."–"19." in a schedule) never
// started at 1, so their renumbering was listed. The PDFs are the round-7
// adversarial probes (synthetic), copied to test/fixtures/probe8-*; the
// counter-examples are built in code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openPdf } from '../src/node/pdf.ts';
import { extractText } from '../src/pdf/extract.ts';
import { buildDocModel } from '../src/core/tokenize.ts';
import { compareDocs } from '../src/core/compare.ts';
import { describeChange } from '../src/core/describe.ts';
import type { CompareResult, DocText, TextRun } from '../src/core/types.ts';

const fixtures = new URL('./fixtures/', import.meta.url).pathname;
async function probe(id: string): Promise<CompareResult> {
  const a = buildDocModel(await extractText(await openPdf(`${fixtures}probe8-${id}-before.pdf`), 'before.pdf'));
  const b = buildDocModel(await extractText(await openPdf(`${fixtures}probe8-${id}-after.pdf`), 'after.pdf'));
  return compareDocs(a, b);
}
const listed = (r: CompareResult) => r.changes.map((c) => describeChange('en', c));
const minor = (r: CompareResult) => r.minor.map((c) => describeChange('en', c).replace('List renumbered: ', ''));

/** Paragraphs as a word processor sets them: the label, then the text after a tab; 20 pt apart. */
function items(name: string, rows: [string, string][]): DocText {
  const runs: TextRun[] = [];
  const run = (str: string, x: number, y: number, eol = false): TextRun => ({ str, x, y: y - 9, w: str.length * 5, h: 11, baseline: y, fontSize: 10, font: 'Body', family: 'sans-serif', eol, angle: 0 });
  rows.forEach(([label, text], k) => runs.push(run(label, 56, 80 + 20 * k), run(text, 90, 80 + 20 * k, true)));
  return { name, pages: [{ index: 0, width: 595, height: 842, runs }] };
}
const P = ['Incidents are reported to the service desk.', 'The Supplier answers each call within one hour.', 'A fix is applied within one working day.', 'Each incident is closed in writing.', 'Reports are sent every month.'];
const compare = (a: DocText, b: DocText) => compareDocs(buildDocModel(a), buildDocModel(b));

test('a list that continues another part’s numbering is renumbered after an inserted paragraph (R7-03)', async () => {
  // Chromium: schedule paragraphs 12.–19., one inserted as 14. Control: the same list from 1.
  const r = await probe('r7-03-contlist');
  assert.deepEqual(listed(r), ['Added a paragraph']);
  assert.ok(r.changes[0].new.text.startsWith('14. Priority 3 incidents'), r.changes[0].new.text);
  assert.deepEqual(minor(r), ['14 → 15', '15 → 16', '16 → 17', '17 → 18', '18 → 19', '19 → 20']);
  const ctl = await probe('r7-03-contlistctl');
  assert.deepEqual(listed(ctl), ['Added a paragraph']);
  assert.equal(ctl.ignored.renumbered, 6);
  // reportlab: committee minutes 41.–46., an item inserted as 43.
  const v = await probe('r7-03-r03v');
  assert.deepEqual(listed(v), ['Added a paragraph']);
  assert.deepEqual(minor(v), ['43 → 44', '44 → 45', '45 → 46', '46 → 47']);
});

test('a continued list renumbered by hand, or started at another number, is listed (R7-03 counter-examples)', () => {
  const old: [string, string][] = P.map((t, k) => [`${12 + k}.`, t]);
  // 14. and 15. become 15. and 16. with nothing inserted: the list reads 12, 13, 15, 16, 17.
  const byHand = old.map(([l, t], k): [string, string] => [k >= 2 && k < 4 ? `${13 + k}.` : l, t]);
  const r = compare(items('a', old), items('b', byHand));
  assert.deepEqual(listed(r), ['Number changed: 14 → 15', 'Number changed: 15 → 16']);
  assert.equal(r.ignored.renumbered, 0);
  // The whole list moved from 12.–16. to 13.–17.: it does not start at the same number.
  const shifted = old.map(([, t], k): [string, string] => [`${13 + k}.`, t]);
  const s = compare(items('a', old), items('b', shifted));
  assert.equal(s.changes.filter((c) => c.numeric).length, 5, JSON.stringify(listed(s)));
  assert.equal(s.ignored.renumbered, 0);
  // Control: a paragraph inserted at the top of the continued list explains all of it.
  const top: [string, string][] = [['12.', 'Security incidents are reported at once.'], ...shifted];
  const t = compare(items('a', old), items('b', top));
  assert.deepEqual(listed(t), ['Added “12. Security incidents are reported at once.”']);
  assert.equal(t.ignored.renumbered, 5);
});
