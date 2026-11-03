/**
 * Visual comparison of rendered pages.
 *
 * Text is already compared token by token, so here we only look for changes
 * the text diff cannot see: graphics, images, charts, lines, colours. The
 * trick that makes this work after re-pagination is that we never compare
 * page N with page N. Instead, every region of the old page is compared
 * with the place its surrounding text moved to in the new document (using
 * the matched words above and below it as anchors). Text itself is masked
 * out, and small anti-aliasing differences are tolerated.
 */
import type { Change, CompareResult, DocModel, Rect, Token } from './types.ts';
import { expand, intersects, union } from './geometry.ts';
import { joinTokens } from './tokenize.ts';

export interface Raster {
  width: number;
  height: number;
  /** RGBA, 4 bytes per pixel. */
  data: Uint8ClampedArray | Uint8Array;
  /** Pixels per PDF point. */
  scale: number;
}

const THRESH = 30;
/** Test/debug hook: receives intermediate results of compareRasters. */
export let debugHook: ((info: Record<string, unknown>) => void) | null = null;
export function setDebugHook(fn: typeof debugHook): void {
  debugHook = fn;
}
const CELL = 6;
/** Graphics displaced by at most this many points count as a minor shift, not a change. */
export const SHIFT_PT = 4;
/**
 * Largest share of ink a region may gain or lose and still count as the
 * same graphic moved within it: for a line that lies inside the region, and
 * for the part of a larger graphic (a fill, an image) that the region cuts
 * out (see unmatched()).
 */
const BALANCE_LINE = 0.2;
const BALANCE_EDGE = 0.08;

/**
 * Pixel budget for one rendered page (about A0 at 1 px/pt). The visual stage
 * keeps roughly 20 bytes per pixel for each of the two pages it compares.
 */
export const MAX_RENDER_PIXELS = 8_000_000;
/** Pages that would have to be rendered more coarsely than this are not compared visually. */
export const MIN_VISUAL_SCALE = 0.75;

/** Render scale for a page: the requested one, lowered so the page fits MAX_RENDER_PIXELS. */
export function renderScale(widthPt: number, heightPt: number, requested: number): number {
  return Math.min(requested, Math.sqrt(MAX_RENDER_PIXELS / Math.max(1, widthPt * heightPt)));
}

/** The page is so large that its graphics cannot be compared at a useful resolution. */
export function tooLargeToCompare(widthPt: number, heightPt: number): boolean {
  return renderScale(widthPt, heightPt, Infinity) < MIN_VISUAL_SCALE;
}

function luminance(r: Raster): Uint8Array {
  const n = r.width * r.height;
  const out = new Uint8Array(n);
  const d = r.data;
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    // Composite on white (transparent = white).
    const a = d[j + 3] / 255;
    const l = 0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2];
    out[i] = Math.round(l * a + 255 * (1 - a));
  }
  return out;
}

/**
 * 3×3 box blur. Thin lines rendered at different sub-pixel positions (one
 * dark pixel row vs. two lighter ones) become alike after blurring, while the
 * total ink — and therefore real additions or removals — is preserved.
 */
function blur(src: Uint8Array, w: number, h: number): Uint8Array {
  const tmp = new Uint16Array(src.length);
  const out = new Uint8Array(src.length);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) tmp[row + x] = src[row + (x > 0 ? x - 1 : x)] + src[row + x] + src[row + (x < w - 1 ? x + 1 : x)];
  }
  for (let y = 0; y < h; y++) {
    const up = (y > 0 ? y - 1 : y) * w;
    const row = y * w;
    const dn = (y < h - 1 ? y + 1 : y) * w;
    for (let x = 0; x < w; x++) out[row + x] = Math.round((tmp[up + x] + tmp[row + x] + tmp[dn + x]) / 9);
  }
  return out;
}

/** Split RGBA into three colour planes composited on white. */
function planes(r: Raster): Uint8Array[] {
  const n = r.width * r.height;
  const out = [new Uint8Array(n), new Uint8Array(n), new Uint8Array(n)];
  const d = r.data;
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    const a = d[j + 3] / 255;
    const w = 255 * (1 - a);
    out[0][i] = d[j] * a + w;
    out[1][i] = d[j + 1] * a + w;
    out[2][i] = d[j + 2] * a + w;
  }
  return out;
}

/** 3×3 min and max filters (erosion / dilation). */
function minMax(l: Uint8Array, w: number, h: number): [Uint8Array, Uint8Array] {
  const tmin = new Uint8Array(l.length);
  const tmax = new Uint8Array(l.length);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      const a = l[row + (x > 0 ? x - 1 : x)];
      const b = l[row + x];
      const c = l[row + (x < w - 1 ? x + 1 : x)];
      tmin[row + x] = a < b ? (a < c ? a : c) : b < c ? b : c;
      tmax[row + x] = a > b ? (a > c ? a : c) : b > c ? b : c;
    }
  }
  const mn = new Uint8Array(l.length);
  const mx = new Uint8Array(l.length);
  for (let y = 0; y < h; y++) {
    const up = (y > 0 ? y - 1 : y) * w;
    const row = y * w;
    const dn = (y < h - 1 ? y + 1 : y) * w;
    for (let x = 0; x < w; x++) {
      const a = tmin[up + x];
      const b = tmin[row + x];
      const c = tmin[dn + x];
      mn[row + x] = a < b ? (a < c ? a : c) : b < c ? b : c;
      const d = tmax[up + x];
      const e = tmax[row + x];
      const f = tmax[dn + x];
      mx[row + x] = d > e ? (d > f ? d : f) : e > f ? e : f;
    }
  }
  return [mn, mx];
}

// Text mask values.
/** Inside a text run's box: the glyphs are compared as text, not here. */
const GLYPH = 1;
/** Padding around a run (glyph overhang, accents): not compared. */
const PAD = 2;
/** A thin horizontal rule that runs through the padding: compared like any graphic. */
const RULE = 3;
/** Luminance at or below which a pixel counts as dark ink. */
const DARK = 191;

/**
 * Where the text is. Each run's box is masked, plus a padding for glyph parts
 * outside it. A long thin horizontal line inside that padding — a rule above
 * a paragraph, an underline below a run, a table border close to the text —
 * is not text, so it is taken out of the mask again and compared.
 */
function textMask(doc: DocModel, page: number, r: Raster, lum: Uint8Array): Uint8Array {
  const W = r.width;
  const H = r.height;
  const s = r.scale;
  const m = new Uint8Array(W * H);
  const fill = (rect: Rect, v: number, onlyEmpty: boolean) => {
    const x0 = Math.max(0, Math.floor(rect.x * s));
    const y0 = Math.max(0, Math.floor(rect.y * s));
    const x1 = Math.min(W, Math.ceil((rect.x + rect.w) * s));
    const y1 = Math.min(H, Math.ceil((rect.y + rect.h) * s));
    for (let y = y0; y < y1; y++) {
      if (!onlyEmpty) m.fill(v, y * W + x0, y * W + x1);
      else for (let i = y * W + x0, e = y * W + x1; i < e; i++) if (!m[i]) m[i] = v;
    }
  };
  const runs = (doc.runs[page] ?? []).filter((run) => run.str.trim());
  for (const run of runs) fill(expand(run, 0.12 * run.fontSize + 1), PAD, true);
  for (const run of runs) fill(run, GLYPH, false);
  const minLen = Math.round(18 * s);
  const t = Math.ceil(1.5 * s) + 1;
  const darkShare = (y: number, x0: number, x1: number) => {
    if (y < 0 || y >= H) return 0;
    let n = 0;
    for (let x = x0; x < x1; x++) if (lum[y * W + x] <= DARK) n++;
    return n / (x1 - x0);
  };
  for (let y = 0; y < H; y++) {
    const row = y * W;
    let x = 0;
    while (x < W) {
      if (lum[row + x] > DARK) {
        x++;
        continue;
      }
      let e = x;
      let pad = 0;
      while (e < W && lum[row + e] <= DARK) {
        if (m[row + e] === PAD) pad++;
        e++;
      }
      // Long, and light above and below at more than the thickness of a rule.
      if (pad > 0 && e - x >= minLen && darkShare(y - t, x, e) < 0.5 && darkShare(y + t, x, e) < 0.5) {
        for (let yy = Math.max(0, y - 1); yy <= Math.min(H - 1, y + 1); yy++) for (let i = yy * W + x; i < yy * W + e; i++) if (m[i] === PAD) m[i] = RULE;
      }
      x = e;
    }
  }
  return m;
}

/** A rendered page prepared for comparison. */
interface Prepared {
  r: Raster;
  lum: Uint8Array;
  mask: Uint8Array;
  /** Blurred colour planes. */
  planes: Uint8Array[];
  /** 3×3 minimum and maximum of the blurred planes. */
  range: [Uint8Array, Uint8Array][];
}

function prepare(doc: DocModel, page: number, r: Raster): Prepared {
  const lum = luminance(r);
  const p = planes(r).map((c) => blur(c, r.width, r.height));
  return { r, lum, mask: textMask(doc, page, r, lum), planes: p, range: p.map((c) => minMax(c, r.width, r.height)) };
}

interface Anch {
  y: number; // source y (pt)
  dx: number;
  dy: number;
  /** False for lines that moved to another page (they bound this pair's region). */
  own: boolean;
}

/**
 * Per-line displacement of matched text from the source page. Lines matched
 * to the paired page are "own" anchors; lines matched to any other page are
 * "foreign" and mark where this pair's comparable region ends (e.g. rows that
 * moved on to the next page).
 */
