// Form field values (AcroForm text and choice fields) are drawn by widget
// annotations, not by the page content: they are read from the widgets and
// compared, located and described like page text. Fields whose value cannot
// be read are named in a notice. Uses the round-4 form PDF
// (eval/cases/holdout4-g-form-values, synthetic).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openPdf } from '../src/node/pdf.ts';
import { renderPage, canRender } from '../src/node/render.ts';
import { extractText, fieldRuns, placeFieldRuns, type WidgetData } from '../src/pdf/extract.ts';
import { buildDocModel } from '../src/core/tokenize.ts';
import { compareDocs } from '../src/core/compare.ts';
import { addVisualChanges } from '../src/core/pipeline.ts';
import { describeChange, notices } from '../src/core/describe.ts';
import type { Rect, TextRun } from '../src/core/types.ts';
import { makeDoc, model } from './helpers.ts';

const dir = new URL('../eval/cases/holdout4-g-form-values/', import.meta.url).pathname;
const skip = !(await canRender()) && 'no canvas';
/** PDF.js viewport transform of an unrotated A4 page at scale 1. */
const VT = [1, 0, 0, -1, 0, 841.89];
/** A widget rect [x0, y0, x1, y1] (PDF user space) as a top-left rect. */
const box = (r: number[]): Rect => ({ x: r[0], y: 841.89 - r[3], w: r[2] - r[0], h: r[3] - r[1] });
const inside = (r: Rect, b: Rect) => r.x >= b.x - 1 && r.y >= b.y - 1 && r.x + r.w <= b.x + b.w + 1 && r.y + r.h <= b.y + b.h + 1;

async function docs() {
  const a = buildDocModel(await extractText(await openPdf(dir + 'before.pdf'), 'before.pdf'));
  const b = buildDocModel(await extractText(await openPdf(dir + 'after.pdf'), 'after.pdf'));
  return { a, b };
}

test('changed form field values are compared as text, located in the field and said to be form values', async () => {
  const { a, b } = await docs();
  const r = compareDocs(a, b);
  const text = r.changes.filter((c) => c.category === 'text');
  assert.deepEqual(
    text.map((c) => describeChange('en', c)),
    ['Number changed: 14 → 21 (+50%) (form field)', 'Number changed: 250.00 → 400.00 (+60%) (form field)', 'Changed “Ana Duarte” → “Tomas Reid” (form field)'],
  );
  // Each value sits in its widget's box ("Loan period", "Deposit", "Collected by").
  const widgets = [box([235, 415.89, 535, 433.89]), box([235, 388.89, 535, 406.89]), box([235, 196.89, 535, 214.89])];
  text.forEach((c, k) => {
    for (const s of [c.old, c.new]) {
      assert.equal(s.rects.length, 1);
      assert.ok(inside(s.rects[0].rect, widgets[k]), JSON.stringify([s.rects[0].rect, widgets[k]]));
    }
    assert.equal(c.field, true);
  });
  // The label is context: the value reads on the label's line.
  assert.match(text[0].contextBefore, /days\) 借用天数$/);
  // Unchanged values are matched text, not changes; nothing is left uncompared.
  assert.ok(a.tokens.some((t) => t.field && t.text === 'Marsh'));
  assert.ok(!notices('en', r).some((n) => n.level === 'warn'));
});

test('a multi-line text field gives one line per shown line, inside the field', async () => {
  const { b } = await docs();
  // The "Purpose" field (three lines), first line on its label's line.
  const purpose = box([235, 263.89, 535, 315.89]);
  const lines = b.lines.filter((l) => b.tokens.slice(l.start, l.end).some((t) => t.field && inside(t.rects[0], purpose)));
  assert.deepEqual(
    lines.map((l) => b.tokens.slice(l.start, l.end).filter((t) => t.field).map((t) => t.text).join(' ')),
    ['Survey of the east car park extension .', 'The meter is returned to Store B', 'at the end of the loan .'],
  );
  assert.match(lines[0].text, /^Purpose of the loan 借用用途 Survey/);
  for (const l of lines) for (const t of b.tokens.slice(l.start, l.end).filter((t) => t.field)) assert.ok(inside(t.rects[0], purpose), t.text);
});

test('the visual stage does not list a changed field value again as a graphic', { skip }, async () => {
  const pa = await openPdf(dir + 'before.pdf');
  const pb = await openPdf(dir + 'after.pdf');
  const r = compareDocs(buildDocModel(await extractText(pa, 'a')), buildDocModel(await extractText(pb, 'b')));
  await addVisualChanges(r, (p) => renderPage(pa, p, 1.5), (p) => renderPage(pb, p, 1.5));
  const graphics = r.changes.filter((c) => c.category === 'visual');
  // Only the ticked check box (it stays visual), at the "Insurance required" box.
  assert.equal(graphics.length, 1, JSON.stringify(graphics.map((c) => [describeChange('en', c), c.new.rects])));
  const tick = graphics[0].new.rects[0].rect;
  assert.ok(Math.abs(tick.x - 235) < 4 && Math.abs(tick.y - 466) < 6, JSON.stringify(tick));
});

