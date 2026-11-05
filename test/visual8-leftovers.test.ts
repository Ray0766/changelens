// Visual stage, fix round 8, third pass: what the re-verifier of the second
// pass left open (V1-L*). Fixtures test/fixtures/probe8-V1-L*-*.pdf are
// copies of the re-verifier's SYNTHETIC counter-probes (Chromium, reportlab,
// pypdf /Rotate), and of two of the fixer's (reportlab,
// probe8-V1-L4-g-check and -long-check-kept).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openPdf } from '../src/node/pdf.ts';
import { renderPage, canRender } from '../src/node/render.ts';
import { extractText } from '../src/pdf/extract.ts';
import { buildDocModel } from '../src/core/tokenize.ts';
import { compareDocs } from '../src/core/compare.ts';
import { addVisualChanges } from '../src/core/pipeline.ts';
import { describeChange } from '../src/core/describe.ts';
import type { Change, CompareResult } from '../src/core/types.ts';

const fixtures = new URL('./fixtures/', import.meta.url).pathname;
const skip = !(await canRender()) && 'no canvas';

async function run(before: string, after: string): Promise<CompareResult> {
  const pa = await openPdf(fixtures + before);
  const pb = await openPdf(fixtures + after);
  const r = compareDocs(buildDocModel(await extractText(pa, 'old')), buildDocModel(await extractText(pb, 'new')));
  await addVisualChanges(r, (p) => renderPage(pa, p, 1.5), (p) => renderPage(pb, p, 1.5));
  return r;
}
const list = (cs: Change[]) => cs.map((c) => describeChange('en', c));
const graphics = (r: CompareResult) => r.changes.filter((c) => c.kind === 'graphic' && !c.format && !c.pageChange);
const hits = (c: Change, side: 'old' | 'new', page: number, x: number, y: number) =>
  c[side].rects.some((q) => q.page === page - 1 && x >= q.rect.x - 2 && x <= q.rect.x + q.rect.w + 2 && y >= q.rect.y - 2 && y <= q.rect.y + q.rect.h + 2);

test('V1-L1: a word underlined on a shaded header row is listed when another edit sits on the row', { skip }, async () => {
  // Chromium order table, header cells on #dde4f0 whose band ends right
  // under the words; "Amount" underlined (offset 1.5 pt) and a 6 pt red
  // square added after "Item". Before: only "Graphic or image changed" for
  // the square. reportlab: the same with "Qty".
  for (const [a, b, word, x, y] of [
    ['probe8-V1-L1-before.pdf', 'probe8-V1-L1-ul-tick.pdf', 'Amount', 98, 130],
    ['probe8-V1-L1-b-before.pdf', 'probe8-V1-L1-b-ul-qty-tick.pdf', 'Qty', 0, 0],
  ] as const) {
    const r = await run(a, b);
    assert.ok(list(r.changes).includes(`Underlined: “${word}”`), `${b}: ${list(r.changes).join(' | ')}`);
    assert.equal(graphics(r).length, 1, `${b}: ${list(r.changes).join(' | ')}`);
    if (x) assert.ok(hits(graphics(r)[0], 'new', 1, x, y), JSON.stringify(graphics(r)[0].new.rects));
  }
  // Offset 2 pt: the underline lies partly below the band, where the
  // graphics comparison sees it. Before: "Graphic or image added" there and
  // no underline; now the underline, with that place.
  const low = await run('probe8-V1-L1-before.pdf', 'probe8-V1-L1-ul2pt-tick.pdf');
  assert.deepEqual(list(low.changes).sort(), ['Graphic or image changed', 'Underlined: “Amount”']);
  // Controls: the square alone is the only item; a red rule drawn along a
  // Calc header band's lower edge, past its words, is a graphic and no
  // underline (see N2 in visual8-refix).
  const tick = await run('probe8-V1-L1-before.pdf', 'probe8-V1-L1-tick.pdf');
  assert.deepEqual(list(tick.changes), ['Graphic or image changed']);
  const band = await run('probe8-R5-13-before.pdf', 'probe8-N2-calc-rule-noins.pdf');
  assert.ok(!list(band.changes).some((d) => d.startsWith('Underlined')), list(band.changes).join(' | '));
  assert.ok(graphics(band).some((c) => hits(c, 'new', 3, 200, 88)), list(band.changes).join(' | '));
});

test('V1-L3: an underline drawn on past its line where the other version has no rule is an underline', { skip }, async () => {
  // reportlab letter: the line underlined from its start to 16 pt past its
  // end; a name underlined to 60 pt past it. Before: only "Graphic or image
  // added" for the part past the text.
  const deposit = await run('probe8-V1-L3-before.pdf', 'probe8-V1-L3-ul16.pdf');
  assert.ok(list(deposit.changes).includes('Underlined: “The deposit of 1,800.00 is refu…”'), list(deposit.changes).join(' | '));
  const name = await run('probe8-V1-L3-before.pdf', 'probe8-V1-L3-name-ul60.pdf');
  assert.ok(list(name.changes).includes('Underlined: “Tenant: Adaeze Okafor”'), list(name.changes).join(' | '));
  // The controls of R5-12 and R5-V02 (visual8-appearance) hold: a table
  // rule or a band edge that both versions have along a re-flowed row is
  // no underline.
  const w = await run('probe8-R5-12-before.pdf', 'probe8-R5-12-reflow.pdf');
  assert.ok(!list(w.changes).some((d) => d.startsWith('Underline')), list(w.changes).join(' | '));
  const d = await run('probe8-R5-V02-before.pdf', 'probe8-R5-V02-two-notes.pdf');
  assert.deepEqual(list(d.changes), ['Added 2 paragraphs']);
});