function anchorsFor(result: CompareResult, oldPage: number, newPage: number, invert: boolean): Anch[] {
  const A = result.oldDoc.tokens;
  const B = result.newDoc.tokens;
  const m = result.matches;
  const byLine = new Map<number, { y: number; dx: number; dy: number; own: boolean }[]>();
  for (let p = 0; p < m.length; p += 2) {
    const a = A[m[p]];
    const b = B[m[p + 1]];
    const src = invert ? b : a;
    const dst = invert ? a : b;
    if (src.page !== (invert ? newPage : oldPage)) continue;
    const own = dst.page === (invert ? oldPage : newPage);
    const rs = src.rects[0];
    const rd = dst.rects[0];
    let arr = byLine.get(src.line);
    if (!arr) byLine.set(src.line, (arr = []));
    arr.push({ y: rs.y, dx: rd.x - rs.x, dy: rd.y - rs.y, own });
  }
  const out: Anch[] = [];
  for (const arr of byLine.values()) {
    const own = arr.filter((a) => a.own);
    const use = own.length >= arr.length / 2 ? own : arr;
    const dys = use.map((a) => a.dy).sort((u, v) => u - v);
    const dxs = use.map((a) => a.dx).sort((u, v) => u - v);
    out.push({ y: Math.min(...arr.map((a) => a.y)), dx: dxs[dxs.length >> 1], dy: dys[dys.length >> 1], own: own.length >= arr.length / 2 });
  }
  return out.sort((u, v) => u.y - v.y);
}

/** The colours of source pixel p lie within the tolerance of destination pixel q's neighbourhood. */
function colourFit(src: Prepared, dst: Prepared, q: number, p: number): boolean {
  const T = THRESH;
  const s = src.planes;
  const d = dst.range;
  return (
    s[0][p] + T >= d[0][0][q] &&
    s[0][p] <= d[0][1][q] + T &&
    s[1][p] + T >= d[1][0][q] &&
    s[1][p] <= d[1][1][q] + T &&
    s[2][p] + T >= d[2][0][q] &&
    s[2][p] <= d[2][1][q] + T
  );
}

/** Sum of darkness inside a pixel rect, text masked out, in units of pt². */
function inkIn(side: Prepared, x0: number, y0: number, x1: number, y1: number): number {
  const { r, lum, mask } = side;
  x0 = Math.max(0, Math.floor(x0));
  y0 = Math.max(0, Math.floor(y0));
  x1 = Math.min(r.width, Math.ceil(x1));
  y1 = Math.min(r.height, Math.ceil(y1));
  let sum = 0;
  for (let y = y0; y < y1; y++) {
    for (let p = y * r.width + x0, e = y * r.width + x1; p < e; p++) {
      const k = mask[p];
      if (k !== GLYPH && k !== PAD) sum += 255 - lum[p];
    }
  }
  return sum / 255 / (r.scale * r.scale);
}

interface Unmatched {
  real: Rect[];
  shifted: Rect[];
  /**
   * Blank on this side but next to a graphic (the spot a bar grew into):
   * only used as this side's location of a change found on the other side.
   */
  beside: Rect[];
  /** Differing pixels per CELL×CELL cell of the source page. */
  cells: Uint16Array;
  cols: number;
}

/**
 * Pixels of `src` that have no counterpart in `dst`, as rects in src page
 * points. Each source row is tried with the displacement of the nearest
 * anchor above and below it. With `whole` (the two pages correspond as a
 * whole), parts of the source page that lie outside the other, smaller page
 * are compared with blank paper.
 */
