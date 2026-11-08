// New side margins on justified text: the page moved, not the lines.
// Fixtures: synthetic Chromium PDFs (25 → 20 mm side margins, 12 pt text,
// made by a review script), committed as test/fixtures/margins-justified-*.pdf.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openPdf } from '../src/node/pdf.ts';
import { extractText } from '../src/pdf/extract.ts';
import { buildDocModel } from '../src/core/tokenize.ts';
import { compareDocs } from '../src/core/compare.ts';
import { describeChange } from '../src/core/describe.ts';

const dir = new URL('./fixtures/', import.meta.url).pathname;
const load = async (f: string) => buildDocModel(await extractText(await openPdf(dir + f), f));

test('the last line of each justified paragraph is not "moved" when both side margins change', async () => {
  const r = compareDocs(await load('margins-justified-before.pdf'), await load('margins-justified-after.pdf'));
  const positions = r.changes.filter((c) => c.kind === 'position');
  assert.deepEqual(positions.map((c) => describeChange('en', c)), []);
});
