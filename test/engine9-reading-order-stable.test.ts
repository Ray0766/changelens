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
import type { CompareResult, DocModel } from '../src/core/types.ts';

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