function unmatched(src: Prepared, dst: Prepared, anchors: Anch[], whole: boolean, identity = false): Unmatched {
  const rs = src.r;
  const rd = dst.r;
  const ms = src.mask;
  const md = dst.mask;
  const [s0, s1, s2] = src.planes;
  const T = THRESH;
  const blank = (p: number) => s0[p] + T >= 255 && s1[p] + T >= 255 && s2[p] + T >= 255;
  // Paper may land on text in the destination (re-flowed lines); ink must
  // really be matched there, or a figure that text moved into the place of
  // would not be missed. Pixels of a rule in the source padding must always
  // be matched.
  const fits = (q: number, p: number, strict: boolean) => (!strict && (md[q] === GLYPH || md[q] === PAD) && blank(p)) || colourFit(src, dst, q, p);
  const w = rs.width;
  const h = rs.height;
  const scale = rs.scale;
  const ratio = rd.scale / rs.scale;
  const dstW = rd.width / rd.scale;
  const dstH = rd.height / rd.scale;
  const cols = Math.ceil(w / CELL);
  const rows = Math.ceil(h / CELL);
  const cells = new Uint16Array(cols * rows);
  // Rows compared with the other page (their nearest matched line is on it).
  const rowOk = new Uint8Array(h);
  // Differing pixels and where they were compared (for the shift test below).
  const failP: number[] = [];
  const failQ: number[] = []; // qy * width + qx of the first usable candidate, -1 for blank paper
  const failQ2: number[] = []; // the same for the second candidate (-1 if none)
  // Faint differences: how far matching pixels still lie outside the
  // tolerance-free range of their counterpart, per cell and per cell row /
  // column (a light fill or a hairline stays below THRESH everywhere).
  const fSum = new Float32Array(cells.length);
  const fN = new Uint16Array(cells.length);
  const fRow = new Float32Array(cells.length * CELL);
  const fRowN = new Uint8Array(cells.length * CELL);
  const fCol = new Float32Array(cells.length * CELL);
  const fColN = new Uint8Array(cells.length * CELL);
  const faintP: number[] = [];
  const faintQ: number[] = [];
  const [[n0, x0], [n1, x1], [n2, x2]] = dst.range;
  const outside = (v: number, lo: number, hi: number) => (v < lo ? lo - v : v > hi ? v - hi : 0);
  // The same light line drawn at another sub-pixel position carries up to
  // about a third more or less ink; allow that much (and at least 4 levels).
  const rel = (v: number) => Math.max(4, 0.4 * (255 - v));
  // Row → candidate offsets (in destination pixels).
  let ai = 0;
  for (let y = 0; y < h; y++) {
    const ypt = y / scale;
    while (ai < anchors.length && anchors[ai].y <= ypt) ai++;
    // Each row belongs to its nearest anchor line. If that line went to
    // another page, the row is not comparable in this page pair.
    const aboveA = anchors[ai - 1];
    const belowA = anchors[ai];
    const nearest = !aboveA ? belowA : !belowA ? aboveA : ypt - aboveA.y <= belowA.y - ypt ? aboveA : belowA;
    if (!nearest || !nearest.own) continue;
    const above = aboveA?.own ? aboveA : undefined;
    const below = belowA?.own ? belowA : undefined;
    const c1 = nearest;
    const c2 = (c1 === above ? below : above) ?? c1;
    const ox1 = Math.round(c1.dx * rd.scale);
    const oy1 = Math.round((ypt + c1.dy) * rd.scale);
    const ox2 = Math.round(c2.dx * rd.scale);
    const oy2 = Math.round((ypt + c2.dy) * rd.scale);
    const in1 = oy1 >= 0 && oy1 < rd.height;
    const in2 = oy2 >= 0 && oy2 < rd.height;
    // Below the end of a shorter page (not content pushed off by re-flow).
    const belowPage = whole && ypt >= dstH;
    // Faint differences are only looked for where the mapping is pinned by
    // matched lines above and below (or is the identity, for pages without
    // text): above the first line or below the last one it is extrapolated,
    // and a light fill there may just land a line off.
    const pinned = (!!above && !!below) || identity;
    // Above the first matched line or below the last one, the mapping is
    // extrapolated from that line. What sits in the margins there (a running
    // header's rule, a logo, the top border of a table continued from the
    // previous page) usually stays at the same place on the page while the
    // text below it re-flows, so the same position is tried as well. Only an
    // exact match of the graphic counts there, never text in the other page.
    const oy0 = Math.round(ypt * rd.scale);
    const atSame = !pinned && !identity && oy0 < rd.height && (oy0 !== oy1 || ox1 !== 0) && (oy0 !== oy2 || ox2 !== 0);
    if (!in1 && !in2 && !belowPage) continue;
    rowOk[y] = 1;
    const row = y * w;
    const crow = ((y / CELL) | 0) * cols;
    for (let x = 0; x < w; x++) {
      const p = row + x;
      const mk = ms[p];
      if (mk === GLYPH || mk === PAD) continue;
      const strict = mk === RULE;
      const xd = Math.round(x * ratio);
      let ok = false;
      let known = false;
      let q0 = -1;
      let q2 = -1;
      let qFit = -1;
      if (in1) {
        const qx = xd + ox1;
        if (qx >= 0 && qx < rd.width) {
          known = true;
          q0 = oy1 * rd.width + qx;
          ok = fits(q0, p, strict);
          if (ok) qFit = q0;
        }
      }
      if (!ok && in2) {
        const qx = xd + ox2;
        if (qx >= 0 && qx < rd.width) {
          known = true;
          if (q0 < 0) q0 = oy2 * rd.width + qx;
          else q2 = oy2 * rd.width + qx;
          ok = fits(oy2 * rd.width + qx, p, strict);
          if (ok) qFit = oy2 * rd.width + qx;
        }
      }
      if (!ok && atSame && xd < rd.width && colourFit(src, dst, oy0 * rd.width + xd, p)) ok = true;
      if (pinned && qFit >= 0 && (strict || (md[qFit] !== GLYPH && md[qFit] !== PAD))) {
        // The excess is the smaller of the two places: a graphic that moved
        // with the line below it may also fit, more loosely, at the place
        // given by the line above (an image moved by a re-flowed line).
        const excess = (q: number) => Math.max(outside(s0[p], n0[q], x0[q]), outside(s1[p], n1[q], x1[q]), outside(s2[p], n2[q], x2[q]));
        let e = excess(qFit);
        const qx1 = xd + ox1;
        const qx2 = xd + ox2;
        const qc1 = in1 && qx1 >= 0 && qx1 < rd.width ? oy1 * rd.width + qx1 : -1;
        const qc2 = in2 && qx2 >= 0 && qx2 < rd.width ? oy2 * rd.width + qx2 : -1;
        const q = qFit === qc1 ? qc2 : qc1;
        if (e > 0 && q >= 0 && q !== qFit && (strict || (md[q] !== GLYPH && md[q] !== PAD)) && colourFit(src, dst, q, p)) e = Math.min(e, excess(q));
        const ci = crow + ((x / CELL) | 0);
        fSum[ci] += e;
        fN[ci]++;
        fRow[ci * CELL + (y % CELL)] += e;
        fRowN[ci * CELL + (y % CELL)]++;
        fCol[ci * CELL + (x % CELL)] += e;
        fColN[ci * CELL + (x % CELL)]++;
        if (e >= 4 && faintP.length < 2_000_000) {
          faintP.push(p);
          faintQ.push(qFit);
        }
      }
      if (!known && (belowPage || (whole && x / scale >= dstW))) {
        // Beyond the other page's edge there is only blank paper.
        known = true;
        ok = blank(p);
      }
      if (known && !ok) {
        cells[crow + ((x / CELL) | 0)]++;
        failP.push(p);
        failQ.push(q0);
        failQ2.push(q2 !== q0 ? q2 : -1);
      }
    }
  }
  if (debugHook) debugHook({ cells, cols, rows });
  const comps = components(cells, cols, rows, scale);
  // Which component each differing pixel belongs to.
  const compOfCell = new Int32Array(cells.length).fill(-1);
  comps.forEach((c, k) => c.cells.forEach((ci) => (compOfCell[ci] = k)));
  const members: number[][] = comps.map(() => []);
  for (let k = 0; k < failP.length; k++) {
    const p = failP[k];
    const ci = ((((p / w) | 0) / CELL) | 0) * cols + (((p % w) / CELL) | 0);
    const comp = compOfCell[ci];
    if (comp >= 0) members[comp].push(k);
  }
  // A region is a minor shift only if ONE common offset (within ±SHIFT_PT)
  // explains nearly all of its differing pixels — a border line moved by
  // 2 pt is; a tick drawn inside a box is not. Text in the destination does
  // not count as a fit here: it would let a new rule next to text pass.
  const S = Math.round(SHIFT_PT * rd.scale);
  // Each row was compared with the place given by two anchor lines; try
  // the offsets around either (a frame next to a moved line goes with it).
  // Returns the share of pixels explained by the best offset, and that
  // offset (the smallest of equally good ones): the direction the graphic
  // moved in.
  const shiftFit = (idx: number[], qs: number[], step: number) => {
    let best = 0;
    let bx = 0;
    let by = 0;
    for (let dy = -S; dy <= S; dy++) {
      for (let dx = -S; dx <= S; dx++) {
        if (dx === 0 && dy === 0) continue;
        let hit = 0;
        let total = 0;
        for (let j = 0; j < idx.length; j += step) {
          const q0 = qs[idx[j]];
          total++;
          if (q0 < 0) continue;
          const qy = ((q0 / rd.width) | 0) + dy;
          const qx = (q0 % rd.width) + dx;
          if (qy >= 0 && qy < rd.height && qx >= 0 && qx < rd.width && colourFit(src, dst, qy * rd.width + qx, failP[idx[j]])) hit++;
        }
        const f = total ? hit / total : 0;
        if (f > best || (f === best && f > 0 && Math.abs(dx) + Math.abs(dy) < Math.abs(bx) + Math.abs(by))) {
          best = f;
          bx = dx;
          by = dy;
        }
      }
    }
    return { best, dx: bx, dy: by };
  };
  // Paper on this side: (nearly) every differing pixel is blank here, so it
  // only marks where the other side has something.
  const paperShare = (ps: number[], idx: number[], step: number) => {
    let paper = 0;
    let n = 0;
    for (let j = 0; j < idx.length; j += step) {
      const p = ps[idx[j]];
      n++;
      if (Math.min(s0[p], s1[p], s2[p]) > 247) paper++;
    }
    return n ? paper / n : 1;
  };
  // Share of the region's two sides across the direction of motion (left
  // and right for a move sideways) that is not paper on this side.
  const continuesBeyond = (x0: number, y0: number, x1: number, y1: number, sideways: boolean) => {
    const X0 = Math.max(0, Math.floor(x0));
    const Y0 = Math.max(0, Math.floor(y0));
    const X1 = Math.min(w, Math.ceil(x1)) - 1;
    const Y1 = Math.min(h, Math.ceil(y1)) - 1;
    let ink = 0;
    let n = 0;
    const at = (x: number, y: number) => {
      const p = y * w + x;
      if (ms[p] === GLYPH || ms[p] === PAD) return;
      n++;
      if (Math.min(s0[p], s1[p], s2[p]) < 235) ink++;
    };
    if (sideways) for (let y = Y0; y <= Y1; y++) (at(X0, y), at(X1, y));
    else for (let x = X0; x <= X1; x++) (at(x, Y0), at(x, Y1));
    return n > 0 && ink / n >= 0.25;
  };
  // Ink balance of a region that one offset (dx, dy) within SHIFT_PT
  // explains: a shifted graphic keeps its ink; one that grew, shrank or got a
  // parallel line added does not, even if every differing pixel matches
  // something nearby. Where only one edge of a graphic lies in the region (a
  // filled bar moved up), the ink it gains is lost at the other edge; see the
  // grouping below. `ps` and `qs` are the region's pixels and the places they
  // were compared with.
  const inkBalance = (rect: Rect, ps: number[], qs: number[], idx: number[], step: number, dx: number, dy: number) => {
    const pad = SHIFT_PT * scale;
    const sx0 = rect.x * scale - pad;
    const sy0 = rect.y * scale - pad;
    const sx1 = (rect.x + rect.w) * scale + pad;
    const sy1 = (rect.y + rect.h) * scale + pad;
    // Across a page break only part of a page is comparable: the balance is
    // only measured where every row around the region was compared.
    let comparable = true;
    if (!whole) for (let y = Math.max(0, Math.floor(sy0)), e = Math.min(h, Math.ceil(sy1)); y < e && comparable; y++) comparable = !!rowOk[y];
    if (!comparable) return { shift: true, delta: 0, raw: 0, ox: 0, oy: 0, mx: 0, my: 0, inked: false };
    const offX: number[] = [];
    const offY: number[] = [];
    for (let j = 0; j < idx.length; j += step) {
      const q0 = qs[idx[j]];
      if (q0 < 0) continue;
      const p = ps[idx[j]];
      offX.push((q0 % rd.width) - Math.round((p % w) * ratio));
      offY.push(((q0 / rd.width) | 0) - Math.round(((p / w) | 0) * ratio));
    }
    const med = (a: number[]) => (a.length ? a.sort((u, v) => u - v)[a.length >> 1] : 0);
    const mx = med(offX);
    const my = med(offY);
    const inkS = inkIn(src, sx0, sy0, sx1, sy1);
    const inkD = inkIn(dst, sx0 * ratio + mx, sy0 * ratio + my, sx1 * ratio + mx, sy1 * ratio + my);
    const delta = inkD - inkS;
    // A thin line that moved within the region keeps its ink, give or take
    // anti-aliasing (a hairline drawn one pixel over can gain or lose a
    // tenth of it). Where the graphic goes on beyond the region in the
    // direction it moved (the edge of a fill, the inside of an image), the
    // part inside the region keeps its ink much more closely; a light bar
    // with a dark outline that grew by 3 pt does not.
    const edge = continuesBeyond(sx0, sy0, sx1, sy1, Math.abs(dx) >= Math.abs(dy));
    const balanced = Math.abs(delta) <= (edge ? BALANCE_EDGE : BALANCE_LINE) * Math.max(inkS, inkD) + 0.5;
    return { shift: true, delta: balanced ? 0 : delta, raw: delta, ox: dx, oy: dy, mx, my, inked: true };
  };
  const cand = comps.map((c, k) => {
    const idx = members[k];
    const step = Math.max(1, Math.floor(idx.length / 1500));
    const blankHere = paperShare(failP, idx, step) >= 0.95;
    let qs = failQ;
    let fit = shiftFit(idx, failQ, step);
    if (fit.best < 0.85 && idx.some((j) => failQ2[j] >= 0)) {
      const alt = shiftFit(
        idx,
        failQ2.map((q, j) => (q >= 0 ? q : failQ[j])),
        step,
      );
      if (alt.best > fit.best) {
        fit = alt;
        qs = failQ2.map((q, j) => (q >= 0 ? q : failQ[j]));
      }
    }
    if (fit.best < 0.85) return { rect: c.rect, shift: false, delta: 0, raw: 0, ox: 0, oy: 0, mx: 0, my: 0, inked: false, blankHere };
    return { rect: c.rect, ...inkBalance(c.rect, failP, qs, idx, step, fit.dx, fit.dy), blankHere };
  });
  // Faint differences: a light fill (mean excess over an area of at least
  // 3×3 cells) or a hairline (a row or column of cells with a strong mean
  // excess along it). Like other regions, they count as a minor shift when
  // the same faint pattern lies within SHIFT_PT.
  const FAINT_AREA = 6;
  const FAINT_LINE = 12;
  const faint = new Uint8Array(cells.length);
  for (let c = 0; c < cells.length; c++) {
    if (fN[c] >= 9 && fSum[c] / fN[c] >= FAINT_AREA) faint[c] |= 1;
    for (let k = 0; k < CELL; k++) {
      const i = c * CELL + k;
      if ((fRowN[i] >= 4 && fRow[i] / fRowN[i] >= FAINT_LINE) || (fColN[i] >= 4 && fCol[i] / fColN[i] >= FAINT_LINE)) faint[c] |= 2;
    }
  }
  const seenF = new Uint8Array(cells.length);
  const faintOfCell = new Int32Array(cells.length).fill(-1);
  const faintComps: { rect: Rect; cells: number[] }[] = [];
  for (let i = 0; i < cells.length; i++) {
    if (!faint[i] || seenF[i]) continue;
    const member: number[] = [];
    const stack = [i];
    seenF[i] = 1;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -1;
    let maxY = -1;
    let area = 0;
    while (stack.length) {
      const c = stack.pop()!;
      member.push(c);
      if (faint[c] & 1) area++;
      const cx = c % cols;
      const cy = (c / cols) | 0;
      minX = Math.min(minX, cx);
      maxX = Math.max(maxX, cx);
      minY = Math.min(minY, cy);
      maxY = Math.max(maxY, cy);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
          const n = ny * cols + nx;
          if (faint[n] && !seenF[n]) {
            seenF[n] = 1;
            stack.push(n);
          }
        }
      }
    }
    const fill = area >= 9 && maxX - minX >= 2 && maxY - minY >= 2;
    const line = Math.max(maxX - minX, maxY - minY) + 1 >= 6;
    if (!fill && !line) continue;
    member.forEach((c) => (faintOfCell[c] = faintComps.length));
    faintComps.push({
      rect: { x: (minX * CELL) / scale, y: (minY * CELL) / scale, w: ((maxX - minX + 1) * CELL) / scale, h: ((maxY - minY + 1) * CELL) / scale },
      cells: member,
    });
  }
  if (faintComps.length) {
    const samples: number[][] = faintComps.map(() => []);
    for (let k = 0; k < faintP.length; k++) {
      const p = faintP[k];
      const comp = faintOfCell[((((p / w) | 0) / CELL) | 0) * cols + (((p % w) / CELL) | 0)];
      if (comp >= 0) samples[comp].push(k);
    }
    faintComps.forEach((c, k) => {
      const idx = samples[k];
      const step = Math.max(1, Math.floor(idx.length / 1500));
      let best = 0;
      let still = 0;
      let bx = 0;
      let by = 0;
      for (let dy = -S; dy <= S; dy++) {
        for (let dx = -S; dx <= S; dx++) {
          let hit = 0;
          let total = 0;
          for (let j = 0; j < idx.length; j += step) {
            const p = faintP[idx[j]];
            const q0 = faintQ[idx[j]];
            const qy = ((q0 / rd.width) | 0) + dy;
            const qx = (q0 % rd.width) + dx;
            total++;
            if (qy < 0 || qx < 0 || qy >= rd.height || qx >= rd.width) continue;
            const q = qy * rd.width + qx;
            if (outside(s0[p], n0[q], x0[q]) <= rel(s0[p]) && outside(s1[p], n1[q], x1[q]) <= rel(s1[p]) && outside(s2[p], n2[q], x2[q]) <= rel(s2[p])) hit++;
          }
          const f = total ? hit / total : 0;
          if (dx === 0 && dy === 0) still = f;
          else if (f > best || (f === best && f > 0 && Math.abs(dx) + Math.abs(dy) < Math.abs(bx) + Math.abs(by))) [best, bx, by] = [f, dx, dy];
        }
      }
      // The same light graphic, only anti-aliased differently: no difference.
      if (still >= 0.85) return;
      const blankHere = paperShare(faintP, idx, step) >= 0.95;
      // A light fill that moved keeps its ink too; one that grew does not.
      if (idx.length > 0 && best >= 0.85) cand.push({ rect: c.rect, ...inkBalance(c.rect, faintP, faintQ, idx, step, bx, by), blankHere });
      else cand.push({ rect: c.rect, shift: false, delta: 0, raw: 0, ox: 0, oy: 0, mx: 0, my: 0, inked: false, blankHere });
      // Let appearance checks see the faint difference too.
      for (const ci of c.cells) if (cells[ci] < 3) cells[ci] = 3;
    });
  }
  // An edge that moved out of a region and the opposite edge that moved in
  // (the top and bottom of a filled bar shifted by 3 pt, the left and right
  // edges of a logo moved 2 pt to the right) balance each other. Edges of
  // one graphic are explained by offsets in the same direction and lie side
  // by side across it: in the same rows for a move to the left or right, in
  // the same columns for a move up or down. Such edges are grouped; a group
  // whose ink balances is a shift, otherwise its edges may still balance in
  // pairs. Two bars next to each other, one grown and one shrunk, are not a
  // shift: their edges moved up and down, but they share rows, not columns.
  const colsOf = (a: Rect, b: Rect) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) >= 0.7 * Math.min(a.w, b.w);
  const rowsOf = (a: Rect, b: Rect) => Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) >= 0.7 * Math.min(a.h, b.h);
  type Cand = (typeof cand)[number];
  const horiz = (c: Cand) => 2 * Math.abs(c.ox) >= Math.abs(c.oy);
  const vert = (c: Cand) => 2 * Math.abs(c.oy) >= Math.abs(c.ox);
  // Pieces of one edge, broken up along it (where the image is as light as
  // the paper), also go together.
  const pieceX = (a: Rect, b: Rect) => Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w) <= Math.max(2 * SHIFT_PT, 0.25 * Math.max(a.w, b.w));
  const pieceY = (a: Rect, b: Rect) => Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h) <= Math.max(2 * SHIFT_PT, 0.25 * Math.max(a.h, b.h));
  const together = (a: Cand, b: Cand) =>
    a.inked &&
    b.inked &&
    ((horiz(a) && horiz(b) && Math.sign(a.ox) === Math.sign(b.ox) && (rowsOf(a.rect, b.rect) || (colsOf(a.rect, b.rect) && pieceY(a.rect, b.rect)))) ||
      (vert(a) && vert(b) && Math.sign(a.oy) === Math.sign(b.oy) && (colsOf(a.rect, b.rect) || (rowsOf(a.rect, b.rect) && pieceX(a.rect, b.rect)))));
  const group = cand.map((_, i) => i);
  const root = (i: number): number => (group[i] === i ? i : (group[i] = root(group[i])));
  for (let i = 0; i < cand.length; i++) for (let j = i + 1; j < cand.length; j++) if (cand[i].shift && cand[j].shift && together(cand[i], cand[j])) group[root(i)] = root(j);
  const gain = new Map<number, number>();
  const loss = new Map<number, number>();
  cand.forEach((c, i) => {
    if (!c.shift || !c.inked) return;
    const g = root(i);
    if (c.raw > 0) gain.set(g, (gain.get(g) ?? 0) + c.raw);
    else loss.set(g, (loss.get(g) ?? 0) - c.raw);
  });
  const balances = (u: number, v: number) => Math.abs(u - v) <= 0.35 * Math.max(u, v) + 0.5;
  // The ink of the whole box around a group's edges (the whole graphic, when
  // its edges on both sides are in the group): kept when it only moved. The
  // edge that lost ink may lie inside a region that gained more elsewhere.
  const boxKeeps = new Map<number, boolean>();
  const keepsInk = (g: number) => {
    let v = boxKeeps.get(g);
    if (v !== undefined) return v;
    const members = cand.filter((c, i) => c.shift && c.inked && root(i) === g);
    v = false;
    if (members.length >= 2) {
      const b = union(members.map((c) => c.rect));
      const pad = SHIFT_PT * scale;
      const [bx0, by0, bx1, by1] = [b.x * scale - pad, b.y * scale - pad, (b.x + b.w) * scale + pad, (b.y + b.h) * scale + pad];
      const { mx, my } = members[0];
      const inkS = inkIn(src, bx0, by0, bx1, by1);
      const inkD = inkIn(dst, bx0 * ratio + mx, by0 * ratio + my, bx1 * ratio + mx, by1 * ratio + my);
      v = Math.abs(inkD - inkS) <= BALANCE_EDGE * Math.max(inkS, inkD) + 0.5;
    }
    boxKeeps.set(g, v);
    return v;
  };
  const paired = new Set<number>();
  cand.forEach((a, i) => {
    if (!a.shift || a.delta === 0) return;
    const g = root(i);
    if ((gain.has(g) && loss.has(g) && balances(gain.get(g)!, loss.get(g)!)) || keepsInk(g)) paired.add(i);
  });
  cand.forEach((a, i) => {
    if (!a.shift || a.delta === 0 || paired.has(i)) return;
    const j = cand.findIndex(
      (b, k) => k !== i && b.shift && !paired.has(k) && b.delta * a.delta < 0 && balances(Math.abs(a.delta), Math.abs(b.delta)) && together(a, b),
    );
    if (j >= 0) paired.add(i).add(j);
  });
  const real: Rect[] = [];
  const shifted: Rect[] = [];
  const beside: Rect[] = [];
  const inkOf = (r: Rect) => inkIn(src, r.x * scale, r.y * scale, (r.x + r.w) * scale, (r.y + r.h) * scale);
  cand.forEach((c, i) => {
    // Blank paper on this side: the other side shows what was added or
    // removed there.
    const r = c.rect;
    if (c.blankHere) {
      if (inkOf(expand(r, SHIFT_PT)) >= 0.015 * r.w * r.h) beside.push(r);
      return;
    }
    (c.shift && (c.delta === 0 || paired.has(i)) ? shifted : real).push(r);
  });
  return { real, shifted, beside, cells, cols };
}