/** A text widget as PDF.js reports it. */
const widget = (rect: number[], extra: Partial<WidgetData>): WidgetData => ({
  subtype: 'Widget',
  fieldType: 'Tx',
  rect,
  defaultAppearanceData: { fontSize: 10, fontName: 'Helv' },
  ...extra,
});

test('choice fields show their selected option; password, rotated and unreadable fields are counted', () => {
  const f = fieldRuns(
    [
      widget([100, 700, 300, 718], { fieldType: 'Ch', combo: true, fieldValue: ['b'], options: [{ exportValue: 'a', displayValue: 'Annual' }, { exportValue: 'b', displayValue: 'Quarterly' }] }),
      widget([100, 670, 300, 688], { fieldValue: '12 May 2026' }),
      widget([100, 640, 300, 658], { password: true, fieldValue: 'secret' }),
      widget([100, 610, 300, 628], { rotation: 90, fieldValue: 'Sideways' }),
      widget([100, 580, 300, 598], { fieldValue: 42 as unknown as string }),
      widget([100, 550, 300, 568], { hidden: true, fieldValue: 'Not shown' }),
      widget([100, 520, 113, 533], { fieldType: 'Btn', checkBox: true, fieldValue: 'Yes' }),
      widget([100, 490, 300, 508], { fieldValue: '' }),
    ],
    VT,
    [],
  );
  assert.deepEqual(
    f.runs.map((g) => g.map((r) => r.str)),
    [['Quarterly'], ['12 May 2026']],
  );
  // Password, rotated widget, non-text value.
  assert.equal(f.unread, 3);
  for (const g of f.runs) for (const run of g) assert.equal(run.field, true);
  // Without an appearance the value is centred vertically in the box: its baseline is inside it.
  const run = f.runs[1][0];
  assert.ok(run.baseline > 841.89 - 688 && run.baseline < 841.89 - 670, String(run.baseline));
});

test('a value already printed in the page content is not compared twice', () => {
  const content: TextRun[] = [
    { str: '12 May 2026', x: 102, y: 841.89 - 688 + 4, w: 55, h: 11, baseline: 841.89 - 674, fontSize: 10, font: 'Helvetica', family: 'sans-serif', eol: true, angle: 0 },
  ];
  assert.equal(fieldRuns([widget([100, 670, 300, 688], { fieldValue: '12 May 2026' })], VT, content).runs.length, 0);
});

test('a field value is read on its label’s line, and a long value wraps inside its box', () => {
  const label: TextRun = { str: 'Start date', x: 56, y: 150, w: 45, h: 11, baseline: 159, fontSize: 10, font: 'Helvetica', family: 'sans-serif', eol: true, angle: 0 };
  const next: TextRun = { ...label, str: 'Next label', y: 180, baseline: 189 };
  const f = fieldRuns([widget([235, 841.89 - 164, 535, 841.89 - 146], { textContent: ['9 Nov 2026'], textPosition: [2, 5.4] })], VT, [label, next]);
  const runs = placeFieldRuns([label, next], f.runs);
  assert.deepEqual(runs.map((r) => r.str), ['Start date', '9 Nov 2026', 'Next label']);
  const doc = buildDocModel({ name: 'x', pages: [{ index: 0, width: 595.28, height: 841.89, runs }] });
  assert.equal(doc.lines[0].text, 'Start date 9 Nov 2026');
  // Two fields after one label (day and month boxes) read on that line too.
  const two = fieldRuns(
    [widget([235, 841.89 - 164, 265, 841.89 - 146], { fieldValue: '09' }), widget([270, 841.89 - 164, 300, 841.89 - 146], { fieldValue: '11' })],
    VT,
    [label, next],
  );
  const doc2 = buildDocModel({ name: 'x', pages: [{ index: 0, width: 595.28, height: 841.89, runs: placeFieldRuns([label, next], two.runs) }] });
  assert.deepEqual(doc2.lines.map((l) => l.text), ['Start date 09 11', 'Next label']);
  // A multi-line field whose value is one long line: wrapped to the box width.
  const long = 'The meter is returned to Store B at the end of the loan and checked by the store team before the next loan.';
  const wrapped = fieldRuns([widget([235, 500, 435, 560], { multiLine: true, fieldValue: long })], VT, []).runs[0];
  assert.ok(wrapped.length >= 3, String(wrapped.length));
  for (const r of wrapped) assert.ok(r.x >= 235 && r.x + r.w <= 435 + 0.5, JSON.stringify(r));
  assert.equal(wrapped.map((r) => r.str).join(' '), long);
});

test('form fields that could not be read are named in a warning', () => {
  const a = model(makeDoc('a', [[['Applicant name and department are filled in below.']]]));
  const b = model(makeDoc('b', [[['Applicant name and department are filled in below.']]]));
  b.pages[0].fieldsUnread = 2;
  const notes = notices('en', compareDocs(a, b));
  assert.ok(notes.some((n) => n.level === 'warn' && n.text === 'New version p. 1: 2 form fields could not be compared as text (password, rotated or unreadable values); they are compared as images only.'), JSON.stringify(notes));
  b.pages[0].fieldsUnread = -1;
  assert.ok(notices('zh', compareDocs(a, b)).some((n) => n.level === 'warn' && n.text.includes('表单字段无法读取')));
});
