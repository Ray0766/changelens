// Overflow check after a template change (fix round 4): a new template
// moves the text block of most pages, on the left or only on the right; a
// table widened into the margins moves only the block of its own page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareDocs } from '../src/core/compare.ts';
import { describeChange } from '../src/core/describe.ts';
import type { DocText, TextRun } from '../src/core/types.ts';
import { model } from './helpers.ts';

const run11 = (str: string, x: number, y: number, w: number, eol: boolean): TextRun => ({ str, x, y: y - 10, w, h: 12, baseline: y, fontSize: 11, font: 'Body-Regular', family: 'sans-serif', eol, angle: 0 });
const words = 'the contractor keeps a written log of every visit and shares it with the facilities manager'.split(' ');
/** Justified lines from `left` to `right`. */
function body(left: number, right: number, lines = 12): TextRun[] {
  const runs: TextRun[] = [];
  for (let k = 0; k < lines; k++) {
    const step = (right - left) / words.length;
    words.forEach((w, i) => {
      const width = Math.min(step - 3, w.length * 5.5);
      runs.push(run11(w, i === words.length - 1 ? right - width : left + i * step, 90 + k * 16, width, i === words.length - 1));
    });
  }
  return runs;
}
/** A table of 5 columns from `left` to `right`, one row per line. */
function table(left: number, right: number): TextRun[] {
  const runs: TextRun[] = [];
  const w = (right - left) / 5;
  for (let r = 0; r < 16; r++) for (let j = 0; j < 5; j++) runs.push(run11(j ? `EUR ${100 + r * 7 + j}` : `Item ${r + 1}`, left + j * w + 2, 90 + r * 16, 40, j === 4));
  return runs;
}
const doc = (pages: TextRun[][]): DocText => ({ name: 'd', pages: pages.map((runs, index) => ({ index, width: 595, height: 842, runs })) });

test('a table widened into both margins on one page is overflow, though its rows are most of that page', () => {
  const r = compareDocs(model(doc([body(72, 523), table(72, 520)])), model(doc([body(72, 523), table(42, 526)])));
  const o = r.changes.filter((c) => c.kind === 'overflow');
  assert.equal(o.length, 1, r.changes.map((c) => describeChange('en', c)).join(' | '));
  assert.deepEqual(o[0].new.pages, [1]);
});

test('a narrower right margin only, justified or ragged, is not overflow', () => {
  const r = compareDocs(model(doc([body(57, 499), body(57, 499)])), model(doc([body(57, 539), body(57, 539)])));
  assert.ok(!r.changes.some((c) => c.kind === 'overflow'), r.changes.map((c) => describeChange('en', c)).join(' | '));
  // Ragged: the words of a paragraph wrapped at the measure, the last line short.
  const ragged = (measure: number): TextRun[] => {
    const runs: TextRun[] = [];
    let y = 90;
    for (let p = 0; p < 4; p++) {
      let x = 57;
      const text = [...words, ...words, ...words].slice(p, 40 + p);
      text.forEach((w, i) => {
        const width = w.length * 5.5;
        if (x + width > measure) {
          runs[runs.length - 1].eol = true;
          x = 57;
          y += 16;
        }
        runs.push(run11(w, x, y, width, i === text.length - 1));
        x += width + 3;
      });
      y += 30;
    }
    return runs;
  };
  const g = compareDocs(model(doc([ragged(499), ragged(499)])), model(doc([ragged(539), ragged(539)])));
  assert.ok(!g.changes.some((c) => c.kind === 'overflow'), g.changes.map((c) => describeChange('en', c)).join(' | '));
});