/** Connected regions of cells with enough differing pixels, in page points. */
function components(cells: Uint16Array, cols: number, rows: number, scale: number): { rect: Rect; cells: number[] }[] {
  const hot = new Uint8Array(cells.length);
  for (let i = 0; i < cells.length; i++) hot[i] = cells[i] >= 3 ? 1 : 0;
  const seen = new Uint8Array(cells.length);
  const out: { rect: Rect; cells: number[] }[] = [];
  const stack: number[] = [];
  for (let i = 0; i < cells.length; i++) {
    if (!hot[i] || seen[i]) continue;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -1;
    let maxY = -1;
    let total = 0;
    const member: number[] = [];
    stack.push(i);
    seen[i] = 1;
    while (stack.length) {
      const c = stack.pop()!;
      member.push(c);
      const cx = c % cols;
      const cy = (c / cols) | 0;
      total += cells[c];
      if (cx < minX) minX = cx;
      if (cy < minY) minY = cy;
      if (cx > maxX) maxX = cx;
      if (cy > maxY) maxY = cy;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
          const n = ny * cols + nx;
          if (hot[n] && !seen[n]) {
            seen[n] = 1;
            stack.push(n);
          }
        }
      }
    }
    if (total < 24) continue;
    out.push({
      rect: { x: (minX * CELL) / scale, y: (minY * CELL) / scale, w: ((maxX - minX + 1) * CELL) / scale, h: ((maxY - minY + 1) * CELL) / scale },
      cells: member,
    });
  }
  return out;
}

