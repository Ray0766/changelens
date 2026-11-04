// Text at the edge of a page that became narrower or shorter (fix round 8).
// Text is folded into "Content is cut off" only with the evidence a cut
// leaves: PDF.js keeps a glyph that starts inside the page, so the visible
// part of cut text runs across the edge, at the place the same glyphs had.
// An edit that ends inside the page, or a sign removed next to a new left
// edge, is listed as the edit it is. Words wholly outside the new page
// (a full stop after a word cut at its last letter, a line below a new
// bottom edge) belong to the cut too. The PDFs are review-round-7 probes
// (synthetic; reportlab, LibreOffice Writer and Calc, pypdf for the page
// boxes), copied to test/fixtures/probe8-R2-*.pdf and probe8-R7-07-*.pdf.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openPdf } from '../src/node/pdf.ts';
import { extractText } from '../src/pdf/extract.ts';
import { buildDocModel } from '../src/core/tokenize.ts';
import { compareDocs } from '../src/core/compare.ts';
import { describeChange } from '../src/core/describe.ts';
import type { Change, CompareResult } from '../src/core/types.ts';
import { makeDoc, model } from './helpers.ts';

const fixtures = new URL('./fixtures/', import.meta.url).pathname;
async function run(before: string, after: string): Promise<CompareResult> {
  const a = buildDocModel(await extractText(await openPdf(`${fixtures}probe8-${before}.pdf`), 'before.pdf'));
  const b = buildDocModel(await extractText(await openPdf(`${fixtures}probe8-${after}.pdf`), 'after.pdf'));
  return compareDocs(a, b);
}
const listed = (r: CompareResult) => r.changes.map((c) => describeChange('en', c));
const cut = (r: CompareResult, edge: string) => r.changes.filter((c) => c.kind === 'overflow' && c.overflow?.edge === edge);
const texts = (c: Change | undefined) => [c?.old.text, c?.new.text];
const RIGHT = 'Content is cut off at the right edge of the page';
const LEFT = 'Content is cut off at the left edge of the page';
const TOP = 'Content is cut off at the top of the page';
const BOTTOM = 'Content is cut off at the bottom of the page';

test('R2-01: a limit shortened 4 pt inside a narrower right edge is a number change, beside a real cut', async () => {
  // 595 → 550 pt; "1,000,000" → "1,000" ends at x 546; "5,000,000" is really cut to "5,000,0".
  const r = await run('R2-01-before', 'R2-01-edit');
  assert.deepEqual(listed(r), ['Number changed: 1,000,000 → 1,000 (-100%)', RIGHT]);
  assert.deepEqual(texts(cut(r, 'right')[0]), ['5,000,000', '5,000,0']);
  // Control: the same crop without the edit cuts both limits.
  const c = await run('R2-01-before', 'R2-01-cut');
  assert.deepEqual(listed(c), [RIGHT]);
  assert.deepEqual(texts(c.changes[0]), ['1,000,000 5,000,000', '1,000,0 5,000,0']);
});

test('R2-01: the same on a landscape page made with /Rotate 90 (turned-back content)', async () => {
  const r = await run('R2-01-rot-before', 'R2-01-rot-after');
  assert.deepEqual(listed(r), [RIGHT, 'Number changed: 4,800 → 4,300 (-10%)', 'Number changed: 1,000,000 → 1,000 (-100%)']);
  assert.deepEqual(texts(r.changes[0]), ['4,800', '4,8']);
});

test('R2-01: LibreOffice schedule, a limit shortened 3 pt inside the edge', async () => {
  const r = await run('R2-01-lo-before', 'R2-01-lo-edit');
  assert.deepEqual(listed(r), [RIGHT, 'Number changed: 2,500,000 → 2,500 (-100%)']);
  assert.equal(r.changes[0].old.text, '1,000,000 5,000,000');
  const c = await run('R2-01-lo-before', 'R2-01-lo-cut');
  assert.deepEqual(listed(c), [RIGHT]);
  assert.equal(c.changes[0].old.text, '1,000,000 2,500,000 5,000,000');
});

