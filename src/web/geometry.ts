/**
 * Viewer geometry without DOM access, so it can be tested in Node: where a
 * reading position sits on a page, where to scroll to show a change, and
 * which part of a page to render at full detail.
 */

/** A reading position: a page and a distance from its top, in PDF points. */
export interface PageAnchor {
  page: number;
  offset: number;
}

/**
 * The page under pixel position `y` of a pane whose pages start at `tops`
 * (pixels, at `zoom` pixels per point). Positions in the gap below a page
 * belong to that page; positions above the first page to the first page.
 */
export function anchorAt(tops: number[], zoom: number, y: number): PageAnchor {
  let page = 0;
  for (let i = 1; i < tops.length && tops[i] <= y; i++) page = i;
  return { page, offset: (y - (tops[page] ?? 0)) / (zoom || 1) };
}

/**
 * Pixel position of an anchor in the pane's current layout. Zooming scales
 * the pages but not the fixed padding and gaps between them, so a position
 * must be kept as page + offset; scaling the pixel position would move the
 * view by (gaps above it) × (zoom factor − 1).
 */
export function anchorY(tops: number[], zoom: number, a: PageAnchor): number {
  return (tops[a.page] ?? 0) + a.offset * zoom;
}

/**
 * Scroll position along one axis that shows the span [start, start + size)
 * in a view of `view` pixels: its centre at `at` of the view (0.5: the
 * middle), but never further than `margin` pixels past its start. A span
 * too long for that (a long line at high zoom, a tall paragraph) is shown
 * from its start, where reading begins, instead of being cut off at both
 * ends.
 */
export function scrollToShow(start: number, size: number, view: number, margin: number, at = 0.5): number {
  return Math.max(0, Math.min(start + size / 2 - view * at, start - margin));
}

/**
 * Device pixels per PDF point for a page of width x height pt, so that its
 * bitmap stays within `maxPixels` and the browser's side limit.
 */
export function cappedScale(width: number, height: number, wanted: number, maxPixels: number, maxSide = 16384): number {
  // The canvas is rounded up to whole pixels: the largest s with
  // (width·s + 1)(height·s + 1) <= maxPixels.
  const a = width * height;
  const b = width + height;
  const fit = (-b + Math.sqrt(b * b + 4 * a * (maxPixels - 1))) / (2 * a);
  return Math.min(wanted, fit, (maxSide - 1) / width, (maxSide - 1) / height);
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Part of a page to render at full detail when its whole bitmap had to be
 * capped (as the PDF.js viewer's detail view does): the visible part of the
 * page plus up to half its size on each side, within `maxPixels` device
 * pixels. All boxes in CSS pixels relative to the page; `dpr` is device
 * pixels per CSS pixel. Null when the page is not visible.
 */
export function detailArea(page: { w: number; h: number }, visible: Box, dpr: number, maxPixels: number): Box | null {
  const v = visiblePart(page, visible);
  if (!v) return null;
  const pixels = v.w * v.h * dpr * dpr;
  if (pixels > maxPixels) return null;
  // Grow the visible part by the same fraction on each side (at most half
  // a view), so that short scrolls need no new render.
  const grow = Math.max(0, Math.min(0.5, (Math.sqrt(maxPixels / pixels) - 1) / 2));
  const x = Math.max(0, v.x - v.w * grow);
  const y = Math.max(0, v.y - v.h * grow);
  return { x, y, w: Math.min(page.w, v.x + v.w * (1 + grow)) - x, h: Math.min(page.h, v.y + v.h * (1 + grow)) - y };
}

/** The part of `visible` that lies on a page of the given size, or null. */
export function visiblePart(page: { w: number; h: number }, visible: Box): Box | null {
  const x0 = Math.max(0, visible.x);
  const y0 = Math.max(0, visible.y);
  const x1 = Math.min(page.w, visible.x + visible.w);
  const y1 = Math.min(page.h, visible.y + visible.h);
  return x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
}

/** True when `inner` lies inside `outer` (with a half-pixel tolerance). */
export function contains(outer: Box, inner: Box): boolean {
  const e = 0.5;
  return inner.x >= outer.x - e && inner.y >= outer.y - e && inner.x + inner.w <= outer.x + outer.w + e && inner.y + inner.h <= outer.y + outer.h + e;
}