/** Some differing pixels lie in or next to a token's ink box (see ink()). */
function differsNear(d: Unmatched, r: Raster, rect: Rect): boolean {
  const e = expand(rect, 0.15 * rect.h + 3);
  const cx0 = Math.max(0, Math.floor((e.x * r.scale) / CELL));
  const cy0 = Math.max(0, Math.floor((e.y * r.scale) / CELL));
  const cx1 = Math.min(d.cols - 1, Math.floor(((e.x + e.w) * r.scale) / CELL));
  const rowsN = d.cells.length / d.cols;
  const cy1 = Math.min(rowsN - 1, Math.floor(((e.y + e.h) * r.scale) / CELL));
  for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) if (d.cells[cy * d.cols + cx] >= 3) return true;
  return false;
}

/**
 * Ink (darkness) of a token's glyphs and its chroma (deviation from neutral
 * grey), plus the background colour behind them. Both survive
 * anti-aliasing: grey edge pixels of black text have no chroma, and total
 * coverage is preserved under sub-pixel shifts. Graphics next to the token
 * would count too, so tokens near a graphic difference are not measured
 * (see compareRasters).
 */
function ink(side: Prepared, rect: Rect): { total: number; chroma: [number, number, number]; n: number; bg: [number, number, number] } {
  const { r, lum: l } = side;
  const d = r.data;
  // Pad so that sub-pixel placement does not cut glyphs differently.
  const pad = rect.h * 0.15;
  const x0 = Math.max(0, Math.floor((rect.x - pad) * r.scale));
  const y0 = Math.max(0, Math.floor((rect.y - pad) * r.scale));
  const x1 = Math.min(r.width, Math.ceil((rect.x + rect.w + pad) * r.scale));
  const y1 = Math.min(r.height, Math.ceil((rect.y + rect.h + pad) * r.scale));
  let bg = 0;
  // Most common luminance (in steps of 8): the paper or highlight behind the glyphs.
  const hist = new Uint32Array(32);
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const v = l[y * r.width + x];
      if (v > bg) bg = v;
      hist[v >> 3]++;
    }
  }
  let mode = 0;
  for (let k = 1; k < 32; k++) if (hist[k] > hist[mode]) mode = k;
  let total = 0;
  let n = 0;
  let wsum = 0;
  let cr = 0;
  let cg = 0;
  let cb = 0;
  let bn = 0;
  let br = 0;
  let bgG = 0;
  let bb = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const p = y * r.width + x;
      const q = p * 4;
      const v = bg - l[p];
      total += v;
      if (v > 40) {
        n++;
        wsum += v;
        cr += (d[q] - l[p]) * v;
        cg += (d[q + 1] - l[p]) * v;
        cb += (d[q + 2] - l[p]) * v;
      }
      if (l[p] >> 3 === mode) {
        bn++;
        br += d[q];
        bgG += d[q + 1];
        bb += d[q + 2];
      }
    }
  }
  // Normalise by scale² so both rasters are comparable.
  return {
    total: total / (r.scale * r.scale),
    chroma: wsum ? [cr / wsum, cg / wsum, cb / wsum] : [0, 0, 0],
    n,
    bg: bn ? [br / bn, bgG / bn, bb / bn] : [255, 255, 255],
  };
}

/** Darkness (0–1) of each pixel of a token's box, extended a little below for underlines. */
function boxDarkness(side: Prepared, rect: Rect): { d: Float32Array; cols: number; rows: number; top: number } {
  const { r, lum } = side;
  const s = r.scale;
  const x0 = Math.max(0, Math.round(rect.x * s));
  const x1 = Math.min(r.width, Math.round((rect.x + rect.w) * s));
  const y0 = Math.max(0, Math.floor(rect.y * s));
  const y1 = Math.min(r.height, Math.ceil((rect.y + rect.h * 1.15) * s));
  const cols = Math.max(0, x1 - x0);
  const rows = Math.max(0, y1 - y0);
  const d = new Float32Array(cols * rows);
  for (let k = 0; k < rows; k++) for (let c = 0; c < cols; c++) d[k * cols + c] = (255 - lum[(y0 + k) * r.width + x0 + c]) / 255;
  return { d, cols, rows, top: y0 / s };
}

/**
 * A line through or under the token in `b` that `a` does not have: rows
 * where nearly every column of `b` is dark but not those of `a`, while the
 * rest of the glyphs is unchanged. Darkness is summed over a few rows, so the
 * same glyph rendered at another sub-pixel position looks the same.
 */
function addedLine(a: Prepared, ra: Rect, b: Prepared, rb: Rect): 'strike' | 'underline' | null {
  // A box narrower than this has too few pixel columns to tell a line from
  // a glyph drawn at another sub-pixel position. A single figure struck
  // through ("<s>5</s> working days") is a common redline, so the limit is
  // one narrow glyph: at the visual stage's 1.5 px/pt that is still 4–5
  // columns, and the tests below need nearly all of them dark in the line's
  // rows and the other rows unchanged.
  if (rb.w < 3) return null;
  if (Math.abs(ra.w - rb.w) > 0.15 * Math.max(ra.w, rb.w) || Math.abs(ra.h - rb.h) > 0.15 * Math.max(ra.h, rb.h)) return null;
  const A = boxDarkness(a, ra);
  const B = boxDarkness(b, rb);
  if (A.cols < 4 || B.cols < 4) return null;
  const n = Math.min(A.rows, B.rows);
  const prof = (X: typeof A) => {
    const p = new Float32Array(X.rows);
    for (let k = 0; k < X.rows; k++) {
      let sum = 0;
      for (let c = 0; c < X.cols; c++) sum += X.d[k * X.cols + c];
      p[k] = sum / X.cols;
    }
    return p;
  };
  const pa = prof(A);
  const pb = prof(B);
  // Rows summed over a window of 2·half+1 around k.
  const win = (p: Float32Array, k: number, half: number) => {
    let sum = 0;
    for (let j = k - half; j <= k + half; j++) sum += p[j] ?? 0;
    return sum;
  };
  // Best vertical alignment of the two boxes (sub-pixel placement).
  let off = 0;
  let bestErr = Infinity;
  for (let o = -2; o <= 2; o++) {
    let err = 0;
    for (let k = 0; k < n; k++) err += Math.abs(win(pb, k, 1) - win(pa, k + o, 1));
    if (err < bestErr) {
      bestErr = err;
      off = o;
    }
  }
  // Share of columns that are dark within rows k-half..k+half.
  const share = (X: typeof A, k: number, half: number) => {
    let dark = 0;
    for (let c = 0; c < X.cols; c++) {
      let sum = 0;
      for (let j = Math.max(0, k - half); j <= Math.min(X.rows - 1, k + half); j++) sum += X.d[j * X.cols + c];
      if (sum >= 0.6) dark++;
    }
    return dark / X.cols;
  };
  // A line adds about its own darkness to its rows (minus what glyphs
  // already covered); a glyph stroke drawn a little darker adds far less.
  const line = (k: number) => share(B, k, 1) >= 0.85 && share(A, k + off, 1) <= 0.7 && win(pb, k, 1) - win(pa, k + off, 1) >= 0.45;
  for (let k = 0; k < n; k++) {
    if (!line(k)) continue;
    let e = k;
    while (e + 1 < n && line(e + 1)) e++;
    if (e - k > Math.ceil(1.5 * b.r.scale) + 2) return null;
    // Unchanged elsewhere: the rest of the profile matches.
    let diff = 0;
    let total = 0;
    for (let j = 1; j < n - 1; j++) {
      if (j >= k - 3 && j <= e + 3) continue;
      diff += Math.abs(win(pb, j, 1) - win(pa, j + off, 1));
      total += win(pa, j + off, 1);
    }
    // A token of one or two glyphs (narrower than 8 pt) may have a stroke
    // across its whole width of its own (the bar of a "4"); drawn at another
    // sub-pixel position it can look like a line. Its other rows must then
    // match almost exactly: a line added to the same glyph leaves them as
    // they were.
    const narrow = rb.w < 8;
    if (diff > (narrow ? 0.08 : 0.35) * total + (narrow ? 0.1 : 0.5)) return null;
    const rel = (B.top + (k + e + 1) / 2 / b.r.scale - rb.y) / rb.h;
    if (rel < 0.3) return null;
    return rel >= 0.72 ? 'underline' : 'strike';
  }
  return null;
}

/**
 * Matched text whose appearance changed: colour or stroke weight (turned red,
 * synthetic bold), background (highlighted) or a line through or under it.
 */