test('R2-02: a sign and a leading digit removed at a new left edge are number changes, beside a real cut', async () => {
  // The old minus spanned the new edge; the new amounts start 3.2 pt inside it.
  const r = await run('R2-02-before', 'R2-02-edit');
  assert.deepEqual(listed(r), ['Number changed: −4,800.00 → 4,800.00 (sign changed)', 'Number changed: 14,800.00 → 4,800.00 (-68%)', LEFT]);
  assert.deepEqual(texts(cut(r, 'left')[0]), ['Ref. 2027/0042', '027/0042']);
  // Control: the same crop without the edit keeps the straddling minus and cuts only the note.
  const c = await run('R2-02-before', 'R2-02-cut');
  assert.deepEqual(listed(c), [LEFT]);
  assert.equal(c.changes[0].old.text, 'Ref. 2027/0042');
  // LibreOffice Calc, hyphen-minus: the same both ways.
  const calc = await run('R2-02-calc-before', 'R2-02-calc-edit');
  assert.deepEqual(listed(calc), ['Number changed: -1,250.00 → 1,250.00 (sign changed)']);
  const calcCut = await run('R2-02-calc-before', 'R2-02-calc-cut');
  assert.deepEqual(listed(calcCut), [LEFT]);
});

test('R2-03: a word really cut on a line that has another edit is part of the cut, not a text change', async () => {
  // Justified: "amount" → "sum" re-spaces the line; "full." keeps its place at the margin and is cut to "fu".
  const just = await run('R2-03-just-before', 'R2-03-just-edit');
  assert.deepEqual(listed(just), [RIGHT, 'Changed “amount” → “sum”']);
  assert.ok(just.changes[0].old.text.includes('full.'), just.changes[0].old.text);
  const justCut = await run('R2-03-just-before', 'R2-03-just-cut');
  assert.deepEqual(texts(justCut.changes[0]), texts(just.changes[0]));
  // Ragged: "30" → "120" pushes "of" 6 pt to the right, where the crop cuts it to "o".
  const rag = await run('R2-03-rag-before', 'R2-03-rag-edit');
  assert.deepEqual(listed(rag), ['Number changed: 30 → 120 (+300%)', RIGHT]);
  assert.deepEqual(texts(rag.changes[1]), ['of', 'o']);
  assert.deepEqual(listed(await run('R2-03-rag-before', 'R2-03-rag-cut')), [RIGHT]);
  // LibreOffice: "Supplier" → "Service Provider" pushes "promptly" 36 pt right, cut to "prom".
  const lo = await run('R2-03-lo-before', 'R2-03-lo-edit');
  assert.deepEqual(listed(lo), [RIGHT, 'Changed “Supplier” → “Service Provider”']);
  assert.deepEqual(texts(lo.changes[0]), ['promptly', 'prom']);
});

test('R2-04: words and full stops that lie wholly outside a narrower page are part of the cut, not deletions', async () => {
  // Each line's last word crosses the 540 pt edge; its full stop lies past it.
  const stops = await run('R2-03-just-before', 'R2-04-stops');
  assert.deepEqual(listed(stops), [RIGHT]);
  assert.equal(stops.changes[0].old.text, '. . . .');
  // The new edge falls in the space before "annex 3.".
  const gap = await run('R2-04-gap-before', 'R2-04-gap-after');
  assert.deepEqual(listed(gap), [RIGHT]);
  assert.equal(gap.changes[0].old.text, 'annex 3.');
  // LibreOffice: two of four lines end in a word gap at the edge.
  const lo = await run('R2-03-lo-before', 'R2-04-lo-gap');
  assert.deepEqual(listed(lo), [RIGHT]);
  assert.ok(['acknowledged', 'Customer'].every((w) => lo.changes[0].old.text.includes(w)), lo.changes[0].old.text);
});

test('R2-05: the same value cut in several rows is one cut, not "Changed … (in 4 places)"', async () => {
  const r = await run('R2-05-before', 'R2-05-after');
  assert.deepEqual(listed(r), [RIGHT]);
  assert.equal(r.changes[0].old.text, 'Approved Approved Approved Approved');
  // Two "Approved" and three "Rejected" cells: all five are cut.
  const lo = await run('R2-05-lo-before', 'R2-05-lo-after');
  assert.deepEqual(listed(lo), [RIGHT]);
  assert.equal(lo.changes[0].old.text, 'Approved Approved Rejected Rejected Rejected');
});

