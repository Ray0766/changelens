import type { Change, CompareResult, Rect } from './types.ts';
import { sortAndNumber } from './compare.ts';
import { compareRasters, dedupeGraphics, visualPairs, type Raster } from './visual.ts';

export type RenderFn = (page: number) => Promise<Raster>;

/**
 * Add visual (graphic / colour) changes to a text comparison. Pages are
 * rendered on demand through the supplied callbacks and released as soon
 * as no later page pair needs them.
 */
export async function addVisualChanges(
  result: CompareResult,
  renderOld: RenderFn,
  renderNew: RenderFn,
  onProgress?: (done: number, total: number) => void,
): Promise<Change[]> {
  const pairs = visualPairs(result);
  const cacheOld = new Map<number, Promise<Raster>>();
  const cacheNew = new Map<number, Promise<Raster>>();
  const found: Change[] = [];
  for (let k = 0; k < pairs.length; k++) {
    const [op, np] = pairs[k];
    if (!cacheOld.has(op)) cacheOld.set(op, renderOld(op));
    if (!cacheNew.has(np)) cacheNew.set(np, renderNew(np));
    const [ra, rb] = await Promise.all([cacheOld.get(op)!, cacheNew.get(np)!]);
    found.push(...compareRasters(result, op, np, ra, rb));
    const rest = pairs.slice(k + 1);
    for (const p of [...cacheOld.keys()]) if (!rest.some(([o]) => o === p)) cacheOld.delete(p);
    for (const p of [...cacheNew.keys()]) if (!rest.some(([, n]) => n === p)) cacheNew.delete(p);
    onProgress?.(k + 1, pairs.length);
  }
  const visual = dedupeGraphics(found.filter((c) => !c.minor));
  const shifts = found.filter((c) => c.minor);
  result.minor = [...result.minor.filter((c) => c.consequence), ...shifts].sort((a, b) => a.order - b.order);
  result.minor.forEach((c, k) => (c.id = 'm' + (k + 1)));
  result.ignored.minorShifts = shifts.length;
  result.changes.push(...visual);
  sortAndNumber(result.changes);
  return visual;
}

export interface Counts {
  total: number;
  text: number;
  numbers: number;
  visual: number;
}

export function countChanges(changes: Change[]): Counts {
  return {
    total: changes.length,
    text: changes.filter((c) => c.category === 'text').length,
    numbers: changes.filter((c) => c.numeric).length,
    visual: changes.filter((c) => c.category === 'visual').length,
  };
}

/** Rect enclosing everything a change touches on one page (for zooming / cropping). */
export function focusRect(c: Change, side: 'old' | 'new', page?: number): { page: number; rect: Rect } | null {
  const s = c[side];
  const p = page ?? s.rects[0]?.page ?? s.caret?.page;
  if (p === undefined) return null;
  const rects = s.rects.filter((r) => r.page === p).map((r) => r.rect);
  if (rects.length === 0 && s.caret && s.caret.page === p) rects.push({ x: s.caret.x - 1, y: s.caret.y, w: 2, h: s.caret.h });
  if (rects.length === 0) return null;
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
  return { page: p, rect: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } };
}
