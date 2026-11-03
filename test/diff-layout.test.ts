// Formatting, positions and grouping of nearby edits.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareDocs } from '../src/core/compare.ts';
import { describeChange } from '../src/core/describe.ts';
import type { DocText, TextRun } from '../src/core/types.ts';
import { makeDoc, model } from './helpers.ts';

/** Pages with a centred heading, left-aligned body lines and a right-aligned signature line. */
function aligned(font: string, widthFactor: number, pages: number, signatureLeft = false): DocText {
  const W = 595;
  return {
    name: font,
    pages: Array.from({ length: pages }, (_, pi) => {
      const runs: TextRun[] = [];
      const add = (str: string, y: number, align: 'left' | 'center' | 'right', size = 11) => {
        const w = str.length * size * 0.5 * widthFactor;
        const x = align === 'left' ? 56 : align === 'right' ? 539 - w : (W - w) / 2;
        runs.push({ str, x, y: y - size * 0.9, w, h: size * 1.1, baseline: y, fontSize: size, font, family: 'serif', eol: true, angle: 0 });
      };
      let y = 90;
      add(`Schedule ${pi + 1}: Prices and Payment Terms`, y, 'center', 14);
      y += 34;
      for (let k = 0; k < 8; k++, y += 16) add(`Clause ${pi + 1}.${k + 1} applies to all orders placed under this schedule`, y, 'left');
      add('Signed in Berlin on 1 November 2026 by the parties', y + 20, signatureLeft && pi === 0 ? 'left' : 'right');
      return { index: pi, width: W, height: 842, runs };
    }),
  };
}

test('a substituted font does not make centred or right-aligned lines "moved"', () => {
  const r = compareDocs(model(aligned('LiberationSerif', 1, 5)), model(aligned('DejaVuSans', 1.15, 5)));
  assert.deepEqual(r.changes.map((c) => c.kind), ['format']);
  // Wider glyphs under the same font name (no formatting change detected):
  // each line keeps its alignment edge.
  const same = compareDocs(model(aligned('Body-Regular', 1, 5)), model(aligned('Body-Regular', 1.15, 5)));
  assert.deepEqual(same.changes.map((c) => c.kind), []);
  // A line that really moved is still reported.
  const moved = compareDocs(model(aligned('Body-Regular', 1, 2)), model(aligned('Body-Regular', 1, 2, true)));
  assert.deepEqual(moved.changes.map((c) => describeChange('en', c)), ['“Signed in Berlin on 1 November …” moved 73 mm to the left']);
});

/** Lines made of [text, bold] segments, one line per paragraph. */
function styled(paras: [string, boolean][][], bodyFont = 'LiberationSerif'): DocText {
  const runs: TextRun[] = [];
  let y = 90;
  for (const segs of paras) {
    let x = 56;
    segs.forEach(([s, bold], k) => {
      const w = s.length * 5.5;
      runs.push({ str: s, x, y: y - 9.9, w, h: 12.1, baseline: y, fontSize: 11, font: bold ? `${bodyFont}-Bold` : bodyFont, family: 'serif', eol: k === segs.length - 1, angle: 0 });
      x += w + 2.75;
    });
    y += 30;
  }
  return { name: 'x', pages: [{ index: 0, width: 595, height: 842, runs }] };
}

test('unrelated words set in bold stay separate changes', () => {
  const mk = (b: boolean): [string, boolean][][] => [
    [['The supplier shall', false], ['not', b], ['subcontract any part of the work without consent.', false]],
    [['Clause 7 covers delivery dates and the place of delivery for each order.', false]],
    [['The licence granted under this agreement is', false], ['exclusive', b], ['for the territory.', false]],
    [['Clause 9 covers the warranty period for the goods supplied.', false]],
    [['The cap on liability is', false], ['5,000', b], ['euros per claim.', false]],
  ];
  const r = compareDocs(model(styled(mk(false))), model(styled(mk(true))));
  assert.deepEqual(r.changes.map((c) => describeChange('en', c)), ['“not” now bold', '“exclusive” now bold', '“5,000” now bold']);
});