function appearanceChanges(
  result: CompareResult,
  oldPage: number,
  newPage: number,
  A: Prepared,
  B: Prepared,
  skip: (b: Token) => boolean,
  near: (a: Token, b: Token) => boolean,
): Change[] {
  const TA = result.oldDoc.tokens;
  const TB = result.newDoc.tokens;
  const m = result.matches;
  type Hit = { a: Token; b: Token; colour: boolean; line?: { line: 'strike' | 'underline'; added: boolean } };
  const hits: Hit[] = [];
  for (let p = 0; p < m.length; p += 2) {
    const a = TA[m[p]];
    const b = TB[m[p + 1]];
    if (a.page !== oldPage || b.page !== newPage || a.kind === 'punct' || skip(b)) continue;
    if (a.rects.length !== 1 || b.rects.length !== 1) continue;
    const added = addedLine(A, a.rects[0], B, b.rects[0]);
    const removed = added ? null : addedLine(B, b.rects[0], A, a.rects[0]);
    if (added || removed) {
      hits.push({ a, b, colour: false, line: { line: (added ?? removed)!, added: !!added } });
      continue;
    }
    // A graphic that changed next to (or behind) the word explains its ink.
    if (near(a, b)) continue;
    const ia = ink(A, a.rects[0]);
    const ib = ink(B, b.rects[0]);
    if (ia.n < 6 || ib.n < 6) continue;
    const colour =
      Math.hypot(ia.chroma[0] - ib.chroma[0], ia.chroma[1] - ib.chroma[1], ia.chroma[2] - ib.chroma[2]) > 30 ||
      Math.max(Math.abs(ia.bg[0] - ib.bg[0]), Math.abs(ia.bg[1] - ib.bg[1]), Math.abs(ia.bg[2] - ib.bg[2])) > 40;
    const weight = Math.abs(ia.total - ib.total) / Math.max(ia.total, ib.total, 1) > 0.3;
    if (colour || weight) hits.push({ a, b, colour });
  }
  // Text of a group: every token from the first hit to the last, so a word
  // skipped in between (punctuation, a short word) is not left out. Tokens
  // that are not contiguous on this side (text that moved) give the hits only.
  const span = (all: Token[], hit: Token[]) => {
    const first = hit[0].i;
    const last = hit[hit.length - 1].i;
    const lines = new Set(hit.map((t) => t.line));
    const run = all.slice(first, last + 1).filter((t) => lines.has(t.line) && !t.furniture);
    return joinTokens(run.length && last - first < Math.max(8, 2 * hit.length) ? run : hit);
  };
  // One rect per line, so a change that continues onto the next line does
  // not highlight the whole paragraph between them.
  const perLine = (page: number, ts: Token[]) => {
    const byLine = new Map<number, Rect[]>();
    for (const t of ts) {
      const rs = byLine.get(t.line);
      if (rs) rs.push(t.rects[0]);
      else byLine.set(t.line, [t.rects[0]]);
    }
    return [...byLine.values()].map((rs) => ({ page, rect: union(rs) }));
  };
  const out: Change[] = [];
  let group: Hit[] = [];
  const flush = () => {
    // A weight change must be consistent over at least two neighbouring
    // tokens; a colour change or a line through or under text is
    // convincing on its own.
    if (group.length && (group.length >= 2 || group[0].colour || group[0].line)) {
      const newRects = group.map((h) => h.b.rects[0]);
      out.push({
        id: '',
        kind: 'graphic',
        category: 'visual',
        old: { pages: [oldPage], rects: perLine(oldPage, group.map((h) => h.a)), text: span(TA, group.map((h) => h.a)) },
        new: { pages: [newPage], rects: perLine(newPage, group.map((h) => h.b)), text: span(TB, group.map((h) => h.b)) },
        format: group[0].line ? { appearanceChanged: true, decoration: group[0].line } : { appearanceChanged: true },
        size: group.length,
        cjk: group.some((h) => h.b.kind === 'cjk'),
        contextBefore: '',
        contextAfter: '',
        order: newPage * 100000 + newRects[0].y,
      });
    }
    group = [];
  };
  const key = (h: Hit) => (h.line ? `${h.line.line}:${h.line.added}` : '');
  // A line through or under text that goes on at the start of the next line
  // of the same paragraph is one change (a struck sentence that wraps). The
  // words must follow each other on both sides.
  const wraps = (last: Hit, h: Hit) =>
    !!h.line && last.b.block === h.b.block && last.a.block === h.a.block && h.b.i > last.b.i && h.a.i > last.a.i && h.a.i - last.a.i <= 2;
  for (const h of hits) {
    const last = group[group.length - 1];
    if (last && ((last.b.line !== h.b.line && !wraps(last, h)) || h.b.i - last.b.i > 2 || key(last) !== key(h))) flush();
    group.push(h);
  }
  flush();
  return out;
}

/** Share of a rect covered by the union of other rects (estimated on a grid). */
function coveredShare(r: Rect, by: Rect[]): number {
  const hits = by.filter((e) => intersects(r, e));
  if (!hits.length || r.w <= 0 || r.h <= 0) return 0;
  const nx = Math.min(48, Math.max(1, Math.ceil(r.w)));
  const ny = Math.min(48, Math.max(1, Math.ceil(r.h)));
  let n = 0;
  for (let j = 0; j < ny; j++) {
    const y = r.y + ((j + 0.5) * r.h) / ny;
    for (let i = 0; i < nx; i++) {
      const x = r.x + ((i + 0.5) * r.w) / nx;
      if (hits.some((e) => x >= e.x && x < e.x + e.w && y >= e.y && y < e.y + e.h)) n++;
    }
  }
  return n / (nx * ny);
}

/**
 * The pixels of a region (src page points) reappear in dst when shifted by
 * (dx, dy) points, give or take SHIFT_PT (a frame around a re-aligned line
 * need not move by exactly as much as the line) and a pixel of stroke
 * width. Colours must match: a stamp that moved and changed colour did not
 * just move.
 */
