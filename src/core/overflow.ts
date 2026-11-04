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

/**
 * Pages whose horizontal text extents can be compared: the same width, and
 * text that runs the same way (a page turned by /Rotate has its lines along
 * the page's height, so their x extent is not a margin).
 */
function frameKey(doc: DocModel, page: number): string {
  const p = doc.pages[page];
  return `${Math.round(p.width)}:${p.textAngle ?? 0}`;
}

/** Horizontal text extent of the old document, per page width and text direction. */
function bodyExtents(doc: DocModel, toks: Token[]): Map<string, { left: number; right: number }> {
  const m = new Map<string, { left: number; right: number }>();
  for (const t of toks) {
    const w = frameKey(doc, t.page);
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
 * Typical left and right edge of the body text on one page: the most common
 * line start and line end (to about 2 pt), if enough lines share it.
 * Justified paragraphs share their line end, ragged ones only their start.
 */
function blockEdges(doc: DocModel, page?: number): { left?: number; right?: number } {
  const lines = doc.lines.filter((l) => (page === undefined || l.page === page) && !l.furniture && l.end > l.start);
  const mode = (vals: number[]): number | undefined => {
    const bins = new Map<number, number[]>();
    for (const v of vals) {
      const k = Math.round(v / 2);
      for (const b of [k - 1, k, k + 1]) {
        let arr = bins.get(b);
        if (!arr) bins.set(b, (arr = []));
        arr.push(v);
      }
    }
    let best: number[] = [];
    for (const arr of bins.values()) if (arr.length > best.length) best = arr;
    if (best.length < Math.max(3, 0.25 * lines.length)) return undefined;
    return best.reduce((a, b) => a + b, 0) / best.length;
  };
  return { left: mode(lines.map((l) => l.rect.x)), right: mode(lines.map((l) => l.rect.x + l.rect.w)) };
}

/**
 * Where the lines of ragged text end at most: lines that are not the last of
 * their paragraph end near the measure; the longer of them (80th
 * percentile) give it.
 */
function measureEnd(doc: DocModel, page?: number): number | undefined {
  const lines = doc.lines.filter((l) => (page === undefined || l.page === page) && !l.furniture && l.end > l.start);
  const last = new Map<number, number>();
  for (const l of lines) last.set(l.block, l.id);
  const ends = lines
    .filter((l) => last.get(l.block) !== l.id)
    .map((l) => l.rect.x + l.rect.w)
    .sort((a, b) => a - b);
  if (ends.length < 3) return undefined;
  return ends[Math.floor(0.8 * (ends.length - 1))];
}

/**
 * The edge that more than half of the pages (of those where it can be told)
 * share, to 3 pt, when it lies more than MARGIN_TOL from the old document's.
 * A new template moves the text block of most pages the same way; a table
 * widened into the margins moves only the block of its own page (where its
 * rows are most of the lines).
 */
function sharedEdge(edges: (number | undefined)[], old: number | undefined): number | undefined {
  if (old === undefined) return undefined;
  const known = edges.filter((v): v is number => v !== undefined);
  let best: number | undefined;
  let count = 0;
  for (const v of known) {
    const n = known.filter((u) => Math.abs(u - v) <= 3).length;
    if (n > count) [best, count] = [v, n];
  }
  return best !== undefined && 2 * count > known.length && Math.abs(best - old) > MARGIN_TOL ? best : undefined;
}

/**
 * Find text in the new document that is cut off by the page edge, or that
 * sticks out into the margin — further than anything in the old document
 * and out of the page's own text block. Typically a table or a long line
 * that no longer fits; a new template with narrower margins is not.
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

  const oldLeft = blockEdges(oldDoc).left;
  const blocks = new Map<number, { left?: number; right?: number }>();
  const block = (page: number) => {
    let b = blocks.get(page);
    if (!b) blocks.set(page, (b = blockEdges(newDoc, page)));
    return b;
  };
  // The edges of a new template, on the left and on the right (where
  // justified lines end, or ragged lines at most).
  const pages = newDoc.pages.map((_, p) => p);
  const templateLeft = sharedEdge(
    pages.map((p) => block(p).left),
    oldLeft,
  );
  const oldEnd = blockEdges(oldDoc).right ?? measureEnd(oldDoc);
  const ends = new Map(pages.map((p) => [p, block(p).right ?? measureEnd(newDoc, p)]));
  const templateRight = sharedEdge([...ends.values()], oldEnd);

  const perPage = new Map<number, { edge: Edge; toks: Token[]; idx: number[] }>();
  B.forEach((t, k) => {
    const pg = newDoc.pages[t.page];
    let edge: Edge | null = null;
    for (const r of t.rects) edge = edge ?? edgeOf(r, pg.width, pg.height);
    const ext = edge ? undefined : extents.get(frameKey(newDoc, t.page));
    if (ext) {
      // When the page's text block starts where the new template puts it,
      // elsewhere than the old document's, the page's own block counts as
      // body: its typical line start and end, or the old width widened by as
      // much as the left margin shrank.
      const own = block(t.page);
      let left = ext.left;
      let right = ext.right;
      if (own.left !== undefined && oldLeft !== undefined && templateLeft !== undefined && Math.abs(own.left - templateLeft) <= 3) {
        left = Math.min(left, own.left);
        if (own.right !== undefined) right = Math.max(right, own.right);
        else right += Math.max(0, oldLeft - own.left);
      }
      // Only the right margin changed.
      const end = ends.get(t.page);
      if (end !== undefined && templateRight !== undefined && Math.abs(end - templateRight) <= 3) right = Math.max(right, end);
      if (t.rects.some((r) => r.x + r.w > right + MARGIN_TOL || r.x < left - MARGIN_TOL)) edge = 'margin';
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
