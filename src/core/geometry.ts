import type { Rect } from './types.ts';

export function union(rects: Rect[]): Rect {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const r of rects) {
    x0 = Math.min(x0, r.x);
    y0 = Math.min(y0, r.y);
    x1 = Math.max(x1, r.x + r.w);
    y1 = Math.max(y1, r.y + r.h);
  }
  if (x0 === Infinity) return { x: 0, y: 0, w: 0, h: 0 };
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function expand(r: Rect, dx: number, dy = dx): Rect {
  return { x: r.x - dx, y: r.y - dy, w: r.w + 2 * dx, h: r.h + 2 * dy };
}

export function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

export function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

export function area(r: Rect): number {
  return Math.max(0, r.w) * Math.max(0, r.h);
}

/**
 * Merge rects that sit on the same text line and touch (or nearly touch), so
 * that a changed phrase is highlighted as one box instead of one per word.
 */
export function mergeLineRects(rects: Rect[], gapFactor = 0.6): Rect[] {
  const sorted = [...rects].sort((a, b) => a.y - b.y || a.x - b.x);
  const out: Rect[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last) {
      const sameLine = Math.abs(last.y - r.y) < 0.5 * Math.min(last.h, r.h) && Math.abs(last.h - r.h) < 0.5 * Math.max(last.h, r.h);
      const gap = r.x - (last.x + last.w);
      if (sameLine && gap < gapFactor * Math.max(last.h, r.h) && gap > -last.w) {
        const u = union([last, r]);
        out[out.length - 1] = u;
        continue;
      }
    }
    out.push({ ...r });
  }
  return out;
}