function movedWith(src: Pick<Prepared, 'r' | 'mask'>, dst: Pick<Prepared, 'r'>, r: Rect, dx: number, dy: number, inkOnly = false): boolean {
  const rs = src.r;
  const rd = dst.r;
  const sd = rs.data;
  const dd = rd.data;
  const x0 = Math.max(0, Math.floor(r.x * rs.scale));
  const y0 = Math.max(0, Math.floor(r.y * rs.scale));
  const x1 = Math.min(rs.width, Math.ceil((r.x + r.w) * rs.scale));
  const y1 = Math.min(rs.height, Math.ceil((r.y + r.h) * rs.scale));
  const step = Math.max(1, Math.round(Math.sqrt(((x1 - x0) * (y1 - y0)) / (inkOnly ? 8000 : 2000))));
  const ratio = rd.scale / rs.scale;
  const pts: number[] = [];
  // With `inkOnly`, paper is not sampled: a region that is mostly paper
  // would otherwise match anywhere.
  const inked = (p: number) => !inkOnly || Math.min(sd[p * 4], sd[p * 4 + 1], sd[p * 4 + 2]) < 230;
  for (let y = y0; y < y1; y += step) {
    for (let x = x0; x < x1; x += step) {
      const p = y * rs.width + x;
      if (src.mask[p] !== GLYPH && src.mask[p] !== PAD && inked(p)) pts.push(x, y);
    }
  }
  if (!pts.length || (inkOnly && pts.length < 2 * 12)) return false;
  // The colour of p lies within the colours around q (unblurred, so a
  // thicker or thinner stroke of the same colour still matches).
  const near = (p: number, qx: number, qy: number) => {
    if (qx < 1 || qy < 1 || qx >= rd.width - 1 || qy >= rd.height - 1) return false;
    const a = p * 4;
    for (let ch = 0; ch < 3; ch++) {
      let lo = 255;
      let hi = 0;
      for (let j = -1; j <= 1; j++) {
        for (let i = -1; i <= 1; i++) {
          const v = dd[((qy + j) * rd.width + qx + i) * 4 + ch];
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
      }
      if (sd[a + ch] < lo - 48 || sd[a + ch] > hi + 48) return false;
    }
    return true;
  };
  const S = Math.round(SHIFT_PT * rd.scale);
  const allowed = 0.15 * (pts.length / 2);
  for (let oy = -S; oy <= S; oy++) {
    for (let ox = -S; ox <= S; ox++) {
      let miss = 0;
      for (let k = 0; k < pts.length && miss <= allowed; k += 2) {
        const x = pts[k];
        const y = pts[k + 1];
        if (!near(y * rs.width + x, Math.round(x * ratio + dx * rd.scale) + ox, Math.round(y * ratio + dy * rd.scale) + oy)) miss++;
      }
      if (miss <= allowed) return true;
    }
  }
  return false;
}

/** Page pair (old:new) each visual change was found on, for merging across pairs. */
const foundOn = new WeakMap<Change, string>();

/** Text masks of rasters that are looked at again after their pair was compared. */
const masks = new WeakMap<Raster, Uint8Array>();
function maskOf(doc: DocModel, page: number, r: Raster): Uint8Array {
  let m = masks.get(r);
  if (!m) masks.set(r, (m = textMask(doc, page, r, luminance(r))));
  return m;
}

/** The page pair (old, new) a visual change was found on by compareRasters. */
export function foundOnPair(c: Change): [number, number] | null {
  const k = foundOn.get(c);
  if (!k) return null;
  const [o, n] = k.split(':').map(Number);
  return [o, n];
}

/**
 * A region found on one side only of one page pair (`side`, in that page's
 * points) reappears on the other page of another pair, displaced like the
 * matched line next to it, give or take SHIFT_PT: a figure that went to the
 * next page with the text after it. Only the region's ink is compared, and
 * nearly all of it (see movedWith) must be there in the same colours, so a
 * figure that was removed or changed while the text re-flowed does not match.
 */
export function reappears(result: CompareResult, oldPage: number, newPage: number, ra: Raster, rb: Raster, side: 'old' | 'new', rect: Rect): boolean {
  const invert = side === 'new';
  const own = anchorsFor(result, oldPage, newPage, invert).filter((a) => a.own);
  if (!own.length) return false;
  const [doc, page, rs, rd] = invert ? [result.newDoc, newPage, rb, ra] : [result.oldDoc, oldPage, ra, rb];
  const src = { r: rs, mask: maskOf(doc, page, rs) };
  const mid = rect.y + rect.h / 2;
  const above = own.filter((a) => a.y <= mid).pop();
  const below = own.find((a) => a.y > mid);
  // A line that re-wrapped also moved sideways; a figure below it did not.
  return [above, below].some((a) => !!a && (movedWith(src, { r: rd }, rect, 0, a.dy, true) || (a.dx !== 0 && movedWith(src, { r: rd }, rect, a.dx, a.dy, true))));
}

/**
 * A region removed from an old page and one added to a new page look the
 * same: of similar size, with each one's ink found in the other at their
 * offset (give or take SHIFT_PT).
 */
export function sameGraphic(result: CompareResult, oldPage: number, newPage: number, ra: Raster, rb: Raster, o: Rect, n: Rect): boolean {
  const similar = (u: number, v: number) => Math.abs(u - v) <= Math.max(2 * SHIFT_PT, 0.2 * Math.max(u, v));
  if (!similar(o.w, n.w) || !similar(o.h, n.h)) return false;
  const A = { r: ra, mask: maskOf(result.oldDoc, oldPage, ra) };
  const B = { r: rb, mask: maskOf(result.newDoc, newPage, rb) };
  return movedWith(A, B, o, n.x - o.x, n.y - o.y, true) && movedWith(B, A, n, o.x - n.x, o.y - n.y, true);
}

/**
 * Compare one old page with one new page. Regions already explained by text
 * changes on these pages are not reported again; regions whose graphics only
 * moved by a few points are returned as `minor` changes. `whole` says that
 * the two pages correspond as a whole (mutual best match, a page without
 * text, or paired by the reviewer): they are then compared even without
 * shared text, and areas outside the smaller page count as blank paper.
 */
export function compareRasters(
  result: CompareResult,
  oldPage: number,
  newPage: number,
  ra: Raster,
  rb: Raster,
  options: { appearance?: boolean; whole?: boolean } = {},
): Change[] {
  const A = prepare(result.oldDoc, oldPage, ra);
  const B = prepare(result.newDoc, newPage, rb);
  const whole = !!options.whole;
  let fwd = anchorsFor(result, oldPage, newPage, false);
  let bwd = anchorsFor(result, oldPage, newPage, true);
  const identity = !fwd.some((a) => a.own);
  if (identity) {
    // No shared text: only compare when the pages are paired as a whole.
    if (!whole && result.oldToNew[oldPage] !== newPage) return [];
    fwd = [{ y: 0, dx: 0, dy: 0, own: true }];
    bwd = [{ y: 0, dx: 0, dy: 0, own: true }];
  }
  const ownF = fwd.filter((a) => a.own);
  const ownB = bwd.filter((a) => a.own);
  const fwdDiff = unmatched(A, B, fwd, whole, identity);
  const bwdDiff = unmatched(B, A, bwd, whole, identity);
  if (debugHook) debugHook({ fwd, bwd, oldRaw: fwdDiff.real, newRaw: bwdDiff.real, oldShift: fwdDiff.shifted, newShift: bwdDiff.shifted });
  const oldRects = cluster(fwdDiff.real, ra.width / ra.scale);
  const newRects = cluster(bwdDiff.real, rb.width / rb.scale);

  // Regions explained by text changes on the same page. Text that moved
  // sideways explains the spot it left and where it went, and a frame or
  // stamp around it only if that moved along with it.
  const positions = result.changes.filter((c) => c.kind === 'position' && c.old.rects.length && c.new.rects.length);
  const zones = (side: 'old' | 'new', page: number) => {
    const out: Rect[] = [];
    for (const c of result.changes) if (c.category === 'text') for (const r of c[side].rects) if (r.page === page) out.push(expand(r.rect, 9));
    for (const c of positions) if (c[side].pages[0] === page) for (const r of [...c.old.rects, ...c.new.rects]) out.push(expand(r.rect, 4));
    return out;
  };
  const keep = (rects: Rect[], side: 'old' | 'new') => {
    const page = side === 'old' ? oldPage : newPage;
    const explained = zones(side, page);
    const [src, dst] = side === 'old' ? [A, B] : [B, A];
    return rects.filter((r) => {
      if (coveredShare(r, explained) >= 0.6) return false;
      for (const c of positions) {
        if (c[side].pages[0] !== page) continue;
        const o = c.old.rects[0].rect;
        const n = c.new.rects[0].rect;
        const near = [...c.old.rects, ...c.new.rects].some((q) => intersects(expand(q.rect, 36), r));
        const sign = side === 'old' ? 1 : -1;
        if (near && movedWith(src, dst, r, sign * (n.x - o.x), sign * (n.y - o.y))) return false;
      }
      return true;
    });
  };
  const oldKeep = keep(oldRects, 'old');
  const newKeep = keep(newRects, 'new');

  const mapWith = (anchors: Anch[]) => (r: Rect): Rect => {
    let best = anchors[0] ?? { y: 0, dx: 0, dy: 0, own: true };
    for (const a of anchors) if (a.y <= r.y + r.h / 2) best = a;
    return { x: r.x + best.dx, y: r.y + best.dy, w: r.w, h: r.h };
  };
  const toNew = mapWith(ownF);
  const toOld = mapWith(ownB);

  // Pair old and new regions that correspond to each other.
  const changes: Change[] = [];
  const usedNew = new Set<number>();
  // Next to a line that moved, the line's displacement says nothing about a
  // graphic that stayed put: try the same position too.
  const byMovedLine = (r: Rect) => positions.some((c) => [...c.old.rects, ...c.new.rects].some((q) => intersects(expand(q.rect, 36), r)));
  const owner = new Map<number, Change>();
  for (const r of oldKeep) {
    const s = expand(toNew(r), 10);
    const same = expand(r, 10);
    const all = newKeep.map((n, k) => [n, k] as const);
    let partners = all.filter(([n]) => intersects(s, n) || (byMovedLine(r) && intersects(same, n)));
    // On pages that correspond as a whole, the same spot is the next best guess
    // (a table whose columns were rearranged maps its rows far off).
    if (!partners.length && whole) partners = all.filter(([n]) => intersects(same, n));
    // A new region already paired with another old region: one change.
    const taken = partners.find(([, k]) => usedNew.has(k));
    if (taken) {
      const c = owner.get(taken[1])!;
      c.old.rects.push({ page: oldPage, rect: r });
      for (const [n, k] of partners) if (!usedNew.has(k)) (usedNew.add(k), owner.set(k, c), c.new.rects.push({ page: newPage, rect: n }));
      continue;
    }
    const nr = partners.map(([n]) => n);
    const c = graphicChange(oldPage, newPage, [r], nr, nr[0]?.y ?? toNew(r).y);
    partners.forEach(([, k]) => (usedNew.add(k), owner.set(k, c)));
    changes.push(c);
  }
  newKeep.forEach((n, k) => {
    if (!usedNew.has(k)) changes.push(graphicChange(oldPage, newPage, [], [n], n.y));
  });
  // A region found on one side only gets the other side's location when
  // that spot is blank next to a graphic (a bar that grew, a line that got
  // longer): the reviewer sees the graphic as it was.
  for (const c of changes) {
    const added = !c.old.rects.length;
    if (!added && c.new.rects.length) continue;
    const [side, other] = added ? (['new', 'old'] as const) : (['old', 'new'] as const);
    const map = added ? toOld : toNew;
    const spots = added ? fwdDiff.beside : bwdDiff.beside;
    const page = added ? oldPage : newPage;
    for (const r of c[side].rects) {
      const near = spots.find((g) => intersects(expand(map(r.rect), 10), g) || (whole && intersects(expand(r.rect, 10), g)));
      if (near && !c[other].rects.some((q) => intersects(q.rect, near))) c[other].rects.push({ page, rect: near });
    }
    c[other].pages = c[other].rects.length ? [page] : [];
  }

  // Minor shifts: only where neither side has a real difference.
  const clear = (r: Rect, same: Rect[], other: Rect[], map: (r: Rect) => Rect) =>
    !same.some((q) => intersects(expand(q, 4), r)) && !other.some((q) => intersects(expand(q, 6), map(r)));
  const oldShift = keep(cluster(fwdDiff.shifted, ra.width / ra.scale).filter((r) => clear(r, oldRects, newRects, toNew)), 'old');
  const newShift = keep(cluster(bwdDiff.shifted, rb.width / rb.scale).filter((r) => clear(r, newRects, oldRects, toOld)), 'new');
  if (oldShift.length || newShift.length) {
    const minor = graphicChange(oldPage, newPage, oldShift, newShift, (newShift[0] ?? oldShift[0]).y);
    minor.minor = true;
    changes.push(minor);
  }

  if (options.appearance !== false) {
    // Tokens a formatting change already reports — every place of an
    // aggregated one, found by position as well as by token range.
    const skip = new Set<number>();
    const fmtRects: Rect[] = [];
    for (const c of result.changes) {
      if (c.kind !== 'format') continue;
      if (c.new.start !== undefined) for (let i = c.new.start; i < c.new.end!; i++) skip.add(i);
      for (const r of c.new.rects) if (r.page === newPage) fmtRects.push(r.rect);
    }
    const inFormat = (b: Token) => skip.has(b.i) || coveredShare(b.rects[0], fmtRects) >= 0.5;
    const near = (a: Token, b: Token) => differsNear(fwdDiff, ra, a.rects[0]) || differsNear(bwdDiff, rb, b.rects[0]);
    changes.push(...appearanceChanges(result, oldPage, newPage, A, B, inFormat, near));
  }
  for (const c of changes) foundOn.set(c, `${oldPage}:${newPage}`);
  return changes;
}

/** Merge difference regions that are close together (e.g. the borders of one table). */
function cluster(rects: Rect[], pageWidth: number, gap = 18): Rect[] {
  const out = rects.map((r) => ({ ...r }));
  // Same horizontal band (e.g. several column borders of one table).
  const sameBand = (a: Rect, b: Rect) => {
    const overlap = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    const hgap = Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w);
    return overlap > 0.6 * Math.min(a.h, b.h) && hgap < 0.6 * pageWidth;
  };
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        if (intersects(expand(out[i], gap / 2), expand(out[j], gap / 2)) || sameBand(out[i], out[j])) {
          out[i] = union([out[i], out[j]]);
          out.splice(j, 1);
          merged = true;
          break outer;
        }
      }
    }
  }
  return out;
}