test('a font replaced throughout is one change that keeps every place', () => {
  const paras = Array.from({ length: 6 }, (_, k): [string, boolean][] => [[`Clause ${k + 1} applies to every order placed under this agreement.`, false]]);
  const r = compareDocs(model(styled(paras, 'LiberationSerif')), model(styled(paras, 'DejaVuSans')));
  assert.equal(r.changes.length, 1);
  const c = r.changes[0];
  assert.equal(c.places, 6);
  assert.equal(c.parts?.length, 6);
  assert.deepEqual(
    c.parts!.map((p) => p.new.text),
    paras.map((p) => p[0][0]),
  );
  // old.rects / new.rects cover all places (the visual stage relies on this).
  assert.equal(c.new.rects.length, c.parts!.reduce((n, p) => n + p.new.rects.length, 0));
  assert.equal(c.old.rects.length, c.parts!.reduce((n, p) => n + p.old.rects.length, 0));
  assert.equal(new Set(c.new.rects.map((r) => r.rect.y)).size, 6);
});

test('independent Chinese edits on consecutive lines stay separate', () => {
  const P0 = ['本合同由甲乙双方在平等自愿的基础上签订，双方应当共同遵守。'];
  const o = ['乙方收到款项后应当在五个工作日内向甲方开具发票并通知甲方财务部门', '乙方对在履行本合同过程中知悉的甲方商业信息负有保密义务'];
  const n = ['乙方收到款项后不应当在五个工作日内向甲方开具发票并通知甲方财务部门', '乙方对在履行本合同过程中知悉的甲方商业信息负有严格保密义务'];
  const r = compareDocs(model(makeDoc('a', [[P0, o]])), model(makeDoc('b', [[P0, n]])));
  assert.deepEqual(r.changes.map((c) => describeChange('zh', c)), ['新增「不」', '新增「严格」']);
  // A new column in a Chinese table (short row labels between the cells) is still one change.
  const rows = (extra: boolean) => ['项目负责人 140', '设计总监 150', '首席工程师 145', '内容策略师 110'].map((l, k) => (extra ? `${l} ${185 + k * 5}` : l));
  const t = compareDocs(model(makeDoc('a', [[P0, rows(false)]])), model(makeDoc('b', [[P0, rows(true)]])));
  assert.equal(t.changes.length, 1, t.changes.map((c) => describeChange('zh', c)).join(' | '));
});

test('a new table column is grouped the same way whatever else was edited', () => {
  const intro = ['The prices below apply to all orders placed from the first of next month.'];
  const added = ['This new paragraph was inserted at the top of the price list by the sales department for clarity.'];
  const rowsA = ['Pens 10 2', 'Ink 4 8', 'Pad 12 1', 'Tape 6 3'];
  const later = 'Orders above the stated amount qualify for free delivery to any address within the country and the delivery is made within five working days of the order'.split(' ');
  for (let w = 0; w < later.length; w++) {
    const r = compareDocs(
      model(makeDoc('a', [[intro, rowsA, [later.join(' ')]]])),
      model(makeDoc('b', [[added, intro, rowsA.map((l) => `${l} EUR`), [later.filter((_, k) => k !== w).join(' ')]]])),
    );
    const eur = r.changes.filter((c) => c.kind === 'insert' && c.new.text.includes('EUR'));
    assert.deepEqual(eur.map((c) => c.new.text), ['EUR … EUR … EUR … EUR'], `deleting word ${w}`);
  }
});

test('time grows about linearly with document size when a font is replaced throughout', () => {
  const page = (n: number) =>
    Array.from({ length: 6 }, (_, k) => [`Clause ${n}.${k} the supplier delivers item ${n * 7 + k} to the buyer`, `within ${k + 3} working days of the order placed on page ${n}.`]);
  const time = (pages: number) => {
    const content = Array.from({ length: pages }, (_, n) => page(n));
    const a = model(makeDoc('a', content, { font: 'LiberationSerif' }));
    const b = model(makeDoc('b', content, { font: 'DejaVuSans' }));
    let best = Infinity;
    for (let k = 0; k < 3; k++) {
      const t0 = performance.now();
      const r = compareDocs(a, b);
      best = Math.min(best, performance.now() - t0);
      assert.equal(r.changes.length, 1);
    }
    return best;
  };
  time(50); // warm-up
  const small = time(100);
  const large = time(800);
  // Before: about 19× for 8× the pages (per-page scans of all tokens).
  assert.ok(large < 14 * small, `100 pages: ${small.toFixed(0)} ms, 800 pages: ${large.toFixed(0)} ms`);
});
