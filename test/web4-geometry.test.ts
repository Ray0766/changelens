import { test } from 'node:test';
import assert from 'node:assert/strict';
import { anchorAt, anchorY, cappedScale, detailArea, scrollToShow } from '../src/web/geometry.ts';

// Page tops of a pane with 16 px padding and 16 px gaps (viewer.ts).
const tops = (n: number, h: number, zoom: number) => Array.from({ length: n }, (_, i) => 16 + i * (h * zoom + 16));

test('a reading position survives zooming as page + offset, also on late pages', () => {
  const H = 842;
  for (const page of [0, 3, 59]) {
    const before = tops(80, H, 1);
    const y = before[page] + 300; // 300 px into the page at 100%
    const at = anchorAt(before, 1, y);
    assert.deepEqual(at, { page, offset: 300 });
    const after = tops(80, H, 1.2);
    // The same text: 360 px into the same page at 120%.
    assert.equal(anchorY(after, 1.2, at), after[page] + 360);
  }
  // Above the first page and in a gap: the nearest page above (or the first).
  assert.equal(anchorAt(tops(3, H, 1), 1, 4).page, 0);
  assert.equal(anchorAt(tops(3, H, 1), 1, 16 + H + 8).page, 0);
});

test('a change that fits is centred; a wider or taller one is shown from its start', () => {
  assert.equal(scrollToShow(1000, 100, 500, 24), 800); // centred
  assert.equal(scrollToShow(1000, 1200, 500, 24), 976); // start 24 px from the edge
  assert.equal(scrollToShow(10, 1200, 500, 24), 0);
  // Vertically a third down when it fits, else from its top.
  assert.equal(scrollToShow(2000, 100, 900, 24, 0.35), 2050 - 315);
  assert.equal(scrollToShow(2000, 800, 900, 24, 0.35), 1976);
});

test('the detail area covers the visible part of a capped page, within its pixel budget', () => {
  const page = { w: 2980, h: 4210 };
  const visible = { x: 1200, y: 1500, w: 390, h: 700 };
  const a = detailArea(page, visible, 2, 2_621_440)!;
  assert.ok(a.x <= 1200 && a.y <= 1500 && a.x + a.w >= 1590 && a.y + a.h >= 2200, JSON.stringify(a));
  assert.ok(a.w * a.h * 4 <= 2_621_440 * 1.0001);
  // Clipped to the page; nothing for a page out of view.
  const edge = detailArea(page, { x: -100, y: -300, w: 390, h: 700 }, 2, 2_621_440)!;
  assert.ok(edge.x === 0 && edge.y === 0);
  assert.equal(detailArea(page, { x: 0, y: 5000, w: 390, h: 700 }, 2, 2_621_440), null);
  // A capped page bitmap stays within the cap.
  const s = cappedScale(595, 842, 10, 5_242_880);
  assert.ok(Math.ceil(595 * s) * Math.ceil(842 * s) <= 5_242_880);
});