function graphicChange(oldPage: number, newPage: number, oldR: Rect[], newR: Rect[], y: number): Change {
  return {
    id: '',
    kind: 'graphic',
    category: 'visual',
    old: { pages: oldR.length ? [oldPage] : [], rects: oldR.map((rect) => ({ page: oldPage, rect })), text: '' },
    new: { pages: newR.length ? [newPage] : [], rects: newR.map((rect) => ({ page: newPage, rect })), text: '' },
    size: 0,
    cjk: false,
    contextBefore: '',
    contextAfter: '',
    order: newPage * 100000 + y,
  };
}

export interface VisualPair {
  old: number;
  new: number;
  /** The pages correspond as a whole (see compareRasters). */
  whole: boolean;
}

/** Pages without text, between two paired pages, that the page map could not pair. */
export interface TextlessGap {
  old: number[];
  new: number[];
  /** The paired pages before and after the gap ([old, new]), if any. */
  before: [number, number] | null;
  after: [number, number] | null;
}

/**
 * Page pairs worth comparing visually, in document order. Pages without text
 * that the page map left unpaired are paired in order between the nearest
 * paired pages on both sides; where their numbers differ, they are returned
 * as gaps for the caller to resolve (by looking at the pages).
 */
export function planVisual(result: CompareResult): { pairs: VisualPair[]; gaps: TextlessGap[] } {
  const nOld = result.oldDoc.pages.length;
  const nNew = result.newDoc.pages.length;
  const tlOld = new Set(result.coverage?.old.textless ?? []);
  const tlNew = new Set(result.coverage?.new.textless ?? []);
  const pairs = new Map<string, VisualPair>();
  const add = (o: number, n: number, whole: boolean) => {
    const k = `${o}:${n}`;
    const cur = pairs.get(k);
    if (cur) cur.whole ||= whole;
    else pairs.set(k, { old: o, new: n, whole });
  };
  for (const l of result.pageLinks) if (l.weight >= 3 || l.manual) add(l.oldPage, l.newPage, !!l.manual);
  const pageLevel = (o: number, n: number) => result.oldToNew[o] === n && result.newToOld[n] === o;
  result.oldToNew.forEach((np, op) => {
    if (np >= 0) add(op, np, pageLevel(op, np) || tlOld.has(op) || tlNew.has(np));
  });
  result.newToOld.forEach((op, np) => {
    if (op >= 0 && (tlOld.has(op) || tlNew.has(np))) add(op, np, true);
  });
  // Longest chain of pairs in document order on both sides.
  const sorted = [...pairs.values()].sort((a, b) => a.old - b.old || b.new - a.new);
  const tails: number[] = [];
  const prev = new Array<number>(sorted.length).fill(-1);
  for (let i = 0; i < sorted.length; i++) {
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[tails[mid]].new < sorted[i].new) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0) prev[i] = tails[lo - 1];
    tails[lo] = i;
  }
  const chain: [number, number][] = [];
  for (let i = tails.length ? tails[tails.length - 1] : -1; i >= 0; i = prev[i]) chain.unshift([sorted[i].old, sorted[i].new]);
  const pairedOld = new Set(sorted.map((p) => p.old));
  const pairedNew = new Set(sorted.map((p) => p.new));
  const gaps: TextlessGap[] = [];
  const bounds: [number, number][] = [[-1, -1], ...chain, [nOld, nNew]];
  for (let k = 0; k + 1 < bounds.length; k++) {
    const [o1, n1] = bounds[k];
    const [o2, n2] = bounds[k + 1];
    const lo: number[] = [];
    const ln: number[] = [];
    for (let p = o1 + 1; p < o2; p++) if (tlOld.has(p) && !pairedOld.has(p)) lo.push(p);
    for (let p = n1 + 1; p < n2; p++) if (tlNew.has(p) && !pairedNew.has(p)) ln.push(p);
    if (lo.length && lo.length === ln.length) lo.forEach((o, i) => add(o, ln[i], true));
    else if (lo.length || ln.length) gaps.push({ old: lo, new: ln, before: k > 0 ? [o1, n1] : null, after: k + 2 < bounds.length ? [o2, n2] : null });
  }
  return { pairs: [...pairs.values()].sort((a, b) => a.new - b.new || a.old - b.old), gaps };
}

/**
 * Graphics on a page that no page of the other version corresponds to: ink
 * outside the text, as regions in page points. What a neighbouring page of
 * the same document has at the same place (a running header's rule, a logo,
 * a slide's background) is left out: it belongs to the template, not to the
 * page's content.
 */
export function pageGraphics(doc: DocModel, page: number, r: Raster, neighbours: { page: number; r: Raster }[]): Rect[] {
  const src = prepare(doc, page, r);
  const others = neighbours.map((n) => prepare(doc, n.page, n.r));
  const W = r.width;
  const H = r.height;
  const cols = Math.ceil(W / CELL);
  const rows = Math.ceil(H / CELL);
  const cells = new Uint16Array(cols * rows);
  const [s0, s1, s2] = src.planes;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = y * W + x;
      if (src.mask[p] === GLYPH || src.mask[p] === PAD || Math.min(s0[p], s1[p], s2[p]) >= 235) continue;
      const template = others.some((o) => {
        const qx = Math.round((x * o.r.scale) / r.scale);
        const qy = Math.round((y * o.r.scale) / r.scale);
        return qx < o.r.width && qy < o.r.height && colourFit(src, o, qy * o.r.width + qx, p);
      });
      if (!template) cells[((y / CELL) | 0) * cols + ((x / CELL) | 0)]++;
    }
  }
  return cluster(
    components(cells, cols, rows, r.scale).map((c) => c.rect),
    W / r.scale,
  );
}

/** Page pairs worth comparing visually, in document order. */
export function visualPairs(result: CompareResult): [number, number][] {
  return planVisual(result).pairs.map((p) => [p.old, p.new]);
}

/** Coarse look of a page (for telling pages without text apart) and the box around its ink. */
export function pageSignature(r: Raster): { grid: Float32Array; ink: Rect | null } {
  const N = 16;
  const grid = new Float32Array(N * N);
  const count = new Float32Array(N * N);
  const d = r.data;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < r.height; y++) {
    const gy = Math.min(N - 1, ((y * N) / r.height) | 0);
    for (let x = 0; x < r.width; x++) {
      const j = (y * r.width + x) * 4;
      const a = d[j + 3] / 255;
      const l = (0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2]) * a + 255 * (1 - a);
      const g = gy * N + Math.min(N - 1, ((x * N) / r.width) | 0);
      grid[g] += 255 - l;
      count[g]++;
      if (l < 240) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  for (let g = 0; g < grid.length; g++) grid[g] = count[g] ? grid[g] / count[g] : 0;
  const s = r.scale;
  return { grid, ink: x1 < 0 ? null : { x: x0 / s, y: y0 / s, w: (x1 - x0 + 1) / s, h: (y1 - y0 + 1) / s } };
}

/**
 * Best order-preserving assignment of the pages in `a` to pages in `b`
 * (signatures), all of the shorter list matched. Returns index pairs.
 */
export function alignPages(a: Float32Array[], b: Float32Array[]): [number, number][] {
  const swap = a.length > b.length;
  const [s, l] = swap ? [b, a] : [a, b];
  const dist = (u: Float32Array, v: Float32Array) => {
    let d = 0;
    for (let k = 0; k < u.length; k++) d += Math.abs(u[k] - v[k]);
    return d;
  };
  const m = s.length;
  const n = l.length;
  // cost[i][j]: best cost of matching s[0..i) into l[0..j).
  const cost: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(Infinity));
  const take: boolean[][] = Array.from({ length: m + 1 }, () => new Array<boolean>(n + 1).fill(false));
  for (let j = 0; j <= n; j++) cost[0][j] = 0;
  for (let i = 1; i <= m; i++) {
    for (let j = i; j <= n; j++) {
      const skip = cost[i][j - 1];
      const use = cost[i - 1][j - 1] + dist(s[i - 1], l[j - 1]);
      if (use <= skip) {
        cost[i][j] = use;
        take[i][j] = true;
      } else cost[i][j] = skip;
    }
  }
  const out: [number, number][] = [];
  for (let i = m, j = n; i > 0 && j > 0; ) {
    if (take[i][j]) {
      out.unshift(swap ? [j - 1, i - 1] : [i - 1, j - 1]);
      i--;
      j--;
    } else j--;
  }
  return out;
}

/**
 * Merge graphic changes that several page pairs found for the same region
 * (an old page compared with two new pages after re-pagination). Changes
 * from the same pair, and colour/format changes of text, are never merged.
 */
export function dedupeGraphics(changes: Change[]): Change[] {
  const plain = (c: Change) => c.kind === 'graphic' && !c.format && !c.pageChange;
  const otherPair = (a: Change, b: Change) => foundOn.get(a) !== foundOn.get(b);
  const out: Change[] = [];
  for (const c of changes) {
    const dup =
      plain(c) && c.new.rects.length > 0
        ? out.find((o) => plain(o) && otherPair(o, c) && o.new.rects.some((r) => c.new.rects.some((s) => r.page === s.page && intersects(expand(r.rect, 4), s.rect))))
        : undefined;
    if (!dup) {
      out.push(c);
      continue;
    }
    for (const side of ['old', 'new'] as const) {
      for (const r of c[side].rects) if (!dup[side].rects.some((s) => s.page === r.page && intersects(s.rect, r.rect))) dup[side].rects.push(r);
      dup[side].pages = [...new Set(dup[side].rects.map((r) => r.page))].sort((a, b) => a - b);
    }
  }
  // Also drop old-only regions that a graphic change of another pair already covers.
  return out.filter((c) => {
    if (c.new.rects.length > 0 || !plain(c)) return true;
    const others = out.filter((o) => o !== c && plain(o) && otherPair(o, c));
    return !c.old.rects.every((r) => coveredShare(r.rect, others.flatMap((o) => o.old.rects.filter((s) => s.page === r.page).map((s) => s.rect))) >= 0.6);
  });
}
