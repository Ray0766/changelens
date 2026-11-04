// Form fields (fix round 6): a comb field's cells are one value ("40213",
// not five digits), and a printed label that runs on under its field's
// widget is still the field's label, so the value reads after it. The PDF is
// a round-5 probe (synthetic; reportlab, values written by pypdf), copied to
// test/fixtures/probe6-p15-*.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openPdf } from '../src/node/pdf.ts';
import { extractText, placeFieldRuns } from '../src/pdf/extract.ts';
import { buildDocModel } from '../src/core/tokenize.ts';
import { compareDocs } from '../src/core/compare.ts';
import { describeChange } from '../src/core/describe.ts';
import type { CompareResult, TextRun } from '../src/core/types.ts';

const fixtures = new URL('./fixtures/', import.meta.url).pathname;
async function probe(id: string): Promise<CompareResult> {
  const a = buildDocModel(await extractText(await openPdf(`${fixtures}probe6-${id}-before.pdf`), 'before.pdf'));
  const b = buildDocModel(await extractText(await openPdf(`${fixtures}probe6-${id}-after.pdf`), 'after.pdf'));
  return compareDocs(a, b);
}
const listed = (r: CompareResult) => r.changes.map((c) => describeChange('en', c));

test('a comb field’s value is one number, located in its field, without a percentage (fm04, p15)', async () => {
  // Postcode 40213 → 40231 (5 cells) and account 4417099213 → 4417099813 (10 cells).
  const r = await probe('p15');
  assert.deepEqual(listed(r), ['Number changed: 40213 → 40231 (form field)', 'Number changed: 4417099213 → 4417099813 (form field)']);
  // Widgets at x 235–335 and 235–435 (PDF user space; y from the top 113–131 and 143–161).
  const boxes = [
    { x: 235, w: 100, y: 113 },
    { x: 235, w: 200, y: 143 },
  ];
  r.changes.forEach((c, k) => {
    for (const s of [c.old, c.new]) {
      assert.equal(s.rects.length, 1);
      const q = s.rects[0].rect;
      assert.ok(q.x >= boxes[k].x - 1 && q.x + q.w <= boxes[k].x + boxes[k].w + 1 && q.y >= boxes[k].y - 1 && q.y + q.h <= boxes[k].y + 19, JSON.stringify(q));
    }
  });
});

test('a field value follows its label when the label runs on under the widget (fm07)', () => {
  const run = (str: string, x: number, w: number, field = false): TextRun => ({
    str,
    x,
    y: 120,
    w,
    h: 11,
    baseline: 129,
    fontSize: 10,
    font: 'Body',
    family: 'sans-serif',
    eol: true,
    angle: 0,
    ...(field ? { field: true as const } : {}),
  });
  // Two rows; the second row's label (x 56–254) passes under its field (x 235).
  const content = [{ ...run('Loan period in days', 56, 90), y: 90, baseline: 99 }, run('Deposit to be paid in cash at the store (EUR)', 56, 198)];
  const value = run('250.00', 238, 31, true);
  const out = placeFieldRuns(content, [[value]]);
  assert.deepEqual(
    out.map((r) => r.str),
    ['Loan period in days', 'Deposit to be paid in cash at the store (EUR)', '250.00'],
  );
  // Label and value form one line.
  assert.equal(out[1].eol, false);
  assert.equal(out[2].eol, true);
});