test('R2-07: lines that a lower top or a higher bottom of the page box leaves out are cut off, not deleted', async () => {
  const top = await run('R2-07-top-before', 'R2-07-top-cut');
  assert.deepEqual(listed(top), [TOP]);
  assert.match(top.changes[0].old.text, /^Annual maintenance agreement/);
  // An edit just below the new top edge is listed.
  const edit = await run('R2-07-top-before', 'R2-07-top-edit');
  assert.deepEqual(listed(edit), ['Number changed: MA-2027-114 → MA-2027-141', TOP]);
  const bottom = await run('R2-07-bottom-before', 'R2-07-bottom-cut');
  assert.deepEqual(listed(bottom), [BOTTOM]);
  assert.match(bottom.changes[0].old.text, /^Bank: Example Savings/);
});

test('R2-08: on a page turned by /Rotate 90, a figure cut at the bottom is part of the cut, beside a real edit', async () => {
  const r = await run('R2-08-before', 'R2-08-after');
  assert.deepEqual(listed(r), [BOTTOM, 'Number changed: 4,800 → 4,300 (-10%)']);
  assert.deepEqual(texts(r.changes[0]), ['4,800', '4,80']);
  assert.ok(!r.changes.some((c) => c.numeric?.to === '4,80'));
});

test('R7-07: a page cropped on both sides, where a cut line end and the next cut line start form one hunk', async () => {
  // "Amount EUR" loses EUR at the right; "Consulting" loses its C at the left, and so on per row.
  const r = await run('R7-07-before', 'R7-07-both');
  assert.deepEqual(listed(r).sort(), [LEFT, RIGHT]);
  assert.equal(cut(r, 'left')[0].old.text, 'Item Consulting Travel Licence Training Total');
  assert.equal(cut(r, 'right')[0].old.text, 'EUR 17,760.00 2,480.00 930.00 2,300.00 23,470.00');
  // A real edit on such a row is listed.
  const e = await run('R7-07-before', 'R7-07-both-edit');
  assert.deepEqual(listed(e).sort(), [LEFT, RIGHT, 'Number changed: 12 → 15 (+25%)'].sort());
  // A delivery note: "pcs" at the right and the next label at the left.
  const v = await run('R7-07-v-before', 'R7-07-v-after');
  assert.deepEqual(listed(v).sort(), [LEFT, RIGHT]);
  assert.equal(cut(v, 'right')[0].old.text, 'pcs pcs pcs pcs pcs');
  assert.equal(cut(v, 'left')[0].old.text, 'Pallet Carton Crate Bundle Box');
});

test('R2-14: many shortened figures on pages that keep their size compare in linear time', () => {
  // 300 pages of prose and one-figure lines, every figure shorter (1,234.56 → 987.65).
  const mk = (v: number) => {
    const ps: string[][][] = [];
    for (let p = 0; p < 300; p++) {
      const paras: string[][] = [[`Section ${p + 1}. The supplier keeps these prices for the whole term of the agreement.`]];
      for (let q = 0; q < 10; q++) paras.push([`Clause ${p + 1}.${q + 1} The prices below include packing and delivery to the site named in the order, but not VAT or customs duties.`]);
      const amounts: string[] = [];
      for (let k = 0; k < 36; k++) {
        const n = 1000 + ((p * 37 + k * 11) % 9000);
        amounts.push(v ? `${((n * 0.73) % 999).toFixed(2)}` : `${Math.floor(n / 1000)},${String(n % 1000).padStart(3, '0')}.${String(k).padStart(2, '0')}`);
      }
      paras.push(amounts);
      ps.push(paras);
    }
    return model(makeDoc(v ? 'b' : 'a', ps));
  };
  const a = mk(0);
  const b = mk(1);
  const t0 = performance.now();
  const r = compareDocs(a, b);
  const ms = performance.now() - t0;
  assert.ok(r.changes.filter((c) => c.numeric).length >= 10000, String(r.changes.length));
  // About 1.6 s on the 4-core test VM; 13–16 s when each figure scanned the whole document.
  assert.ok(ms < 6000, `took ${ms.toFixed(0)} ms`);
});
