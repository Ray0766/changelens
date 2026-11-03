import type { Change, DocModel, Rect, Side, Token } from './types.ts';
import { mergeLineRects } from './geometry.ts';
import { joinTokens } from './tokenize.ts';

type Edge = 'left' | 'right' | 'top' | 'bottom' | 'margin';

const EDGE_TOL = 1.5;
const MARGIN_TOL = 12;

/** Text that reaches (or crosses) the physical page edge is cut off. */
function edgeOf(r: Rect, w: number, h: number): Edge | null {
  if (r.x + r.w > w - EDGE_TOL) return 'right';
  if (r.x < EDGE_TOL) return 'left';
  if (r.y + r.h > h - EDGE_TOL) return 'bottom';
  if (r.y < EDGE_TOL) return 'top';
  return null;
}

/** Horizontal text extent of the old document, per page width. */
function bodyExtents(doc: DocModel, toks: Token[]): Map<number, { left: number; right: number }> {
  const m = new Map<number, { left: number; right: number }>();
  for (const t of toks) {
    const w = Math.round(doc.pages[t.page].width);
    const e = m.get(w) ?? { left: Infinity, right: -Infinity };
    for (const r of t.rects) {
      e.left = Math.min(e.left, r.x);
      e.right = Math.max(e.right, r.x + r.w);
    }
    m.set(w, e);
  }
  return m;
}

/**
 * Find text in the new document that is cut off by the page edge, or that
 * sticks out into the margin further than anything in the old document —
 * typically a table or a long line that no longer fits.
 */
export function findOverflow(oldDoc: DocModel, newDoc: DocModel, A: Token[], B: Token[], pairs: Int32Array): Change[] {
  const matchedOld = new Map<number, Token>();
  for (let p = 0; p < pairs.length; p += 2) matchedOld.set(pairs[p + 1], A[pairs[p]]);
  const extents = bodyExtents(oldDoc, A);

  const wasOverflowing = (k: number): boolean => {
    const o = matchedOld.get(k);
    if (!o) return false;
    const pg = oldDoc.pages[o.page];
    return o.rects.some((r) => edgeOf(r, pg.width, pg.height) !== null);
  };

  const perPage = new Map<number, { edge: Edge; toks: Token[]; idx: number[] }>();
  B.forEach((t, k) => {
    const pg = newDoc.pages[t.page];
    let edge: Edge | null = null;
    for (const r of t.rects) edge = edge ?? edgeOf(r, pg.width, pg.height);
    if (!edge) {
      const ext = extents.get(Math.round(pg.width));
      if (ext && t.rects.some((r) => r.x + r.w > ext.right + MARGIN_TOL || r.x < ext.left - MARGIN_TOL)) edge = 'margin';
    }
    if (!edge || wasOverflowing(k)) return;
    const cur = perPage.get(t.page);
    if (!cur) perPage.set(t.page, { edge, toks: [t], idx: [k] });
    else {
      cur.toks.push(t);
      cur.idx.push(k);
      if (cur.edge === 'margin' && edge !== 'margin') cur.edge = edge;
    }
  });

  const out: Change[] = [];
  for (const [page, { edge, toks, idx }] of perPage) {
    // A single stray glyph in the margin is not worth reporting.
    if (edge === 'margin' && toks.filter((t) => t.kind !== 'punct').length < 2) continue;
    const pg = newDoc.pages[page];
    const rects = mergeLineRects(toks.flatMap((t) => t.rects), 3).map((rect) => ({
      page,
      rect: clip(rect, pg.width, pg.height),
    }));
    const newSide: Side = { pages: [page], rects, text: joinTokens(toks), start: toks[0].i, end: toks[toks.length - 1].i + 1 };
    const oldTok = idx.map((k) => matchedOld.get(k)).find((t) => t);
    const oldSide: Side = oldTok
      ? { pages: [oldTok.page], rects: [], text: '', caret: { page: oldTok.page, x: oldTok.rects[0].x, y: oldTok.rects[0].y, h: oldTok.rects[0].h } }
      : { pages: [], rects: [], text: '' };
    out.push({
      id: '',
      kind: 'overflow',
      category: 'visual',
      old: oldSide,
      new: newSide,
      overflow: { edge },
      size: toks.length,
      cjk: false,
      contextBefore: '',
      contextAfter: '',
      order: page * 100000 + (rects[0]?.rect.y ?? 0) + 0.5,
    });
  }
  return out;
}

function clip(r: Rect, w: number, h: number): Rect {
  const x0 = Math.max(0, r.x);
  const y0 = Math.max(0, r.y);
  const x1 = Math.min(w, r.x + r.w);
  const y1 = Math.min(h, r.y + r.h);
  return { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
}
