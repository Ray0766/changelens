// Where an addition or deletion is marked on the side where nothing stands
// (fix round 8). Text added at the end of a page's content (a stamp drawn
// last, a closing sentence) is marked at the end of that page in the other
// version, not at the top of the next one. The PDFs are review-round-7
// probes (synthetic; Chromium and reportlab), copied to test/fixtures/probe8-*.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openPdf } from '../src/node/pdf.ts';
import { extractText } from '../src/pdf/extract.ts';
import { buildDocModel } from '../src/core/tokenize.ts';
import { compareDocs } from '../src/core/compare.ts';
import { describeChange, pageLabel } from '../src/core/describe.ts';
import type { CompareResult } from '../src/core/types.ts';
import { makeDoc, model } from './helpers.ts';

const fixtures = new URL('./fixtures/', import.meta.url).pathname;
async function run(before: string, after: string): Promise<CompareResult> {
  const a = buildDocModel(await extractText(await openPdf(`${fixtures}probe8-${before}.pdf`), 'before.pdf'));
  const b = buildDocModel(await extractText(await openPdf(`${fixtures}probe8-${after}.pdf`), 'after.pdf'));
  return compareDocs(a, b);
}
/** Description and old → new pages (1-based). */
const placed = (r: CompareResult) => r.changes.map((c) => `${describeChange('en', c)} ${c.old.pages.map((p) => p + 1).join(',')}→${c.new.pages.map((p) => p + 1).join(',')}`);

test('R6-07: a paragraph added at the end of a section that ends a page is marked on that page', async () => {
  const r = await run('R6-07-before', 'R6-07-after');
  assert.deepEqual(placed(r), ['Added a paragraph 1→1']);
  assert.equal(r.changes[0].old.caret?.page, 0);
  assert.equal(pageLabel('en', r.changes[0].old.pages), 'p. 1');
});

test('R4-20: a stamp drawn last on its page is marked on the same old page', async () => {
  const r = await run('R4-20-before', 'R4-20-after');
  assert.deepEqual(placed(r), ['Added “PAID” 1→1', 'Added “RECEIVED” 2→2', 'Added “CHECKED” 3→3']);
  const v = await run('R4-20-v-before', 'R4-20-v-after');
  assert.deepEqual(placed(v), ['Added “PAID” 1→1']);
});

test('R6-07 control: a paragraph added at the top of a page, and one deleted from a page end, are marked where the text continues', () => {
  const p1 = [['First page paragraph one with enough words to stand alone.'], ['First page paragraph two closes the page.']];
  const p2 = [['Second page paragraph one opens the page.'], ['Second page paragraph two follows it.']];
  const a = model(makeDoc('a', [p1, p2]));
  // Added at the top of page 2: the caret is before the first word of old page 2.
  const top = compareDocs(a, model(makeDoc('b', [p1, [['A new paragraph that opens the second page.'], ...p2]])));
  assert.deepEqual(placed(top), ['Added “A new paragraph that opens the second page.” 2→2']);
  // Added at the end of page 1: after the last word of old page 1.
  const end = compareDocs(a, model(makeDoc('b', [[...p1, ['A new paragraph that closes the first page.']], p2])));
  assert.deepEqual(placed(end), ['Added “A new paragraph that closes the first page.” 1→1']);
  // Deleted from the end of page 1: the new caret is on page 1.
  const del = compareDocs(model(makeDoc('a', [[...p1, ['A paragraph that closes the first page.']], p2])), model(makeDoc('b', [p1, p2])));
  assert.deepEqual(placed(del), ['Deleted “A paragraph that closes the first page.” 1→1']);
});
