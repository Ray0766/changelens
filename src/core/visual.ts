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
import type { Change, CompareResult, DocModel, Rect, TextRun, Token } from './types.ts';
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
 * The same for a thin line (a table rule, a cell border) that a single pixel
 * across it explains: the same line drawn at another sub-pixel position
 * after the text around it moved by a fraction of a pixel. Its anti-aliased
 * rows carry up to about a third more or less ink then (measured on Chromium
 * table rules printed after a re-flow, rendered by PDF.js: 0.74–1.3).
 */
const BALANCE_PHASE = 0.35;

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

/** A run set at an angle that is not a quarter turn (a DRAFT watermark, a stamp). */
function slantedRun(run: TextRun): boolean {
  return !!run.rot && run.angle % 90 !== 0;
}

/**
 * The band of a run set at an angle: its letters' box along the text
 * direction (the advance, ascent and descent), padded by `pad` points. Its
 * bounding box on the page, and a test for page points.
 */
function slantBand(run: TextRun, pad: number): { box: Rect; inside: (x: number, y: number) => boolean } {
  const a = (run.angle * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const u0 = run.rot!.x * cos + run.baseline * sin - pad;
  const v0 = -run.rot!.x * sin + run.baseline * cos;
  const u1 = u0 + run.rot!.len + 2 * pad;
  const top = v0 - run.rot!.ascent - pad;
  const bottom = v0 + run.rot!.descent + pad;
  return {
    box: expand(run, pad),
    inside: (x, y) => {
      const u = x * cos + y * sin;
      const w = -x * sin + y * cos;
      return u >= u0 && u <= u1 && w >= top && w <= bottom;
    },
  };
}

/**
 * Where the text is. Each run's box is masked, plus a padding for glyph parts
 * outside it. A long thin horizontal line inside that padding — a rule above
 * a paragraph, an underline below a run, a table border close to the text —
 * is not text, so it is taken out of the mask again and compared. With
 * `angled` false, text set at an angle is left out (see refineSlanted).
 */
function textMask(doc: DocModel, page: number, r: Raster, lum: Uint8Array, angled = true): Uint8Array {
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
  // Text set at an angle (a DRAFT watermark, a stamp) is masked along its
  // letters only: its bounding box can cover half the page.
  const slanted = slantedRun;
  const fillSlanted = (run: TextRun, pad: number, v: number, onlyEmpty: boolean) => {
    const band = slantBand(run, pad);
    const b = band.box;
    const x0 = Math.max(0, Math.floor(b.x * s));
    const y0 = Math.max(0, Math.floor(b.y * s));
    const x1 = Math.min(W, Math.ceil((b.x + b.w) * s));
    const y1 = Math.min(H, Math.ceil((b.y + b.h) * s));
    for (let y = y0; y < y1; y++) {
      const py = (y + 0.5) / s;
      for (let x = x0; x < x1; x++) {
        if (!band.inside((x + 0.5) / s, py)) continue;
        const i = y * W + x;
        if (!onlyEmpty || !m[i]) m[i] = v;
      }
    }
  };
  const runs = (doc.runs[page] ?? []).filter((run) => run.str.trim() && (angled || !slanted(run)));
  for (const run of runs) {
    if (slanted(run)) fillSlanted(run, 0.12 * run.fontSize + 1, PAD, true);
    else fill(expand(run, 0.12 * run.fontSize + 1), PAD, true);
  }
  for (const run of runs) {
    if (slanted(run)) fillSlanted(run, 0, GLYPH, false);
    else fill(run, GLYPH, false);
  }
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
  /** Text set at an angle on the page (see slantedRun), and the mask without it. */
  slanted?: { runs: TextRun[]; base: Uint8Array };
}

function prepare(doc: DocModel, page: number, r: Raster): Prepared {
  const lum = luminance(r);
  const p = planes(r).map((c) => blur(c, r.width, r.height));
  const runs = (doc.runs[page] ?? []).filter((run) => slantedRun(run) && run.str.trim());
  return {
    r,
    lum,
    mask: textMask(doc, page, r, lum),
    planes: p,
    range: p.map((c) => minMax(c, r.width, r.height)),
    ...(runs.length ? { slanted: { runs, base: textMask(doc, page, r, lum, false) } } : {}),
  };
}

/**
 * What a region `r` of page `S` holds besides what explains it: pixels that
 * are not text, not explained (`explained`, by pixel index of S), and of
 * another colour than page `O` at the same place of the region mapped there
 * (`m`), in a patch at least 3 pixels thick (not the anti-aliased edge of a
 * fill or a line that sits a pixel off) and of 2 pt² or more. The box of
 * those patches and of the thinner strokes that go on from them, up to 3 pt
 * away (the arms of an x-mark crossing in its thick middle), or null.
 */
function apartFrom(S: Prepared, O: Prepared, r: Rect, m: Rect, explained: (p: number, x: number, y: number) => boolean): Rect | null {
  const s = S.r.scale;
  const so = O.r.scale;
  const W = S.r.width;
  const x0 = Math.max(0, Math.floor(r.x * s));
  const y0 = Math.max(0, Math.floor(r.y * s));
  const x1 = Math.min(W, Math.ceil((r.x + r.w) * s));
  const y1 = Math.min(S.r.height, Math.ceil((r.y + r.h) * s));
  const w = x1 - x0;
  const h = y1 - y0;
  if (w < 3 || h < 3) return null;
  const off = new Uint8Array(w * h);
  for (let y = y0; y < y1; y++) {
    const qy = Math.floor(((y + 0.5) / s + m.y - r.y) * so);
    for (let x = x0; x < x1; x++) {
      const p = y * W + x;
      const k = S.mask[p];
      if (k === GLYPH || k === PAD || explained(p, x, y)) continue;
      const qx = Math.floor(((x + 0.5) / s + m.x - r.x) * so);
      if (qx >= 0 && qy >= 0 && qx < O.r.width && qy < O.r.height) {
        const q = qy * O.r.width + qx;
        if (S.planes.every((c, j) => Math.abs(c[p] - O.planes[j][q]) <= THRESH)) continue;
      }
      off[(y - y0) * w + (x - x0)] = 1;
    }
  }
  // Patches: pixels whose eight neighbours are all off, with their neighbours.
  let n = 0;
  let bx0 = Infinity;
  let by0 = Infinity;
  let bx1 = -Infinity;
  let by1 = -Infinity;
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      let all = true;
      for (let dy = -1; dy <= 1 && all; dy++) for (let dx = -1; dx <= 1 && all; dx++) all = off[(y + dy) * w + x + dx] === 1;
      if (!all) continue;
      n++;
      bx0 = Math.min(bx0, x - 1);
      by0 = Math.min(by0, y - 1);
      bx1 = Math.max(bx1, x + 2);
      by1 = Math.max(by1, y + 2);
    }
  if (!n) return null;
  let area = 0;
  for (let y = by0; y < by1; y++) for (let x = bx0; x < bx1; x++) area += off[y * w + x];
  if (area < 2 * s * s) return null;
  // The strokes going on from the patches: pixels that are off, joined to
  // them, within 3 pt of their box.
  const reach = Math.round(3 * s);
  const [lx0, ly0, lx1, ly1] = [Math.max(0, bx0 - reach), Math.max(0, by0 - reach), Math.min(w, bx1 + reach), Math.min(h, by1 + reach)];
  const seen = new Uint8Array(w * h);
  const stack: number[] = [];
  for (let y = by0; y < by1; y++) for (let x = bx0; x < bx1; x++) if (off[y * w + x]) (seen[y * w + x] = 1), stack.push(y * w + x);
  let [gx0, gy0, gx1, gy1] = [bx0, by0, bx1, by1];
  while (stack.length) {
    const i = stack.pop()!;
    const cx = i % w;
    const cy = (i / w) | 0;
    gx0 = Math.min(gx0, cx);
    gy0 = Math.min(gy0, cy);
    gx1 = Math.max(gx1, cx + 1);
    gy1 = Math.max(gy1, cy + 1);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < lx0 || ny < ly0 || nx >= lx1 || ny >= ly1) continue;
        const k = ny * w + nx;
        if (off[k] && !seen[k]) {
          seen[k] = 1;
          stack.push(k);
        }
      }
  }
  return { x: (x0 + gx0) / s, y: (y0 + gy0) / s, w: (gx1 - gx0) / s, h: (gy1 - gy0) / s };
}

/** A pixel's colour composited on white, not blurred. */
function rgb(r: Raster, i: number): [number, number, number] {
  const d = r.data;
  const a = d[i * 4 + 3] / 255;
  const w = 255 * (1 - a);
  return [d[i * 4] * a + w, d[i * 4 + 1] * a + w, d[i * 4 + 2] * a + w];
}

/** The colour of a run set at an angle, and how far a pixel may be from it (see slantInks). */
interface SlantInk {
  run: TextRun;
  colour: number[];
  tol: number;
}

/**
 * The colour of each run set at an angle on page `X` (a light grey DRAFT, a
 * red stamp): the most common colour of its letters' band that is not
 * paper and not other text. It must be at least a quarter of those pixels
 * and darker than paper by 12 levels or more. Runs without such a colour
 * are left out (their whole band stays masked).
 */
function slantInks(X: Prepared): SlantInk[] {
  if (!X.slanted) return [];
  const out: SlantInk[] = [];
  const s = X.r.scale;
  const W = X.r.width;
  const paper = (P: Prepared, i: number) => P.planes.every((c) => c[i] >= 243);
  for (const run of X.slanted.runs) {
    const band = slantBand(run, 0);
    const b = band.box;
    const x0 = Math.max(0, Math.floor(b.x * s));
    const y0 = Math.max(0, Math.floor(b.y * s));
    const x1 = Math.min(W, Math.ceil((b.x + b.w) * s));
    const y1 = Math.min(X.r.height, Math.ceil((b.y + b.h) * s));
    const px: number[] = [];
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        const i = y * W + x;
        if (!X.slanted.base[i] && !paper(X, i) && band.inside((x + 0.5) / s, (y + 0.5) / s)) px.push(i);
      }
    if (px.length < 40) continue;
    const bins = new Map<number, number>();
    const key = (i: number) => {
      const [r, g, b] = rgb(X.r, i);
      return ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    };
    for (const i of px) bins.set(key(i), (bins.get(key(i)) ?? 0) + 1);
    let best = -1;
    let n = 0;
    for (const [k, v] of bins) if (v > n) [best, n] = [k, v];
    if (n < 0.25 * px.length) continue;
    const mode = px.filter((i) => key(i) === best).map((i) => rgb(X.r, i));
    const colour = [0, 1, 2].map((c) => mode.map((v) => v[c]).sort((u, v) => u - v)[mode.length >> 1]);
    const dev = 255 - Math.min(...colour);
    if (dev < 12) continue;
    // The letters' inside is of one colour; their anti-aliased edges, and
    // those of a darker mark of the same hue, are not (see slantHeld).
    out.push({ run, colour, tol: Math.min(20, Math.max(8, dev / 4)) });
  }
  return out;
}

/**
 * Pixels of page `P` in the pixel box [x0, x1) × [y0, y1) that belong to the
 * letters of text set at an angle (see slantInks): inside them (of their
 * colour), within three pixels of that (anti-aliased edges, the blur), or
 * enclosed by it (a rule or a glyph they are drawn over). A map of the box.
 */
function slantHeld(P: Prepared, inks: SlantInk[], x0: number, y0: number, x1: number, y1: number): Uint8Array {
  const w = x1 - x0;
  const h = y1 - y0;
  const n = w * h;
  const ink = new Uint8Array(n);
  const d = P.r.data;
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const q = (y * P.r.width + x) * 4;
      const a = d[q + 3] / 255;
      const pw = 255 * (1 - a);
      const r = d[q] * a + pw;
      const g = d[q + 1] * a + pw;
      const b = d[q + 2] * a + pw;
      for (const k of inks)
        if (Math.abs(r - k.colour[0]) <= k.tol && Math.abs(g - k.colour[1]) <= k.tol && Math.abs(b - k.colour[2]) <= k.tol) {
          ink[(y - y0) * w + x - x0] = 1;
          break;
        }
    }
  // Square dilation (v = 1) or erosion (v = 0) by r pixels: separable, with
  // a running count of the pixels equal to v in the window.
  const grow = (src: Uint8Array, r: number, v: number) => {
    const tmp = new Uint8Array(n);
    const out = new Uint8Array(n);
    for (let j = 0; j < h; j++) {
      const row = j * w;
      let c = 0;
      for (let u = 0; u < Math.min(w, r); u++) if (src[row + u] === v) c++;
      for (let i = 0; i < w; i++) {
        if (i + r < w && src[row + i + r] === v) c++;
        if (i - r - 1 >= 0 && src[row + i - r - 1] === v) c--;
        tmp[row + i] = c > 0 ? v : 1 - v;
      }
    }
    for (let i = 0; i < w; i++) {
      let c = 0;
      for (let u = 0; u < Math.min(h, r); u++) if (tmp[u * w + i] === v) c++;
      for (let j = 0; j < h; j++) {
        if (j + r < h && tmp[(j + r) * w + i] === v) c++;
        if (j - r - 1 >= 0 && tmp[(j - r - 1) * w + i] === v) c--;
        out[j * w + i] = c > 0 ? v : 1 - v;
      }
    }
    return out;
  };
  // Grown from the inside of the letters only (ink whose neighbours are
  // ink too): the anti-aliased edge of a darker mark of the same hue passes
  // through their colour, without an inside of it.
  const inside = grow(ink, 1, 0);
  const closed = grow(grow(inside, 2, 1), 2, 0);
  return grow(closed, 3, 1);
}

/**
 * Text set at an angle on one side only, or on both, is masked over its
 * letters' band (see textMask), so what lies in that band is not compared:
 * a tick drawn between the letters of a DRAFT watermark, above its capitals
 * or below its baseline. Here the band is masked only where it holds the
 * letters (see slantHeld) or where the other page `Y` shows something where
 * it is compared (displaced like the nearest matched line, `anchors`): its
 * own watermark's letters there, or content under them. A pixel of `X` that
 * is neither paper nor the letters, where `Y` shows paper, is compared as
 * any other graphic.
 */
function refineSlanted(X: Prepared, Y: Prepared, inks: SlantInk[], anchors: Anch[]): void {
  if (!X.slanted || !inks.length) return;
  const s = X.r.scale;
  const W = X.r.width;
  const blank = (P: Prepared, i: number) => P.planes.every((c) => c[i] + THRESH >= 255);
  // Where a row of X is compared on Y: displaced like its nearest matched
  // line (see unmatched), or at the same place.
  const own = anchors.filter((a) => a.own);
  const shift = (ypt: number) => {
    let best: Anch | null = null;
    for (const a of own) if (!best || Math.abs(a.y - ypt) < Math.abs(best.y - ypt)) best = a;
    return best ?? { y: ypt, dx: 0, dy: 0, own: true };
  };
  for (const k of inks) {
    const band = slantBand(k.run, 0.12 * k.run.fontSize + 1);
    const b = band.box;
    const x0 = Math.max(0, Math.floor(b.x * s));
    const y0 = Math.max(0, Math.floor(b.y * s));
    const x1 = Math.min(W, Math.ceil((b.x + b.w) * s));
    const y1 = Math.min(X.r.height, Math.ceil((b.y + b.h) * s));
    if (x1 <= x0 || y1 <= y0) continue;
    const held = slantHeld(X, inks, x0, y0, x1, y1);
    const w = x1 - x0;
    for (let y = y0; y < y1; y++) {
      const a = shift((y + 0.5) / s);
      const qy = Math.floor(((y + 0.5) / s + a.dy) * Y.r.scale);
      for (let x = x0; x < x1; x++) {
        const i = y * W + x;
        if (X.mask[i] === X.slanted.base[i] || held[(y - y0) * w + x - x0] || blank(X, i)) continue;
        const qx = Math.floor(((x + 0.5) / s + a.dx) * Y.r.scale);
        if (qx < 0 || qy < 0 || qx >= Y.r.width || qy >= Y.r.height || !blank(Y, qy * Y.r.width + qx)) continue;
        X.mask[i] = X.slanted.base[i];
      }
    }
  }
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
 * are compared with blank paper. Rows in `fixed` (the running header rows
 * of a page compared with its own counterpart, see furnitureRows) whose
 * nearest line went to another page are compared with the same place of
 * the other page: such a row stays where it is while the text under it
 * re-flows. `fresh`: the boxes (destination page points) of the words of
 * text changes on the destination page, inserted, deleted or replaced.
 */
function unmatched(src: Prepared, dst: Prepared, anchors: Anch[], whole: boolean, identity = false, fixed: Rect[] = [], fresh: Rect[] = []): Unmatched {
  const rs = src.r;
  const rd = dst.r;
  const ms = src.mask;
  const md = dst.mask;
  const [s0, s1, s2] = src.planes;
  const T = THRESH;
  const blank = (p: number) => s0[p] + T >= 255 && s1[p] + T >= 255 && s2[p] + T >= 255;
  // Where the destination prints words that are a change of their own, a
  // graphic of the source is not matched by paper between their glyphs
  // that lies within a pixel of a stroke: their glyphs are new there, and
  // say nothing of what was drawn at that place (a check mark removed where
  // the longer value now goes). Elsewhere a graphic drawn a pixel off by a
  // re-flow is matched by the ink next to it. Nor is it matched by their
  // strokes where much of it lands on lighter pixels between them (see
  // below).
  let freshAt: Uint8Array | null = null;
  if (fresh.length) {
    freshAt = new Uint8Array(rd.width * rd.height);
    for (const f of fresh) {
      const x0 = Math.max(0, Math.floor(f.x * rd.scale));
      const x1 = Math.min(rd.width, Math.ceil((f.x + f.w) * rd.scale));
      for (let y = Math.max(0, Math.floor(f.y * rd.scale)), e = Math.min(rd.height, Math.ceil((f.y + f.h) * rd.scale)); y < e; y++) freshAt.fill(1, y * rd.width + x0, y * rd.width + x1);
    }
  }
  const [d0, d1, d2] = dst.planes;
  const paperThere = (q: number) => !!freshAt?.[q] && d0[q] + T >= 255 && d1[q] + T >= 255 && d2[q] + T >= 255;
  // Paper may land on text in the destination (re-flowed lines); ink must
  // really be matched there, or a figure that text moved into the place of
  // would not be missed. Pixels of a rule in the source padding must always
  // be matched.
  const fits = (q: number, p: number, strict: boolean) => (!strict && (md[q] === GLYPH || md[q] === PAD) && blank(p)) || (!paperThere(q) && colourFit(src, dst, q, p));
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
  // Ink of a graphic of the source (outside its text) that lands on such
  // new words, per cell, and how much of it lands where the destination is
  // lighter (paper, or the anti-aliased edge of a stroke); the part that was
  // matched there.
  const onFresh: number[] = [];
  const onFreshQ: number[] = [];
  const freshInk = freshAt ? new Uint16Array(cells.length) : null;
  const freshPaper = freshAt ? new Uint16Array(cells.length) : null;
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
    const still = (!nearest || !nearest.own) && fixed.some((f) => ypt >= f.y && ypt < f.y + f.h);
    if (!still && (!nearest || !nearest.own)) continue;
    const above = still ? undefined : aboveA?.own ? aboveA : undefined;
    const below = still ? undefined : belowA?.own ? belowA : undefined;
    const c1 = still ? { y: ypt, dx: 0, dy: 0, own: true } : nearest!;
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
      // (Matched at another place, the graphic is there.)
      if (freshInk && known && mk === 0 && q0 >= 0 && (!ok || qFit === q0) && freshAt![q0] && (md[q0] === GLYPH || md[q0] === PAD) && !blank(p)) {
        const ci = crow + ((x / CELL) | 0);
        freshInk[ci]++;
        if (d0[q0] + d1[q0] + d2[q0] - s0[p] - s1[p] - s2[p] > 3 * T) freshPaper![ci]++;
        if (ok) {
          onFresh.push(p);
          onFreshQ.push(q0);
        }
      }
    }
  }
  // Ink of a graphic that lands on new words with a quarter or more of it,
  // in the cell and the cells around, where the destination is lighter: the
  // graphic is not there in the destination (one kept under or over the
  // new glyphs leaves its place at least as dark), and the part of it that
  // lands on their strokes differs as well.
  if (freshInk && onFresh.length) {
    const around = (ci: number, a: Uint16Array) => {
      const cx = ci % cols;
      const cy = (ci / cols) | 0;
      let n = 0;
      for (let v = Math.max(0, cy - 1); v <= Math.min(rows - 1, cy + 1); v++) for (let u = Math.max(0, cx - 1); u <= Math.min(cols - 1, cx + 1); u++) n += a[v * cols + u];
      return n;
    };
    const gone = new Map<number, boolean>();
    for (let k = 0; k < onFresh.length; k++) {
      const p = onFresh[k];
      const ci = ((((p / w) | 0) / CELL) | 0) * cols + (((p % w) / CELL) | 0);
      let g = gone.get(ci);
      if (g === undefined) {
        const n = around(ci, freshInk);
        g = n >= 6 && around(ci, freshPaper!) >= 0.25 * n;
        gone.set(ci, g);
      }
      if (!g) continue;
      cells[ci]++;
      failP.push(p);
      failQ.push(onFreshQ[k]);
      failQ2.push(-1);
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
          if (qy >= 0 && qy < rd.height && qx >= 0 && qx < rd.width && !paperThere(qy * rd.width + qx) && colourFit(src, dst, qy * rd.width + qx, failP[idx[j]])) hit++;
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
    // A thin line (at most two cells across) explained by one pixel across
    // it and none along it. A rule that became thicker or darker by more
    // than a third, or moved by more than a pixel (0.67 pt at the visual
    // stage's scale), is still a difference; one that grew or moved by a
    // single pixel (a bar's edge 0.67 pt higher) is at most a minor shift.
    const thin = 2 * CELL;
    const phase =
      (dx === 0 && Math.abs(dy) <= 1 && rect.h * scale <= thin && rect.w >= 3 * rect.h) || (dy === 0 && Math.abs(dx) <= 1 && rect.w * scale <= thin && rect.h >= 3 * rect.w);
    const balanced = Math.abs(delta) <= (phase ? BALANCE_PHASE : edge ? BALANCE_EDGE : BALANCE_LINE) * Math.max(inkS, inkD) + 0.5;
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
      // Share of the samples that fit at offset (dx, dy).
      const fit = (dx: number, dy: number) => {
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
        return total ? hit / total : 0;
      };
      // The same light graphic, only anti-aliased differently: no difference
      // (and no need to look for an offset).
      if (fit(0, 0) >= 0.85) return;
      let best = 0;
      let bx = 0;
      let by = 0;
      for (let dy = -S; dy <= S; dy++) {
        for (let dx = -S; dx <= S; dx++) {
          if (dx === 0 && dy === 0) continue;
          const f = fit(dx, dy);
          if (f > best || (f === best && f > 0 && Math.abs(dx) + Math.abs(dy) < Math.abs(bx) + Math.abs(by))) [best, bx, by] = [f, dx, dy];
        }
      }
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
      // Along a row a little further: the gaps of a dashed rule that was
      // solid lie a dash apart.
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = dy ? -2 : -3; dx <= (dy ? 2 : 3); dx++) {
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

/**
 * Where a page's differing pixels lie, as an overlay shape (see overlays)
 * around a token: within two cells of a cell with differences, so that it
 * reaches over the token's own box, where text is not compared.
 */
function diffShape(d: Unmatched, r: Raster, rect: Rect): Shape {
  const rows = d.cells.length / d.cols;
  const s = r.scale;
  const hot = (cx: number, cy: number) => cx >= 0 && cy >= 0 && cx < d.cols && cy < rows && d.cells[cy * d.cols + cx] >= 3;
  return {
    box: expand(rect, rect.h + (2 * CELL) / s),
    inside: (x, y) => {
      const cx = Math.floor((x * s) / CELL);
      const cy = Math.floor((y * s) / CELL);
      for (let v = -2; v <= 2; v++) for (let u = -2; u <= 2; u++) if (hot(cx + u, cy + v)) return true;
      return false;
    },
  };
}

/**
 * A difference region next to a token that is a piece of a rule running
 * through the rows of its box past its end: thin, at least twice as long,
 * within the box's height (a table rule recoloured or drawn under a header
 * row, which a tall word box of the row below reaches into; the glyph boxes
 * on the rule cut it into such pieces). Its ink would count as the word's
 * and cannot be told from the glyphs there.
 */
function ruleAcross(d: Unmatched, r: Raster, rect: Rect): boolean {
  const thin = Math.max((2 * CELL) / r.scale, 0.35 * rect.h);
  const e = expand(rect, 0.15 * rect.h + 3);
  return [...d.real, ...d.shifted].some(
    (q) =>
      q.h <= thin &&
      q.w >= 2 * q.h &&
      q.y < rect.y + rect.h + 2 &&
      q.y + q.h > rect.y - 2 &&
      intersects(q, e) &&
      (q.x < rect.x - 1 || q.x + q.w > rect.x + rect.w + 1),
  );
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
 *
 * The glyphs are measured in the token's own box only, with the pixels on
 * its edges weighted by the share of them inside it: the same glyphs are
 * then cut at the same place in both versions, wherever the token landed
 * relative to the pixel grid. A box padded and rounded out to whole pixels
 * took in a table rule 1–2 pt above or below a word in one version and not
 * in the other after its row moved by a fraction of a pixel, which read as
 * a change of weight (small katakana in a cell) or of colour (red figures
 * under a coloured header rule). The background is the most common colour
 * of the box padded by 15 % of its height, so that it is the paper (or the
 * highlight) even behind a dense CJK glyph; a thin rule in the padding is
 * never the most common colour.
 */
function ink(side: Prepared, rect: Rect, skip?: (x: number, y: number) => boolean): { total: number; chroma: [number, number, number]; n: number; bg: [number, number, number] } {
  const { r, lum: l } = side;
  const d = r.data;
  const s = r.scale;
  const cover = (v: number, lo: number, hi: number) => Math.max(0, Math.min(v + 1, hi) - Math.max(v, lo));
  // Pixel range of a box (in pixels) and the share of each pixel inside it.
  const span = (b: Rect) => {
    const X0 = b.x * s;
    const X1 = (b.x + b.w) * s;
    const Y0 = b.y * s;
    const Y1 = (b.y + b.h) * s;
    return {
      x0: Math.max(0, Math.floor(X0)),
      y0: Math.max(0, Math.floor(Y0)),
      x1: Math.min(r.width, Math.ceil(X1)),
      y1: Math.min(r.height, Math.ceil(Y1)),
      w: (x: number, y: number) => cover(x, X0, X1) * cover(y, Y0, Y1),
    };
  };
  const padded = span(expand(rect, rect.h * 0.15));
  let bg = 0;
  // Most common luminance (in steps of 8): the paper or highlight behind the glyphs.
  const hist = new Float64Array(32);
  for (let y = padded.y0; y < padded.y1; y++) {
    for (let x = padded.x0; x < padded.x1; x++) {
      if (skip?.(x, y)) continue;
      const v = l[y * r.width + x];
      if (v > bg) bg = v;
      hist[v >> 3] += padded.w(x, y);
    }
  }
  let mode = 0;
  for (let k = 1; k < 32; k++) if (hist[k] > hist[mode]) mode = k;
  let bn = 0;
  let br = 0;
  let bgG = 0;
  let bb = 0;
  for (let y = padded.y0; y < padded.y1; y++) {
    for (let x = padded.x0; x < padded.x1; x++) {
      const p = y * r.width + x;
      if (l[p] >> 3 !== mode || skip?.(x, y)) continue;
      const w = padded.w(x, y);
      bn += w;
      br += w * d[p * 4];
      bgG += w * d[p * 4 + 1];
      bb += w * d[p * 4 + 2];
    }
  }
  const box = span(rect);
  let total = 0;
  let n = 0;
  let wsum = 0;
  let cr = 0;
  let cg = 0;
  let cb = 0;
  for (let y = box.y0; y < box.y1; y++) {
    for (let x = box.x0; x < box.x1; x++) {
      const w = box.w(x, y);
      if (w <= 0 || skip?.(x, y)) continue;
      const p = y * r.width + x;
      const q = p * 4;
      const v = bg - l[p];
      total += w * v;
      if (v > 40) {
        n += w;
        wsum += w * v;
        cr += (d[q] - l[p]) * v * w;
        cg += (d[q + 1] - l[p]) * v * w;
        cb += (d[q + 2] - l[p]) * v * w;
      }
    }
  }
  // Normalise by scale² so both rasters are comparable.
  return {
    total: total / (s * s),
    chroma: wsum ? [cr / wsum, cg / wsum, cb / wsum] : [0, 0, 0],
    n,
    bg: bn ? [br / bn, bgG / bn, bb / bn] : [255, 255, 255],
  };
}

/** Darkness of a token's box; `x0` and `ys` say which pixel column and row (fractional when re-sampled) each cell comes from. */
type Box = { d: Float32Array; cols: number; rows: number; top: number; x0: number; ys: Float32Array };

/**
 * Darkness (0–1) of each pixel of a token's box, extended a little below for
 * underlines. With `on` (the box of the same token in the other version),
 * the rows are sampled where the other box's rows lie relative to its token,
 * so the two boxes line up as the token itself moved: a displacement by a
 * fraction of a pixel is interpolated between pixel rows, as if the glyphs
 * had been drawn at the other version's sub-pixel position.
 */
function boxDarkness(side: Prepared, rect: Rect, on?: { rect: Rect; scale: number }): Box {
  const { r, lum } = side;
  const s = r.scale;
  const x0 = Math.max(0, Math.round(rect.x * s));
  const x1 = Math.min(r.width, Math.round((rect.x + rect.w) * s));
  const cols = Math.max(0, x1 - x0);
  const dark = (y: number, c: number) => (y < 0 || y >= r.height ? 0 : (255 - lum[y * r.width + x0 + c]) / 255);
  if (!on) {
    const y0 = Math.max(0, Math.floor(rect.y * s));
    const y1 = Math.min(r.height, Math.ceil((rect.y + rect.h * 1.15) * s));
    const rows = Math.max(0, y1 - y0);
    const d = new Float32Array(cols * rows);
    const ys = new Float32Array(rows);
    for (let k = 0; k < rows; k++) {
      ys[k] = y0 + k;
      for (let c = 0; c < cols; c++) d[k * cols + c] = dark(y0 + k, c);
    }
    return { d, cols, rows, top: y0 / s, x0, ys };
  }
  const so = on.scale;
  const oy0 = Math.max(0, Math.floor(on.rect.y * so));
  const rows = Math.max(0, Math.ceil((on.rect.y + on.rect.h * 1.15) * so) - oy0);
  const d = new Float32Array(cols * rows);
  const ys = new Float32Array(rows);
  for (let k = 0; k < rows; k++) {
    // The centre of the other box's row k, at the same place relative to this token.
    const y = ((oy0 + k + 0.5) / so - on.rect.y + rect.y) * s - 0.5;
    const j = Math.floor(y);
    const t = y - j;
    ys[k] = y;
    for (let c = 0; c < cols; c++) d[k * cols + c] = (1 - t) * dark(j, c) + t * dark(j + 1, c);
  }
  return { d, cols, rows, top: oy0 / so - on.rect.y + rect.y, x0, ys };
}

/**
 * A line through or under a token (see addedLine): which, and its pixel
 * rows in the version that has it. `core`: of those rows, the ones that
 * gained most of the line's darkness (the rows found take in a row on
 * either side of it, which can be a rule both versions have right under an
 * underline: a cell's bottom border).
 */
type FoundLine = { line: 'strike' | 'underline'; rows: [number, number]; core: [number, number] };

/**
 * `drift`: also try the boxes shifted sideways (see addedLine). `rows`: the
 * part of the token's box, below its top in points, that is its own: where
 * the line above or below reaches into the box or its extension for
 * underlines (CJK set solid or at 1.15: 14 pt boxes 11–12.7 pt apart), the
 * glyphs there are that line's (the top strokes of the characters below),
 * and they change with any edit on that line. `cjk`: the token is a CJK
 * character (see lineIn). `weak`: a fainter line is
 * enough (little more than half the darkness and of the columns gained),
 * for a word next to a line found at the same height (see
 * appearanceChanges). `exact`: a word at the same place relative to the
 * pixel grid in both rasters was drawn there in both (see samePixels).
 * `level`: a graphic changed next to the word, or an overlay lies on it
 * (each listed or counted on its own), so a line must also be level (see
 * level).
 */
type LineOptions = { drift?: boolean; rows?: [number, number]; weak?: boolean; cjk?: boolean; exact?: boolean; level?: boolean };

/**
 * A line through or under the token in `b` that `a` does not have: rows
 * where nearly every column of `b` is dark but not those of `a`, while the
 * rest of the glyphs is unchanged. The glyphs are compared with themselves:
 * `a`'s box is sampled at `b`'s rows as the token moved (see boxDarkness),
 * so a stroke of the glyph that one rendering puts in one pixel row and the
 * other spreads over two (the bar of a "4", the strokes of 一 or 重 after a
 * re-flow by a fraction of a pixel) is in both. Darkness is also summed over
 * a few rows. `few`: the token has one or two glyphs (a figure, a CJK
 * character), see below. `ca` and `cb`: the ink of an overlay around the
 * token in `a` or `b` (see overlayInk). Only the token's pixels outside
 * that ink are compared; where the glyphs show through it (it lies behind
 * them, or is transparent), its own colour counts as paper.
 *
 * A word's box is estimated from its run's width with standard font
 * metrics (see tokenize), so in a font of other widths (Carlito for Calibri,
 * printed by Chromium as one run per line) it can lie 2–3 pt beside its
 * glyphs, and a line along the glyphs then covers only part of the box.
 * Where part of the box shows such a line (`drift`: Latin text only; a CJK
 * character's box is its em square), the box is also tried shifted by up to
 * 3 pt, both versions alike: a line found there must cover nearly all of
 * the shifted box, which a neighbour's line beyond a space does not.
 */
function addedLine(a: Prepared, ra: Rect, b: Prepared, rb: Rect, few: boolean, ca: Cover | null = null, cb: Cover | null = null, opts: LineOptions = {}): FoundLine | null {
  // A box narrower than this has too few pixel columns to tell a line from
  // a glyph drawn at another sub-pixel position. A single figure struck
  // through ("<s>5</s> working days") is a common redline, so the limit is
  // one narrow glyph: at the visual stage's 1.5 px/pt that is still 4–5
  // columns, and the tests below need nearly all of them dark in the line's
  // rows and the other rows unchanged.
  if (rb.w < 3) return null;
  if (!sameShape(ra, rb)) return null;
  const found = lineIn(a, ra, b, rb, few, ca, cb, opts);
  if (found !== 'part') return found;
  if (!opts.drift) return null;
  const s = b.r.scale;
  const reach = Math.round(3 * s);
  for (let d = 1; d <= reach; d++) {
    for (const dx of [d, -d]) {
      const by = (r: Rect): Rect => ({ x: r.x + dx / s, y: r.y, w: r.w, h: r.h });
      const shifted = lineIn(a, by(ra), b, by(rb), few, ca, cb, opts, true);
      if (shifted && shifted !== 'part') return shifted;
    }
  }
  return null;
}

/**
 * The test of addedLine for one placement of the boxes: the line found, or
 * 'part' when no line covers the box but part of it shows one (rows where
 * at least 30 % of the columns gained darkness), or null. `shifted`: the
 * boxes are placed beside the token's estimated box (see addedLine), where
 * a line must also cover the columns between the glyphs (see extent) and
 * most columns must have gained: a scribble or a stamp drawn across the
 * word does not, at whichever shift its strokes look most like a line.
 */
function lineIn(a: Prepared, ra: Rect, b: Prepared, rb: Rect, few: boolean, ca: Cover | null, cb: Cover | null, opts: LineOptions, shifted = false): FoundLine | 'part' | null {
  const A = boxDarkness(a, ra, { rect: rb, scale: b.r.scale });
  const B = boxDarkness(b, rb);
  if (A.cols < 4 || B.cols < 4) return null;
  const n = Math.min(A.rows, B.rows);
  // Rows that belong to the glyphs of the line above or below (see
  // LineOptions) are left out: they are neither the token's line nor
  // unchanged glyphs of its own.
  if (opts.rows) {
    const [lo, hi] = opts.rows;
    for (let k = 0; k < n; k++) {
      const y = B.top + (k + 0.5) / b.r.scale - rb.y;
      if (y >= lo && y <= hi) continue;
      A.d.fill(0, k * A.cols, (k + 1) * A.cols);
      B.d.fill(0, k * B.cols, (k + 1) * B.cols);
    }
  }
  // Cells (of the columns both boxes have) that can be compared, when an
  // overlay lies over part of the token.
  const C = Math.min(A.cols, B.cols);
  let valid: Uint8Array | null = null;
  if (ca || cb) {
    valid = new Uint8Array(C * n).fill(1);
    for (const [cov, X] of [
      [ca, A],
      [cb, B],
    ] as const) {
      if (!cov) continue;
      for (let k = 0; k < n; k++) {
        const y = Math.round(X.ys[k]);
        for (let c = 0; c < C; c++) {
          const st = cov.at(X.x0 + c, y);
          if (st === INK && cov.clear) X.d[k * X.cols + c] = 0;
          else if (st !== 0 && !(st === UNDER && cov.clear)) valid[k * C + c] = 0;
        }
      }
    }
  }
  // Grey or coloured text: darkness is measured in units of the glyphs' own
  // ink (their darkest pixel, in the version that is lighter: a deletion
  // shown struck through in the reviewer's colour), so that a line in the
  // text's colour (#555, a blue link, a grey footnote: a strike or underline
  // is drawn in the text colour) counts as dark as one under black text.
  // `a`'s glyphs are measured as drawn: re-sampling blurs their darkest
  // pixels. Black text, whose stems cover whole pixels, is measured as it is.
  // Where the ink changed hue (black text turned red, a recolour that the
  // colour test lists), each version is measured in units of its own ink:
  // in units of the lighter one, the anti-aliased edges of the darker
  // glyphs come out darker than the same edges in the lighter colour, most
  // along a bar across the word (of a "4"), which then reads as a line. (A
  // strike in the text's new colour is as dark as those glyphs then.)
  const ua = inkUnit(a, ra);
  const ub = inkUnit(b, rb);
  const unit = Math.min(ua, ub);
  const [ha, hb] = [inkHue(a, ra), inkHue(b, rb)];
  const recoloured = Math.hypot(ha[0] - hb[0], ha[1] - hb[1], ha[2] - hb[2]) > 30;
  for (const [X, u] of [
    [A, recoloured ? ua : unit],
    [B, recoloured ? ub : unit],
  ] as const) {
    if (u >= 0.9) continue;
    const f = 1 / Math.max(0.35, u);
    for (let q = 0; q < X.d.length; q++) X.d[q] = Math.min(1, X.d[q] * f);
  }
  const prof = (X: Box) => {
    const p = new Float32Array(X.rows);
    for (let k = 0; k < X.rows; k++) {
      let sum = 0;
      if (!valid) {
        for (let c = 0; c < X.cols; c++) sum += X.d[k * X.cols + c];
        p[k] = sum / X.cols;
        continue;
      }
      if (k >= n) continue;
      let m = 0;
      for (let c = 0; c < C; c++) if (valid[k * C + c]) (sum += X.d[k * X.cols + c], m++);
      p[k] = m ? sum / m : 0;
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
  // Darkness of column c of a box within rows j0..j1 (NaN where an overlay
  // leaves a cell that cannot be compared).
  const column = (X: Box, c: number, j0: number, j1: number) => {
    let sum = 0;
    for (let j = Math.max(0, j0); j <= Math.min((valid ? n : X.rows) - 1, j1); j++) {
      if (valid && !valid[j * C + c]) return NaN;
      sum += X.d[j * X.cols + c];
    }
    return sum;
  };
  // Share of columns that are dark within rows k-half..k+half (of the
  // columns that can be compared there: NaN, never a line, if too few can).
  const share = (X: Box, k: number, half: number) => {
    let dark = 0;
    let m = 0;
    for (let c = 0; c < (valid ? C : X.cols); c++) {
      const sum = column(X, c, k - half, k + half);
      if (Number.isNaN(sum)) continue;
      m++;
      if (sum >= 0.6) dark++;
    }
    if (valid && m < 4) return NaN;
    return dark / m;
  };
  // Share of columns that got darker by a third of a line or more around
  // row k: a line adds its darkness where the glyphs leave paper, and much
  // of it where their strokes are thin or anti-aliased (the waist of an
  // "8", the bars of e and a at the height of a strike). Summed over two
  // rows on either side, so that a rule both versions have, a pixel higher
  // in one, adds nothing. `open`: of the columns that `a` leaves light in
  // row k (a line over a stroke of the glyph adds nothing there), to tell
  // part of the box (see lineIn's result): a box beside its glyphs takes in
  // only a few of their columns.
  const gained = (k: number, open = false) => {
    let up = 0;
    let m = 0;
    for (let c = 0; c < C; c++) {
      if (open && A.d[k * A.cols + c] >= 0.85) continue;
      const d = column(B, c, k - 2, k + 2) - column(A, c, k - 2, k + 2);
      if (Number.isNaN(d)) continue;
      m++;
      if (d >= 0.3) up++;
    }
    return m ? up / m : 0;
  };
  // A line adds about its own darkness to its rows (minus what glyphs
  // already covered), across the word: most columns gained (a stroke of a
  // scribble or a stamp drawn across the word, which other strokes of the
  // glyphs make look dark across, does not). A glyph stroke drawn a little
  // darker adds far less. Most columns of `a` must also be light there, or
  // more of them must have gained.
  // Where the glyphs already fill most of the line's row (the waist of an
  // "8", the bars of the e's in "fee" at a strike's height), few columns
  // can gain, and little darkness: then the columns they leave light in
  // that row (the gaps between the glyphs and beside their strokes, three
  // or more) must all have turned dark, or all but one where there are
  // five or more (the line's anti-aliased end in the box's edge column).
  // Only where the glyphs give the very same pixels in both versions (see
  // samePixels): a stroke of a glyph that one rendering spreads over two
  // rows and the other puts in one (the bar of a "4" after a re-flow by a
  // fraction of a pixel) turns its columns dark in that row as well. The
  // box's first and last columns hold the line's ends: a line drawn along
  // the advance covers them in part (0.4 of the last column of a struck
  // "9"), so there a gain of a quarter of a line does.
  const still = !shifted && !!opts.exact && samePixels(ra, a.r.scale, rb, b.r.scale);
  const filled = (k: number) => {
    let light = 0;
    let now = 0;
    for (let c = 0; c < C; c++) {
      if (valid && !valid[k * C + c]) continue;
      const va = A.d[k * A.cols + c];
      if (va >= 0.6) continue;
      light++;
      const vb = B.d[k * B.cols + c];
      if (c === 0 || c === C - 1 ? vb - va >= 0.25 : vb >= 0.6 && vb - va >= 0.3) now++;
    }
    return light >= 3 && now >= (light >= 5 ? light - 1 : light);
  };
  const line = (k: number) => {
    const added = win(pb, k, 1) - win(pa, k, 1);
    if (share(B, k, 1) < 0.85) return false;
    if (added < (opts.weak ? 0.25 : 0.45)) return !opts.weak && still && added >= 0.2 && filled(k);
    const g = gained(k);
    // A short word whose glyph fills the line's rows (an "a" between struck
    // words) gains few columns, but as much darkness.
    if (opts.weak) return g >= 0.35 || (g >= 0.2 && added >= 0.4);
    return g >= 0.55 || (!shifted && g >= 0.4 && share(A, k, 1) <= 0.7) || (still && filled(k));
  };
  let part = false;
  for (let k = 0; k < n; k++) {
    if (!line(k)) {
      if (!part && win(pb, k, 1) - win(pa, k, 1) >= 0.15 && gained(k, true) >= 0.3) part = true;
      continue;
    }
    let e = k;
    while (e + 1 < n && line(e + 1)) e++;
    if (e - k > Math.ceil(1.5 * b.r.scale) + 2) return null;
    // Unchanged elsewhere: the rest of the profile matches.
    let diff = 0;
    let total = 0;
    for (let j = 1; j < n - 1; j++) {
      if (j >= k - 3 && j <= e + 3) continue;
      diff += Math.abs(win(pb, j, 1) - win(pa, j, 1));
      total += win(pa, j, 1);
    }
    // A token of one or two glyphs (or narrower than 8 pt) may have a stroke
    // across its whole width of its own (the bar of a "4", most CJK
    // characters: 一 主 重 年); drawn at another sub-pixel position it can
    // look like a line. That is only so where the glyph in `a` has such a
    // stroke: at least as much ink in the line's rows (and the row on either
    // side) as the line adds there. A line through rows that the glyph
    // leaves blank (between the strokes of 二 or 三, under 王) is not part of
    // it, however its strokes elsewhere were re-sampled after a re-flow by a
    // fraction of a pixel.
    let own = 0;
    let all = 0;
    for (let j = Math.max(0, k - 1); j <= Math.min(n - 1, e + 1); j++) {
      own += pa[j];
      all += pb[j];
    }
    // Where an overlay leaves only a narrow part of the token to compare,
    // that part is as narrow as a short token.
    let seen = C;
    if (valid) {
      seen = 0;
      for (let c = 0; c < C; c++) {
        let ok = true;
        for (let j = Math.max(0, k - 1); j <= Math.min(n - 1, e + 1) && ok; j++) ok = !!valid[j * C + c];
        if (ok) seen++;
      }
    }
    let narrow = (few || rb.w < 8 || seen < 8 * b.r.scale) && own >= all - own;
    if (shifted) {
      const ext = extent(A, B, C, n, k, e, valid, true);
      if (ext !== null && ext < 0.75) return null;
    }
    if (narrow) {
      // Such a stroke spans the glyph's ink, a line the whole advance: its
      // side bearings and the gap between two figures, columns where the
      // glyph in `a` has no ink near the line's rows. Where there are such
      // columns, a line covers them and the glyph's own stroke does not.
      // Otherwise (the glyph fills its box at those rows) the other rows
      // must match almost exactly: a line added to the same glyph leaves
      // them as they were. Where the glyph only moved up or down (a re-flow
      // by a fraction of a pixel), its columns line up and re-sampling its
      // rows changes up to a fifth of the ink; where it also moved sideways
      // by a fraction of a pixel, its columns are blurred against each
      // other as well, and only the strict test tells.
      // Where a CJK character fills its box there, a line must also add
      // about its own darkness on average across the box (half a line or
      // more within two rows of it): a stroke across the character drawn
      // crisp in one version and spread over two rows in the other comes
      // out darker by a fifth or so (the bottom stroke of 重), a line on
      // paper or beside a stroke by nearly its whole darkness. (A figure
      // that fills its box, an "8", has no stroke across it.)
      // (For Latin text, only blank columns between the glyphs' first and
      // last ink tell a stroke of their own: a box estimated a point or two
      // beside its glyphs has blank columns beyond them, which a line along
      // the glyphs does not reach either. A CJK character's box is its em
      // square.)
      const ext = extent(A, B, C, n, k, e, valid);
      const tell = opts.cjk ? ext : extent(A, B, C, n, k, e, valid, true);
      if (tell !== null && tell < 0.5) return null;
      if (ext !== null && ext >= 0.75) narrow = false;
      if (tell === null && opts.cjk) {
        let gain = 0;
        let m = 0;
        for (let c = 0; c < C; c++) {
          const d = column(B, c, k - 2, e + 2) - column(A, c, k - 2, e + 2);
          if (Number.isNaN(d)) continue;
          gain += d;
          m++;
        }
        if (!m || gain / m < 0.5) return null;
      }
    }
    const phase = (r: Rect, sc: number) => r.x * sc - Math.round(r.x * sc);
    const off = Math.abs(phase(ra, a.r.scale) - phase(rb, b.r.scale));
    // (Next to a line found at the same height, see LineOptions.weak, the
    // looser test holds either way.)
    const loose = !narrow ? 0.35 : opts.weak || Math.min(off, 1 - off) <= 0.2 ? 0.2 : 0.08;
    if (diff > loose * total + (loose === 0.35 ? 0.5 : loose === 0.2 ? 0.25 : 0.1)) return null;
    const rel = (B.top + (k + e + 1) / 2 / b.r.scale - rb.y) / rb.h;
    if (rel < 0.3) return null;
    // Over all of the box, an overlay's ink too: a stamp's slanted border is
    // no line where it is left out either. Only where such a graphic or
    // overlay is there to explain the slant (see LineOptions.level): a
    // strike drawn with a line tool can rise by a point or two over a word,
    // and where nothing else is listed there, it is the only item that
    // shows the mark.
    if (opts.level && !level(A, B, C, n, k, e)) return null;
    let c0 = k;
    let c1 = e;
    let most = 0;
    for (let j = k; j <= e; j++) most = Math.max(most, pb[j] - pa[j]);
    // Glyphs drawn heavier as a whole (a synthetic bold, text render mode
    // 2) gain darkness in every row of theirs, a little more where their
    // strokes run across (the x-height band of "contract" reads as a line
    // 3–4 pt thick): where the glyphs' rows gained so (the median of them,
    // the line's rows among them), a line must gain clearly more in its
    // own rows. A strike through such a word still does (twice as much and
    // more in its rows); an underline lies below the glyphs' rows.
    const rows: number[] = [];
    for (let j = 0; j < n; j++) if (pa[j] >= 0.1) rows.push(pb[j] - pa[j]);
    rows.sort((p, q) => p - q);
    const typical = rows.length >= 5 ? rows[rows.length >> 1] : 0;
    if (typical >= 0.06 && most < 1.6 * typical + 0.05) return null;
    while (c0 < c1 && pb[c0] - pa[c0] < 0.4 * most) c0++;
    while (c1 > c0 && pb[c1] - pa[c1] < 0.4 * most) c1--;
    return { line: rel >= 0.72 ? 'underline' : 'strike', rows: [Math.round(B.ys[k]), Math.round(B.ys[e])], core: [Math.round(B.ys[c0]), Math.round(B.ys[c1])] };
  }
  return part ? 'part' : null;
}

/**
 * A strike or an underline is level: in each column, the rows where `B`
 * gained half a line or more over `A` (within three rows of the line's
 * rows k..e; less is what re-sampling a glyph's slanted stroke changes)
 * are centred at the same height, give or take a pixel, at the word's left
 * and right ends (the median of a third of its columns each). The border
 * of a stamp turned by a few degrees, or a scribble's stroke, drawn across
 * the word rises or falls along it; where such a border crosses only a few
 * columns of an underlined word, the median is still the underline's. The
 * glyphs are laid over each other first: the box of the same word can lie
 * a pixel or two further along in one version (a run split at the
 * underlined word in one version only), and its glyphs' strokes must not
 * count as gained.
 */
function level(A: Box, B: Box, C: number, n: number, k: number, e: number): boolean {
  const j0 = Math.max(0, k - 3);
  const j1 = Math.min(n - 1, e + 3);
  // The shift of A's columns that best matches B's rows outside the window.
  let shift = 0;
  let best = Infinity;
  for (let d = -3; d <= 3; d++) {
    let diff = 0;
    for (let j = 0; j < n; j++) {
      if (j >= j0 && j <= j1) continue;
      for (let c = Math.max(0, -d); c < Math.min(C, C - d); c++) diff += Math.abs(B.d[j * B.cols + c] - A.d[j * A.cols + c + d]);
    }
    diff /= C - Math.abs(d);
    if (diff < best - 1e-9) [best, shift] = [diff, d];
  }
  const c0 = Math.max(0, -shift);
  const c1 = Math.min(C, C - shift);
  const third = Math.max(2, Math.floor((c1 - c0) / 3));
  const height = (from: number, to: number) => {
    const mid: number[] = [];
    for (let c = from; c < to; c++) {
      let first = -1;
      let last = -1;
      for (let j = j0; j <= j1; j++) {
        if (B.d[j * B.cols + c] - A.d[j * A.cols + c + shift] < 0.5) continue;
        if (first < 0) first = j;
        last = j;
      }
      if (first >= 0) mid.push((first + last) / 2);
    }
    if (mid.length < 2) return NaN;
    mid.sort((p, q) => p - q);
    return mid[mid.length >> 1];
  };
  return !(Math.abs(height(c0, c0 + third) - height(c1 - third, c1)) > 1);
}

/** The darkness of a token's glyph ink: the darkest pixel of its box (1 when it is nearly paper). */
function inkUnit(side: Prepared, rect: Rect): number {
  const { r, lum } = side;
  const s = r.scale;
  let min = 255;
  for (let y = Math.max(0, Math.floor(rect.y * s)); y < Math.min(r.height, Math.ceil((rect.y + rect.h) * s)); y++)
    for (let x = Math.max(0, Math.round(rect.x * s)); x < Math.min(r.width, Math.round((rect.x + rect.w) * s)); x++) min = Math.min(min, lum[y * r.width + x]);
  const max = (255 - min) / 255;
  return max > 0.12 ? max : 1;
}

/**
 * The hue of a token's ink: each channel's difference from the luminance,
 * weighted by darkness, over the pixels of its box that are inked (grey and
 * black are 0, 0, 0; anti-aliasing does not change it).
 */
function inkHue(side: Prepared, rect: Rect): [number, number, number] {
  const { r, lum } = side;
  const s = r.scale;
  const c: [number, number, number] = [0, 0, 0];
  let w = 0;
  for (let y = Math.max(0, Math.floor(rect.y * s)); y < Math.min(r.height, Math.ceil((rect.y + rect.h) * s)); y++)
    for (let x = Math.max(0, Math.round(rect.x * s)); x < Math.min(r.width, Math.round((rect.x + rect.w) * s)); x++) {
      const i = y * r.width + x;
      const v = 255 - lum[i];
      if (v < 64) continue;
      const p = rgb(r, i);
      for (let k = 0; k < 3; k++) c[k] += (p[k] - lum[i]) * v;
      w += v;
    }
  return w ? [c[0] / w, c[1] / w, c[2] / w] : c;
}

/**
 * Whether a word's box lies at the same place relative to the pixel grid
 * in both rasters (moved by whole pixels, if at all) and has the same size:
 * the same glyphs then give the very same pixels in both, as each raster
 * is drawn on its page's own grid (not so on a page turned back, see
 * unturnRaster; callers tell that apart).
 */
function samePixels(ra: Rect, sa: number, rb: Rect, sb: number): boolean {
  if (sa !== sb) return false;
  const fx = (rb.x - ra.x) * sa;
  const fy = (rb.y - ra.y) * sa;
  return Math.abs(fx - Math.round(fx)) <= 0.02 && Math.abs(fy - Math.round(fy)) <= 0.02 && Math.abs(ra.w - rb.w) * sa <= 0.02 && Math.abs(ra.h - rb.h) * sa <= 0.02;
}

/**
 * Whether the glyphs in `rb` (on `B`) are those in `ra` (on `A`) drawn
 * heavier: their outlines grown on every side, as a synthetic bold draws
 * them (filled and stroked, text render mode 2, which Word writes for a
 * font without a bold face), or darker as a whole. Told only where the word
 * lies at the same place relative to the pixel grid in both versions (moved
 * by whole pixels, if at all) and has the same size: the same glyphs then
 * give the very same pixels, so that a thin stroke added shows even on a
 * single word, whereas a re-flow by a fraction of a pixel changes the ink
 * of one CJK glyph by up to a fifth. The darkness gained must lie on the
 * glyphs or next to them (a pixel away), along most of their edges (not a
 * mark beside one glyph, nor the next glyph reaching into the box), and
 * come to a tenth of their ink; next to none may be lost.
 */
function heavier(A: Prepared, ra: Rect, B: Prepared, rb: Rect): boolean {
  const s = A.r.scale;
  if (!samePixels(ra, s, rb, B.r.scale)) return false;
  const dx = Math.round((rb.x - ra.x) * s);
  const dy = Math.round((rb.y - ra.y) * s);
  const x0 = Math.max(0, -dx, Math.floor(ra.x * s));
  const x1 = Math.min(A.r.width, B.r.width - dx, Math.ceil((ra.x + ra.w) * s));
  const y0 = Math.max(0, -dy, Math.floor(ra.y * s));
  const y1 = Math.min(A.r.height, B.r.height - dy, Math.ceil((ra.y + ra.h) * s));
  if (x1 - x0 < 3 || y1 - y0 < 3) return false;
  const dark = (P: Prepared, x: number, y: number) => (255 - P.lum[y * P.r.width + x]) / 255;
  // Ink of `A` within a pixel of (x, y).
  const inked = (x: number, y: number) => {
    for (let v = Math.max(0, y - 1); v <= Math.min(A.r.height - 1, y + 1); v++)
      for (let u = Math.max(0, x - 1); u <= Math.min(A.r.width - 1, x + 1); u++) if (dark(A, u, v) > 0.1) return true;
    return false;
  };
  let ink = 0;
  let gain = 0;
  let loss = 0;
  let onGlyphs = 0;
  // Pixels on the edges of the glyphs in `A` (partly covered), and those of
  // them that got darker.
  let edges = 0;
  let grown = 0;
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const a = dark(A, x, y);
      const d = dark(B, x + dx, y + dy) - a;
      ink += a;
      const edge = a > 0.1 && a < 0.9;
      if (edge) edges++;
      if (d < -0.02) loss -= d;
      if (d <= 0.02) continue;
      gain += d;
      if (edge) grown++;
      if (inked(x, y)) onGlyphs += d;
    }
  return edges >= 6 && grown >= 0.7 * edges && gain >= 0.1 * ink && loss <= 0.1 * gain && onGlyphs >= 0.9 * gain;
}

/**
 * Of the columns where the glyphs in `A` have no ink within two rows of a
 * line's rows k..e, the share that `B` covers in those rows (dark as a
 * line: 0.6 over the rows and one on either side); null when fewer than two
 * columns are so blank. `inner`: only the columns between the glyphs'
 * first and last ink (the gaps between letters, not a box's ends beyond
 * them).
 */
function extent(A: Box, B: Box, C: number, n: number, k: number, e: number, valid: Uint8Array | null, inner = false): number | null {
  let blank = 0;
  let covered = 0;
  let c0 = 0;
  let c1 = C - 1;
  if (inner) {
    const inked = (c: number) => {
      for (let j = 0; j < n; j++) if (A.d[j * A.cols + c] > 0.25) return true;
      return false;
    };
    while (c0 < C && !inked(c0)) c0++;
    while (c1 > c0 && !inked(c1)) c1--;
  }
  columns: for (let c = c0; c <= c1; c++) {
    for (let j = Math.max(0, k - 2); j <= Math.min(n - 1, e + 2); j++) if ((valid && !valid[j * C + c]) || A.d[j * A.cols + c] > 0.25) continue columns;
    blank++;
    let sum = 0;
    for (let j = Math.max(0, k - 1); j <= Math.min(n - 1, e + 1); j++) sum += B.d[j * B.cols + c];
    if (sum >= 0.6) covered++;
  }
  return blank >= 2 ? covered / blank : null;
}

/**
 * Matched text whose appearance changed: colour or stroke weight (turned red,
 * synthetic bold), background (highlighted) or a line through or under it.
 * `exact`: a word at the same place relative to the pixel grid in both
 * rasters was drawn there in both (not so on a new page turned back, see
 * unturnRaster: it was drawn on the turned page's grid). `graphicAt`: a
 * region where the graphics comparison found differences takes in the word
 * (a stamp drawn across the text, whose border crosses it within the text's
 * mask). `graphicIn`: such a region on that page takes in the place.
 */
function appearanceChanges(
  result: CompareResult,
  oldPage: number,
  newPage: number,
  A: Prepared,
  B: Prepared,
  skip: (b: Token) => boolean,
  near: (a: Token, b: Token) => [Cover | null, Cover | null] | 'skip' | null,
  under: (a: Token, b: Token) => boolean = () => false,
  cover: (a: Token, b: Token) => [Cover | null, Cover | null] | 'skip' = () => [null, null],
  exact = true,
  graphicAt: (a: Token, b: Token) => boolean = () => false,
  graphicIn: (side: 'old' | 'new', r: Rect) => boolean = () => false,
): Change[] {
  const TA = result.oldDoc.tokens;
  const TB = result.newDoc.tokens;
  const m = result.matches;
  type Ink = ReturnType<typeof ink>;
  // With a line pitch smaller than the glyph boxes (CJK set solid: 14 pt
  // boxes 11 pt apart), a word's box reaches into the glyphs of the lines
  // above and below, and their colour would count as the word's. The box is
  // cut halfway into each overlap with a neighbouring line, by the same
  // amount on both sides (the tighter of the two versions).
  const linesOf = (doc: DocModel, page: number) => doc.lines.filter((l) => l.page === page && l.end > l.start);
  const pageLines = { old: linesOf(result.oldDoc, oldPage), new: linesOf(result.newDoc, newPage) };
  const cut = (lines: DocModel['lines'], t: Token): [number, number] => {
    const r = t.rects[0];
    let top = 0;
    let bottom = 0;
    for (const l of lines) {
      if (l.id === t.line || l.rect.x >= r.x + r.w || l.rect.x + l.rect.w <= r.x) continue;
      const lo = Math.max(r.y, l.rect.y);
      const hi = Math.min(r.y + r.h, l.rect.y + l.rect.h);
      if (hi <= lo) continue;
      if (l.rect.y + l.rect.h / 2 < r.y + r.h / 2) top = Math.max(top, (hi - r.y) / 2);
      else bottom = Math.max(bottom, (r.y + r.h - lo) / 2);
    }
    return [top, bottom];
  };
  // The rows of a word's box (with the extension for underlines, see
  // boxDarkness) that are its own, below its top: from halfway into the
  // overlap with the line above to halfway into that with the line below,
  // or to the top of the line below where that starts in the extension
  // (the tighter of the two versions). Undefined where no line reaches in.
  const reach = (lines: DocModel['lines'], t: Token): [number, number] => {
    const r = t.rects[0];
    let top = 0;
    let bottom = 1.15 * r.h;
    for (const l of lines) {
      if (l.id === t.line || l.rect.x >= r.x + r.w || l.rect.x + l.rect.w <= r.x) continue;
      // Only lines of text above or below: not one whose middle lies within
      // the word's box, nor a watermark's or a stamp's bounding box.
      const mid = l.rect.y + l.rect.h / 2;
      if ((mid >= r.y && mid <= r.y + r.h) || l.rect.h > 2 * r.h) continue;
      if (mid < r.y + r.h / 2) {
        if (l.rect.y + l.rect.h > r.y) top = Math.max(top, (l.rect.y + l.rect.h - r.y) / 2);
      } else if (l.rect.y < r.y + 1.15 * r.h) {
        const below = l.rect.y - r.y;
        bottom = Math.min(bottom, below >= r.h ? below : r.h - (r.h - below) / 2);
      }
    }
    return [top, bottom];
  };
  const own = (a: Token, b: Token): [number, number] | undefined => {
    const [ta, ba] = reach(pageLines.old, a);
    const [tb, bb] = reach(pageLines.new, b);
    const top = Math.max(ta, tb);
    const bottom = Math.min(ba, bb);
    return top > 0 || bottom < 1.15 * b.rects[0].h - 1e-6 ? [top, bottom] : undefined;
  };
  const pitch = (a: Token, b: Token): [Rect, Rect] => {
    const [ta, ba] = cut(pageLines.old, a);
    const [tb, bb] = cut(pageLines.new, b);
    const top = Math.max(ta, tb);
    const bottom = Math.max(ba, bb);
    if (!top && !bottom) return [a.rects[0], b.rects[0]];
    const clip = (r: Rect) => ({ x: r.x, y: r.y + top, w: r.w, h: Math.max(1, r.h - top - bottom) });
    return [clip(a.rects[0]), clip(b.rects[0])];
  };
  // A pixel row of `P` between columns x0 and x1: its colour where it is of
  // one colour (85 % of it within the tolerance of its median), else
  // (glyphs) null. Off the page it is paper.
  const rowColour = (P: Prepared, y: number, x0: number, x1: number): number[] | null => {
    if (y < 0 || y >= P.r.height) return [255, 255, 255];
    const v: [number, number, number][] = [];
    for (let x = Math.max(0, x0); x < Math.min(P.r.width, x1); x++) v.push(rgb(P.r, y * P.r.width + x));
    if (!v.length) return null;
    const med = [0, 1, 2].map((c) => v.map((p) => p[c]).sort((a, b) => a - b)[v.length >> 1]);
    return v.filter((p) => p.every((c, k) => Math.abs(c - med[k]) <= THRESH)).length < 0.85 * v.length ? null : med;
  };
  const isPaper = (c: number[]) => Math.min(...c) >= 255 - THRESH;
  const apart = (c: number[], d: number[]) => c.some((v, k) => Math.abs(v - d[k]) > THRESH);
  // An "underline" that runs on past an end of the word's line of text, at
  // its rows, for 12 pt or more is a rule or the edge of a fill along the
  // table row (the border of a row split at the page foot, the lower edge
  // of a dark header band 0.7 pt off after a re-flow), not a line under
  // the text, when the other version has a rule or a fill's edge along the
  // row there too, within one and a half lines of where the line would be
  // (the same table's rules, which the text moved against). An underline
  // ends with the text, or a few spaces after it (an underlined field with
  // trailing spaces: 3–6 pt); the table rules and bands seen run on for 30
  // pt or more. One drawn on past the text where the other version has
  // nothing along the row (a signature line, a name underlined to the
  // margin) stays an underline.
  //
  // So is a line along the edge of a fill the text stands on (a red rule
  // drawn right under a header band in white on blue: the band above it,
  // paper below) when it goes on along that edge past the word, through a
  // gap between the line's runs wider than a space, and the graphics
  // comparison found differences there, outside the text, where it lists
  // the line. A word underlined on a shaded row whose band ends right under
  // it stays an underline, whatever else changed on the row.
  //
  // `X` has the line, `t` is the word there, and `u` the same word in the
  // other version. Null for a rule or an edge, else the line found.
  const rowEdge = (found: FoundLine | null, X: Prepared, lines: DocModel['lines'], t: Token, u: Token) => {
    if (!found || found.line !== 'underline') return found;
    const l = lines.find((x) => x.id === t.line);
    if (!l) return found;
    const O = X === A ? B : A;
    const s = X.r.scale;
    const so = O.r.scale;
    const r = t.rects[0];
    const q = u.rects[0];
    const d = 12;
    const [y0, y1] = found.rows;
    // The line's own rows: a rule both versions have, a row below an
    // underline (a cell's bottom border), is no line going on past the text.
    const [l0, l1] = found.core;
    // A pixel row along the line of text, 'fill' or 'paper' (see rowColour).
    const row = (y: number): 'fill' | 'paper' | null => {
      const c = rowColour(X, y, Math.round(l.rect.x * s), Math.round((l.rect.x + l.rect.w) * s));
      return c && (isPaper(c) ? 'paper' : 'fill');
    };
    // Dark across the line's rows at column x (as the line goes on).
    const across = (x: number) => {
      let sum = 0;
      for (let y = Math.max(0, l0 - 1); y <= Math.min(X.r.height - 1, l1 + 1); y++) sum += (255 - X.lum[y * X.r.width + x]) / 255;
      return sum >= 0.6;
    };
    const up = row(y0 - 2);
    const down = row(y1 + 2);
    if (up && down && up !== down) {
      // The line followed from the word along its rows to where it ends,
      // and its stretches past the word outside the text's mask (where the
      // graphics comparison looks).
      const wa = Math.floor(r.x * s);
      const wb = Math.ceil((r.x + r.w) * s) - 1;
      let xa = wa;
      let xb = wb;
      while (xa > 0 && across(xa - 1)) xa--;
      while (xb < X.r.width - 1 && across(xb + 1)) xb++;
      const outside = (x: number) => {
        if (x >= wa && x <= wb) return false;
        for (let y = Math.max(0, l0); y <= Math.min(X.r.height - 1, l1); y++) {
          const v = X.mask[y * X.r.width + x];
          if (v === GLYPH || v === PAD) return false;
        }
        return true;
      };
      const min = Math.max(6, 0.6 * r.h) * s;
      for (let x = xa; x <= xb; ) {
        if (!outside(x)) {
          x++;
          continue;
        }
        let e = x;
        while (e < xb && outside(e + 1)) e++;
        if (e - x + 1 >= min && graphicIn(X === A ? 'old' : 'new', { x: x / s, y: y0 / s, w: (e - x + 1) / s, h: (y1 - y0 + 1) / s })) return null;
        x = e + 1;
      }
    }
    // The hue of what lies in the line's rows between x0 and x1: each
    // channel's difference from the luminance, weighted by darkness (grey
    // and black are 0, 0, 0; anti-aliasing does not change it). Null where
    // nothing is dark.
    const hue = (x0: number, x1: number): number[] | null => {
      const c = [0, 0, 0];
      let w = 0;
      for (let x = Math.max(0, Math.round(x0 * s)); x < Math.min(X.r.width, Math.round(x1 * s)); x++)
        for (let y = Math.max(0, l0); y <= Math.min(X.r.height - 1, l1); y++) {
          const i = y * X.r.width + x;
          const v = 255 - X.lum[i];
          if (v < 40) continue;
          const p = rgb(X.r, i);
          for (let k = 0; k < 3; k++) c[k] += (p[k] - X.lum[i]) * v;
          w += v;
        }
      return w ? c.map((v) => v / w) : null;
    };
    const own = hue(r.x, r.x + r.w);
    // Dark across the line's rows, in the line's own colour: the same rule
    // or edge going on (a stamp's letters in another colour beside the end
    // of an underlined line are not).
    const dark = (x0: number, x1: number) => {
      let n = 0;
      let m = 0;
      for (let x = Math.max(0, Math.round(x0 * s)); x < Math.min(X.r.width, Math.round(x1 * s)); x++) {
        m++;
        if (across(x)) n++;
      }
      if (m === 0 || n < 0.85 * m) return false;
      const there = hue(x0, x1);
      return !own || !there || Math.hypot(own[0] - there[0], own[1] - there[1], own[2] - there[2]) <= 30;
    };
    // A rule or a fill's edge in the other version along the same columns
    // (placed by the word), within one and a half of its lines' height of
    // where the line would be: a row of one colour, not paper, with paper
    // or another colour two pixel rows above or below it.
    const ruled = (x0: number, x1: number) => {
      const c0 = Math.round((x0 - r.x + q.x) * so);
      const c1 = Math.round((x1 - r.x + q.x) * so);
      if (c1 - c0 < 3) return false;
      const reach = Math.round(1.5 * q.h * so);
      const at = (y: number) => Math.round((y / s - r.y + q.y) * so);
      for (let y = at(y0) - reach; y <= at(y1) + reach; y++) {
        const c = rowColour(O, y, c0, c1);
        if (!c || isPaper(c)) continue;
        for (const e of [y - 2, y + 2]) {
          const k = rowColour(O, e, c0, c1);
          if (k && apart(c, k)) return true;
        }
      }
      return false;
    };
    const before: [number, number] = [l.rect.x - d - 1, l.rect.x - 1];
    const after: [number, number] = [l.rect.x + l.rect.w + 1, l.rect.x + l.rect.w + d + 1];
    return [before, after].some(([x0, x1]) => dark(x0, x1) && ruled(x0, x1)) ? null : found;
  };
  // An "underline" that ends, at both ends, in a stroke rising from it past
  // the text (and not going on below it, as the side of a stamp drawn
  // across the line does), which the other version does not have there,
  // with an edge joining the two strokes above the text, is the lower edge
  // of a frame drawn around the words (a reviewer's box, outline-offset a
  // point or two): not a line under them. The line is followed from the
  // word along its rows to where it ends (a phrase underlined as a whole
  // ends with its last word, or a few spaces after it). Null for that, else
  // the line found. `X` has the line, `t` is the word there, and `u` the
  // same word in the other version `O`.
  const framed = (found: FoundLine | null, X: Prepared, O: Prepared, t: Token, u: Token): FoundLine | null => {
    if (!found || found.line !== 'underline') return found;
    const s = X.r.scale;
    const so = O.r.scale;
    const r = t.rects[0];
    const q = u.rects[0];
    const [y0, y1] = found.rows;
    const dark = (P: Prepared, x: number, y: number) => (x >= 0 && y >= 0 && x < P.r.width && y < P.r.height ? (255 - P.lum[y * P.r.width + x]) / 255 : 0);
    const along = (x: number) => {
      let sum = 0;
      for (let y = y0 - 1; y <= y1 + 1; y++) sum += dark(X, x, y);
      return sum >= 0.5;
    };
    const top = Math.round((r.y + 0.15 * r.h) * s);
    // The other version has no such stroke near there: within 2 pixels of
    // where the word's box puts the column, or of the same column (the two
    // boxes of a word can be estimated a point or two apart).
    const rises = (x: number) => {
      let m = 0;
      let here = 0;
      for (let y = top; y < y0 - 1; y++) {
        m++;
        if (dark(X, x, y) >= 0.3) here++;
      }
      if (m < 3 || here < 0.8 * m) return false;
      for (const ox of [Math.round((x / s - r.x + q.x) * so), Math.round((x / s) * so)])
        for (let c = ox - 2; c <= ox + 2; c++) {
          let there = 0;
          for (let y = top; y < y0 - 1; y++) if (dark(O, c, Math.round((y / s - r.y + q.y) * so)) >= 0.3) there++;
          if (there > 0.3 * m) return false;
        }
      let below = 0;
      const depth = Math.max(3, Math.round(0.4 * r.h * s));
      for (let y = y1 + 2; y < y1 + 2 + depth; y++) if (dark(X, x, y) >= 0.3) below++;
      return below <= 0.3 * depth;
    };
    // The stroke at each end of the line, if it rises so.
    const ends: number[] = [];
    for (const dir of [-1, 1]) {
      let x = dir < 0 ? Math.floor(r.x * s) : Math.ceil((r.x + r.w) * s) - 1;
      for (let step = 0; step < 600 && along(x + dir); step++) x += dir;
      for (let c = x - 2; c <= x + 2; c++)
        if (rises(c)) {
          ends.push(c);
          break;
        }
    }
    // A frame has both sides, and its top edge joins them above the text:
    // a single stroke rising at one end (a cell rule added next to an
    // underlined amount, a bracket or a bar inserted right after the word)
    // leaves the underline an underline.
    if (ends.length < 2) return found;
    const [xl, xr] = ends;
    let y = top;
    while (y > 0 && top - y < 2 * r.h * s && dark(X, xl, y - 1) >= 0.3) y--;
    for (let v = y - 1; v <= y + 1; v++) {
      let n = 0;
      for (let x = xl; x <= xr; x++) if (dark(X, x, v - 1) + dark(X, x, v) + dark(X, x, v + 1) >= 0.5) n++;
      if (n >= 0.85 * (xr - xl + 1)) return null;
    }
    return found;
  };
  type Hit = { a: Token; b: Token; colour: boolean; line?: { line: 'strike' | 'underline'; added: boolean; rows: [number, number] }; ink?: Ink; p: number; bold?: boolean };
  // The words compared, by token index (new side): how to look for a
  // fainter line on each (see below).
  const tried = new Map<number, { a: Token; b: Token; p: number; weak: (added: boolean) => FoundLine | null }>();
  const hits: Hit[] = [];
  // A word whose text runs another way than in the other version, by a
  // quarter or a half turn (a label set upright in one and turned in the
  // other, a page turned by /Rotate that could not be turned back), cannot
  // be laid over itself: a turned glyph's strokes lie in other rows, and a
  // stroke of it would pass for a line. Only looked up where either page
  // has text turned so; text set at a slant (a stamp) is an overlay.
  const quarter = (r: TextRun) => r.angle % 90 === 0 && !!r.str.trim();
  const tilted = [result.oldDoc.runs[oldPage], result.newDoc.runs[newPage]].some((rs) => (rs ?? []).some((r) => r.angle !== 0 && quarter(r)));
  for (let p = 0; p < m.length; p += 2) {
    const a = TA[m[p]];
    const b = TB[m[p + 1]];
    if (a.page !== oldPage || b.page !== newPage || a.kind === 'punct' || skip(b)) continue;
    if (a.rects.length !== 1 || b.rects.length !== 1 || under(a, b)) continue;
    // Its colour, though, is told from the glyphs' ink as a whole, whichever
    // way they run (a label turned and recoloured).
    const turned = tilted && wordAngle(result.oldDoc, a, quarter) !== wordAngle(result.newDoc, b, quarter);
    // An overlay drawn over or behind the word on one side: the word is
    // compared outside the overlay's ink.
    const over = cover(a, b);
    if (over === 'skip') continue;
    const [ca, cb] = over;
    const few = b.kind === 'cjk' || [...b.text].length <= 2;
    // A graphic that changed next to (or behind) the word or around it, or
    // an overlay on it: its strokes may cross the word at a slant (see
    // level).
    const g = near(a, b);
    const opts = { drift: b.kind !== 'cjk', cjk: b.kind === 'cjk', rows: own(a, b), exact, level: !!(ca || cb || g) || graphicAt(a, b) };
    const lines = (ga: Cover | null, gb: Cover | null) => {
      const added = framed(rowEdge(addedLine(A, a.rects[0], B, b.rects[0], few, ga, gb, opts), B, pageLines.new, b, a), B, A, b, a);
      const removed = added ? null : framed(rowEdge(addedLine(B, b.rects[0], A, a.rects[0], few, gb, ga, opts), A, pageLines.old, a, b), A, B, a, b);
      return added ? { line: added.line, added: true, rows: added.rows } : removed ? { line: removed.line, added: false, rows: removed.rows } : null;
    };
    let line = turned ? null : lines(ca, cb);
    // A graphic that changed next to (or behind) the word explains its ink
    // where it lies: the word is measured outside the graphic's ink, or not
    // at all where that ink cannot be told apart. So is a line looked for
    // again where none was found: a stamp drawn across the word changes the
    // rows that must stay as they were, and a slanted border of its own is
    // no line.
    const again = !turned && !line && g && g !== 'skip' && (g[0] || g[1]) && !(ca && g[0]) && !(cb && g[1]);
    if (again) line = lines(ca ?? g[0], cb ?? g[1]);
    const [wa, wb] = again ? [ca ?? g[0], cb ?? g[1]] : [ca, cb];
    const weak = { ...opts, weak: true, drift: false };
    const fainter = (added: boolean) =>
      added
        ? framed(rowEdge(addedLine(A, a.rects[0], B, b.rects[0], few, wa, wb, weak), B, pageLines.new, b, a), B, A, b, a)
        : framed(rowEdge(addedLine(B, b.rects[0], A, a.rects[0], few, wb, wa, weak), A, pageLines.old, a, b), A, B, a, b);
    tried.set(b.i, { a, b, p, weak: (added) => (turned ? null : fainter(added)) });
    if (line) {
      hits.push({ a, b, colour: false, line, p });
      continue;
    }
    if (g === 'skip') continue;
    const oa = [ca, g?.[0]].filter((c): c is Cover => !!c);
    const ob = [cb, g?.[1]].filter((c): c is Cover => !!c);
    const covers = oa.length + ob.length > 0;
    const [ka, kb] = pitch(a, b);
    const ia = ink(A, ka, covers ? (x, y) => oa.some((c) => c.at(x, y) !== 0) || ob.some((c) => c.atOther(x, y) !== 0) : undefined);
    const ib = ink(B, kb, covers ? (x, y) => ob.some((c) => c.at(x, y) !== 0) || oa.some((c) => c.atOther(x, y) !== 0) : undefined);
    if (ia.n < 6 || ib.n < 6) continue;
    const colour =
      Math.hypot(ia.chroma[0] - ib.chroma[0], ia.chroma[1] - ib.chroma[1], ia.chroma[2] - ib.chroma[2]) > 30 ||
      Math.max(Math.abs(ia.bg[0] - ib.bg[0]), Math.abs(ia.bg[1] - ib.bg[1]), Math.abs(ia.bg[2] - ib.bg[2])) > 40;
    const change = Math.abs(ia.total - ib.total) / Math.max(ia.total, ib.total, 1);
    const weight = change > 0.3;
    // The same glyphs drawn heavier (or lighter) at the very same pixels,
    // with nothing else drawn near them: shown even on a single word. Not
    // on a page turned back, whose glyphs were drawn on another pixel grid.
    const bold = exact && !colour && !covers && change > 0.1 && (ib.total > ia.total ? heavier(A, ka, B, kb) : heavier(B, kb, A, ka));
    if (colour || weight || bold) hits.push({ a, b, colour, ink: ib, p, bold });
  }
  // A line found through or under a word goes on at the same height across
  // the next words of the line where it is fainter there (a tracked
  // deletion in the reviewer's colour, thin and pale, struck through word by
  // word): such a word, next to it (one punctuation mark may lie between),
  // with a fainter line at the same rows (within a pixel), is struck or
  // underlined as well, not only recoloured. Followed along the line.
  const byToken = new Map(hits.map((h) => [h.b.i, h]));
  const queue = hits.filter((h) => h.line);
  while (queue.length) {
    const h = queue.pop()!;
    const l = h.line!;
    for (const d of [-2, -1, 1, 2]) {
      const t = tried.get(h.b.i + d);
      if (!t || t.b.line !== h.b.line || byToken.get(t.b.i)?.line) continue;
      const f = t.weak(l.added);
      if (!f || f.line !== l.line || Math.abs(f.rows[0] + f.rows[1] - l.rows[0] - l.rows[1]) > 2) continue;
      const next: Hit = { a: t.a, b: t.b, colour: false, line: { line: f.line, added: l.added, rows: f.rows }, p: t.p };
      const old = byToken.get(t.b.i);
      if (old) hits[hits.indexOf(old)] = next;
      else hits.push(next);
      byToken.set(t.b.i, next);
      queue.push(next);
    }
  }
  hits.sort((u, v) => u.p - v.p);
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
    // tokens, unless the same glyphs were drawn heavier at the same pixels
    // (see heavier); a colour change or a line through or under text is
    // convincing on its own.
    if (group.length && (group.length >= 2 || group[0].colour || group[0].line || group[0].bold)) {
      const newRects = group.map((h) => h.b.rects[0]);
      out.push({
        id: '',
        kind: 'graphic',
        category: 'visual',
        old: { pages: [oldPage], rects: perLine(oldPage, group.map((h) => h.a)), text: span(TA, group.map((h) => h.a)) },
        new: { pages: [newPage], rects: perLine(newPage, group.map((h) => h.b)), text: span(TB, group.map((h) => h.b)) },
        format: group[0].line ? { appearanceChanged: true, decoration: { line: group[0].line.line, added: group[0].line.added } } : { appearanceChanged: true },
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
  // The same new colour (and background) on both words.
  const alike = (u: Ink, v: Ink) =>
    Math.hypot(u.chroma[0] - v.chroma[0], u.chroma[1] - v.chroma[1], u.chroma[2] - v.chroma[2]) <= 30 &&
    Math.max(Math.abs(u.bg[0] - v.bg[0]), Math.abs(u.bg[1] - v.bg[1]), Math.abs(u.bg[2] - v.bg[2])) <= 40;
  // A line through or under text that goes on at the start of the next line
  // of the same paragraph is one change (a struck sentence that wraps), and
  // so is a colour, weight or background that does (a tracked deletion shown
  // in the reviewer's colour, a highlight over three lines) when the words
  // got the same colour and background. The words must follow each other on
  // both sides. Two lines of one paragraph that turned different colours
  // stay two changes.
  const wraps = (last: Hit, h: Hit) =>
    last.b.block === h.b.block &&
    last.a.block === h.a.block &&
    h.b.i > last.b.i &&
    h.a.i > last.a.i &&
    h.a.i - last.a.i <= 2 &&
    (!!h.line || (!!h.ink && !!last.ink && last.colour === h.colour && alike(last.ink, h.ink)));
  for (const h of hits) {
    const last = group[group.length - 1];
    if (last && ((last.b.line !== h.b.line && !wraps(last, h)) || h.b.i - last.b.i > 2 || key(last) !== key(h))) flush();
    group.push(h);
  }
  flush();
  return out;
}

/** Share of a token's box that text on one side only must cover to explain a change of its ink (see overlays). */
const OVERLAY_SHARE = 0.2;

/**
 * Where the text of text changes lies on one page of one side (inserted,
 * deleted, replaced or moved text): one shape per token, its box, or for
 * rotated text the box turned with its run, so that a diagonal watermark
 * covers the band its letters run along, not its whole bounding box. Words
 * that such text overlaps (a watermark removed from over a paragraph, a
 * stamp added over a signature line) change their ink because of it;
 * ordinary inserted or deleted words sit beside other words, not on them.
 */
type Shape = { box: Rect; inside: (x: number, y: number) => boolean };
function overlays(result: CompareResult, side: 'old' | 'new', page: number, opts: { only?: Change[]; pad?: (h: number) => number } = {}): Shape[] {
  const doc = side === 'old' ? result.oldDoc : result.newDoc;
  const rotated = (doc.runs[page] ?? []).filter((r) => r.angle !== 0 && r.rot && r.str.trim());
  const out: Shape[] = [];
  for (const c of opts.only ?? result.changes) {
    const s = c[side];
    if (c.category !== 'text' || c.kind === 'format' || c.kind === 'position' || s.start === undefined || s.end === undefined) continue;
    for (let i = s.start; i < s.end; i++) {
      const t = doc.tokens[i];
      if (!t || t.page !== page || t.furniture) continue;
      for (const b of t.rects) {
        const cx = b.x + b.w / 2;
        const cy = b.y + b.h / 2;
        const run = rotated.find((r) => cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h);
        if (!run) {
          const e = expand(b, opts.pad?.(b.h) ?? 0);
          out.push({ box: e, inside: (x, y) => x >= e.x && x <= e.x + e.w && y >= e.y && y <= e.y + e.h });
          continue;
        }
        // In the run's upright frame (see tokenize.ts): the token's box
        // there is as high as the run, and as long as its bounding box allows.
        const a = (run.angle * Math.PI) / 180;
        const cos = Math.cos(a);
        const sin = Math.sin(a);
        const H = run.rot!.ascent + run.rot!.descent;
        const L = Math.abs(cos) >= Math.abs(sin) ? (b.w - Math.abs(sin) * H) / Math.abs(cos) : (b.h - Math.abs(cos) * H) / Math.abs(sin);
        const cu = cx * cos + cy * sin;
        const cv = -cx * sin + cy * cos;
        const pad = opts.pad?.(H) ?? 0;
        out.push({ box: expand(b, pad), inside: (x, y) => Math.abs(x * cos + y * sin - cu) <= L / 2 + pad && Math.abs(-x * sin + y * cos - cv) <= H / 2 + pad });
      }
    }
  }
  return out;
}

/** Share of a rect that the shapes cover (sampled on a 5 × 5 grid). */
function covered(r: Rect, shapes: Shape[]): number {
  const near = shapes.filter((f) => intersects(f.box, r));
  if (!near.length) return 0;
  let n = 0;
  for (let j = 0; j < 5; j++) for (let i = 0; i < 5; i++) if (near.some((f) => f.inside(r.x + ((i + 0.5) * r.w) / 5, r.y + ((j + 0.5) * r.h) / 5))) n++;
  return n / 25;
}

// States of a pixel near a word under an overlay (see overlayInk).
/** The overlay's own ink: its colour, where the other version shows something else. */
const INK = 1;
/** Within a pixel of that ink (its anti-aliased edge). */
const RING = 2;
/** Enclosed by that ink but of another colour: a glyph it is drawn over or behind. */
const UNDER = 3;

/** The ink of an overlay around one word on its side (see overlayInk). */
interface Cover {
  /** State of a pixel of this side (INK, RING, UNDER, or 0). */
  at: (x: number, y: number) => number;
  /** State of the pixel of this side where a pixel of the other side's word lies. */
  atOther: (x: number, y: number) => number;
  /** The glyphs under the overlay show through it: it lies behind them, or is transparent. */
  clear: boolean;
  /** Much of what differs next to the word is not the overlay's ink: the word cannot be measured outside it. */
  partial: boolean;
}

/**
 * The pixels around a word that the ink of an overlay covers: text on one
 * side only drawn over or behind the word (a watermark removed, a stamp
 * added; see overlays). `x` is the word's box on the overlay's side `X`,
 * `y` the same word's box on the other side. The overlay's colour is taken
 * from its ink on paper next to the word (inside the overlay's letters,
 * outside the word's own box, where the other side shows paper); its ink
 * is that colour where the other side shows something else, and what it
 * encloses (the glyphs it covers) is under it. The word is then compared
 * outside that ink only (see addedLine and appearanceChanges), so an edit
 * of the word itself is still seen where it is visible in both versions.
 * Null when no such ink lies near the word (it sits between the overlay's
 * strokes, or the overlay is as light as paper).
 */
function overlayInk(X: Prepared, x: Rect, Y: Prepared, y: Rect, shapes: Shape[]): Cover | null {
  const sx = X.r.scale;
  const sy = Y.r.scale;
  const W = X.r.width;
  const pad = 0.5 * x.h;
  const area = { x: x.x - pad, y: x.y - pad, w: x.w + 2 * pad, h: 1.15 * x.h + 2 * pad };
  const x0 = Math.max(0, Math.floor(area.x * sx));
  const y0 = Math.max(0, Math.floor(area.y * sx));
  const x1 = Math.min(W, Math.ceil((area.x + area.w) * sx));
  const y1 = Math.min(X.r.height, Math.ceil((area.y + area.h) * sx));
  const w = x1 - x0;
  const h = y1 - y0;
  const near = shapes.filter((f) => intersects(f.box, area));
  if (w <= 0 || h <= 0 || !near.length) return null;
  // Pixel of X → pixel of Y, as the word moved (and back).
  const toY = (px: number, py: number) => {
    const qx = Math.round(((px + 0.5) / sx - x.x + y.x) * sy - 0.5);
    const qy = Math.round(((py + 0.5) / sx - x.y + y.y) * sy - 0.5);
    return qx >= 0 && qy >= 0 && qx < Y.r.width && qy < Y.r.height ? qy * Y.r.width + qx : -1;
  };
  const dx = X.r.data;
  const dy = Y.r.data;
  const n = w * h;
  const other = new Int32Array(n);
  const inShape = new Uint8Array(n);
  const samples: number[][] = [[], [], []];
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const k = j * w + i;
      const px = x0 + i;
      const py = y0 + j;
      other[k] = toY(px, py);
      const ux = (px + 0.5) / sx;
      const uy = (py + 0.5) / sx;
      if (!near.some((f) => f.inside(ux, uy))) continue;
      inShape[k] = 1;
      if (ux >= x.x && ux <= x.x + x.w && uy >= x.y && uy <= x.y + x.h) continue;
      const p = (py * W + px) * 4;
      const q = other[k] * 4;
      const ref = q < 0 ? [255, 255, 255] : [dy[q], dy[q + 1], dy[q + 2]];
      if (Math.min(...ref) >= 240 && Math.max(Math.abs(dx[p] - ref[0]), Math.abs(dx[p + 1] - ref[1]), Math.abs(dx[p + 2] - ref[2])) > 8) for (let c = 0; c < 3; c++) samples[c].push(dx[p + c]);
    }
  }
  if (samples[0].length < 8) return null;
  const colour = samples.map((v) => v.sort((u, t) => u - t)[v.length >> 1]);
  // How far the overlay's colour is from paper; a light watermark is told
  // from paper and from the glyphs with a tolerance to match.
  const dev = 255 - Math.min(...colour);
  if (dev < 12) return null;
  const tol = Math.min(40, dev / 2);
  const state = new Uint8Array(n);
  for (let k = 0; k < n; k++) {
    if (!inShape[k]) continue;
    const p = ((y0 + ((k / w) | 0)) * W + x0 + (k % w)) * 4;
    const q = other[k] * 4;
    const own = Math.max(Math.abs(dx[p] - colour[0]), Math.abs(dx[p + 1] - colour[1]), Math.abs(dx[p + 2] - colour[2])) <= tol;
    const differs = q < 0 || Math.max(Math.abs(dx[p] - dy[q]), Math.abs(dx[p + 1] - dy[q + 1]), Math.abs(dx[p + 2] - dy[q + 2])) > tol;
    if (own && differs) state[k] = INK;
  }
  // Square dilation and erosion by r pixels.
  const dilate = (src: Uint8Array, r: number) => {
    const out = new Uint8Array(n);
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++) {
        search: for (let v = Math.max(0, j - r); v <= Math.min(h - 1, j + r); v++)
          for (let u = Math.max(0, i - r); u <= Math.min(w - 1, i + r); u++)
            if (src[v * w + u]) {
              out[j * w + i] = 1;
              break search;
            }
      }
    return out;
  };
  const erode = (src: Uint8Array, r: number) => {
    const out = new Uint8Array(n);
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++) {
        let all = 1;
        search: for (let v = Math.max(0, j - r); v <= Math.min(h - 1, j + r); v++)
          for (let u = Math.max(0, i - r); u <= Math.min(w - 1, i + r); u++)
            if (!src[v * w + u]) {
              all = 0;
              break search;
            }
        out[j * w + i] = all;
      }
    return out;
  };
  const ring = dilate(state, 1);
  const closed = erode(dilate(state, 2), 2);
  for (let k = 0; k < n; k++) if (!state[k]) state[k] = ring[k] ? RING : closed[k] ? UNDER : 0;
  // Glyphs show through: where the other side's word is dark under the
  // overlay, this side is dark too (and not of the overlay's colour).
  let dark = 0;
  let through = 0;
  for (let k = 0; k < n; k++) {
    if (!closed[k] && state[k] !== INK) continue;
    const q = other[k];
    if (q < 0 || Y.lum[q] >= 128) continue;
    dark++;
    if (state[k] !== INK && X.lum[(y0 + ((k / w) | 0)) * W + x0 + (k % w)] < 128) through++;
  }
  // The overlay's ink accounts for what differs around the word: the
  // pixels next to it (outside its box, where the overlay lies) that differ
  // from the other side are nearly all that ink or under it. A tint laid
  // over a whole table row is not told from the row this way.
  let differ = 0;
  let explained = 0;
  for (let k = 0; k < n; k++) {
    if (!inShape[k]) continue;
    const ux = (x0 + (k % w) + 0.5) / sx;
    const uy = (y0 + ((k / w) | 0) + 0.5) / sx;
    if (ux >= x.x && ux <= x.x + x.w && uy >= x.y && uy <= x.y + x.h) continue;
    const p = ((y0 + ((k / w) | 0)) * W + x0 + (k % w)) * 4;
    const q = other[k] * 4;
    if (q >= 0 && Math.max(Math.abs(dx[p] - dy[q]), Math.abs(dx[p + 1] - dy[q + 1]), Math.abs(dx[p + 2] - dy[q + 2])) <= THRESH) continue;
    differ++;
    if (state[k]) explained++;
  }
  const at = (px: number, py: number) => (px < x0 || py < y0 || px >= x1 || py >= y1 ? 0 : state[(py - y0) * w + px - x0]);
  return {
    at,
    atOther: (qx, qy) => at(Math.round(((qx + 0.5) / sy - y.x + x.x) * sx - 0.5), Math.round(((qy + 0.5) / sy - y.y + x.y) * sx - 0.5)),
    clear: !dark || through >= 0.4 * dark,
    partial: explained < 0.8 * differ,
  };
}

/** Boxes of one word in two versions that can be laid over each other: their sizes differ by at most 15 %. */
function sameShape(a: Rect, b: Rect): boolean {
  return Math.abs(a.w - b.w) <= 0.15 * Math.max(a.w, b.w) && Math.abs(a.h - b.h) <= 0.15 * Math.max(a.h, b.h);
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
  const ratio = dst.r.scale / src.r.scale;
  return foundAt(src, dst, r, (x, y) => [x * ratio + dx * dst.r.scale, y * ratio + dy * dst.r.scale], inkOnly) === true;
}

/**
 * The pixels of a region (src page points) are found in dst where `to`
 * puts them (a src pixel → dst pixel coordinates), give or take SHIFT_PT
 * and a pixel of stroke width, in the same colours; see movedWith. Null
 * with `inkOnly` when the region has too little ink to tell.
 */
function foundAt(src: Pick<Prepared, 'r' | 'mask'>, dst: Pick<Prepared, 'r'>, r: Rect, to: (x: number, y: number) => [number, number], inkOnly: boolean, tol = 48): boolean | null {
  const m = missing(src, dst, r, to, inkOnly, tol, 0.15);
  return m && m.miss <= 0.15 * m.n;
}

/** Offsets within ±S pixels, nearest first (the place `to` gives is the likeliest). */
const spirals = new Map<number, Int8Array>();
function spiral(S: number): Int8Array {
  let o = spirals.get(S);
  if (o) return o;
  const list: [number, number][] = [];
  for (let oy = -S; oy <= S; oy++) for (let ox = -S; ox <= S; ox++) list.push([ox, oy]);
  list.sort((a, b) => Math.hypot(a[0], a[1]) - Math.hypot(b[0], b[1]));
  spirals.set(S, (o = Int8Array.from(list.flat())));
  return o;
}

/**
 * The sampled pixels of a region not found where `to` puts them at the
 * best offset within SHIFT_PT (see foundAt), counted up to `stop` of them
 * (a share): the count, the number sampled, the area one sample stands
 * for (pt²) and, with `where`, the box around them (src points). Text is
 * left out where `src.mask` is given. Null when there is nothing to sample.
 * The offsets are tried nearest first; with `enough` (pt²), the search
 * ends at the first offset where the missed samples cover less than that.
 */
function missing(
  src: { r: Raster; mask: Uint8Array | null },
  dst: Pick<Prepared, 'r'>,
  r: Rect,
  to: (x: number, y: number) => [number, number],
  inkOnly: boolean,
  tol: number,
  stop = 1,
  where = false,
  enough = 0,
): { miss: number; n: number; area: number; box: Rect | null } | null {
  const rs = src.r;
  const rd = dst.r;
  const sd = rs.data;
  const dd = rd.data;
  const x0 = Math.max(0, Math.floor(r.x * rs.scale));
  const y0 = Math.max(0, Math.floor(r.y * rs.scale));
  const x1 = Math.min(rs.width, Math.ceil((r.x + r.w) * rs.scale));
  const y1 = Math.min(rs.height, Math.ceil((r.y + r.h) * rs.scale));
  const step = Math.max(1, Math.round(Math.sqrt(((x1 - x0) * (y1 - y0)) / (inkOnly ? 8000 : 2000))));
  const pts: number[] = [];
  // With `inkOnly`, paper is not sampled: a region that is mostly paper
  // would otherwise match anywhere.
  const inked = (p: number) => !inkOnly || Math.min(sd[p * 4], sd[p * 4 + 1], sd[p * 4 + 2]) < 230;
  for (let y = y0; y < y1; y += step) {
    for (let x = x0; x < x1; x += step) {
      const p = y * rs.width + x;
      if ((!src.mask || (src.mask[p] !== GLYPH && src.mask[p] !== PAD)) && inked(p)) pts.push(x, y);
    }
  }
  if (!pts.length || (inkOnly && pts.length < 2 * 12)) return null;
  const at: number[] = [];
  for (let k = 0; k < pts.length; k += 2) {
    const [qx, qy] = to(pts[k], pts[k + 1]);
    at.push(Math.round(qx), Math.round(qy));
  }
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
      if (sd[a + ch] < lo - tol || sd[a + ch] > hi + tol) return false;
    }
    return true;
  };
  const S = Math.round(SHIFT_PT * rd.scale);
  const n = pts.length / 2;
  const allowed = stop * n;
  const area = (step * step) / (rs.scale * rs.scale);
  // Missed samples that cover less than `enough` end the search.
  const few = enough > 0 ? Math.ceil(enough / area) - 1 : 0;
  const offsets = spiral(S);
  let best = Infinity;
  let bx = 0;
  let by = 0;
  for (let o = 0; o < offsets.length && best > few; o += 2) {
    const ox = offsets[o];
    const oy = offsets[o + 1];
    let miss = 0;
    for (let k = 0; k < pts.length && miss <= allowed && miss < best; k += 2) {
      if (!near(pts[k + 1] * rs.width + pts[k], at[k] + ox, at[k + 1] + oy)) miss++;
    }
    if (miss < best) [best, bx, by] = [miss, ox, oy];
  }
  let box: Rect | null = null;
  if (where && best > 0) {
    const missed: Rect[] = [];
    for (let k = 0; k < pts.length; k += 2)
      if (!near(pts[k + 1] * rs.width + pts[k], at[k] + bx, at[k + 1] + by)) missed.push({ x: pts[k] / rs.scale, y: pts[k + 1] / rs.scale, w: step / rs.scale, h: step / rs.scale });
    box = union(missed);
  }
  return { miss: best, n, area, box };
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
 * A rule of its own lies along `rect` of a page: a pixel row in it (or one
 * pixel beyond) whose colour across the rect (the median, text left out)
 * is not paper and not a blend of the rows two pixels above and below it.
 * The anti-aliased edge of a fill or a band is such a blend; a grey rule
 * under a light blue header fill, or a black one on paper, is not.
 */
export function ruleAt(doc: DocModel, page: number, r: Raster, rect: Rect): boolean {
  const s = r.scale;
  const mask = maskOf(doc, page, r);
  const x0 = Math.max(0, Math.floor(rect.x * s));
  const x1 = Math.min(r.width, Math.ceil((rect.x + rect.w) * s));
  const y0 = Math.floor(rect.y * s) - 1;
  const y1 = Math.ceil((rect.y + rect.h) * s) + 1;
  const row = (y: number): number[] | null => {
    if (y < 0 || y >= r.height) return [255, 255, 255];
    const px: [number, number, number][] = [];
    for (let x = x0; x < x1; x++) {
      const i = y * r.width + x;
      if (mask[i] !== GLYPH && mask[i] !== PAD) px.push(rgb(r, i));
    }
    if (px.length < 4) return null;
    return [0, 1, 2].map((c) => px.map((v) => v[c]).sort((u, v) => u - v)[px.length >> 1]);
  };
  // Distance of colour c from the segment between colours a and b.
  const off = (c: number[], a: number[], b: number[]) => {
    const d = b.map((v, k) => v - a[k]);
    const dd = d.reduce((t, v) => t + v * v, 0);
    const t = dd ? Math.max(0, Math.min(1, d.reduce((u, v, k) => u + v * (c[k] - a[k]), 0) / dd)) : 0;
    return Math.max(...c.map((v, k) => Math.abs(v - (a[k] + t * d[k]))));
  };
  for (let y = y0; y < y1; y++) {
    const c = row(y);
    const a = row(y - 2);
    const b = row(y + 2);
    if (!c || !a || !b || Math.min(...c) >= 255 - THRESH) continue;
    if (off(c, a, b) > THRESH) return true;
  }
  return false;
}

/**
 * How a page turned to another orientation (/Rotate) maps the old page onto
 * the new one: a turn by 90°, 180° or 270° and a shift, fitted to the
 * centres of the words matched between the two pages. Null when fewer than
 * three words are matched there, or no such turn puts them within 3 pt of
 * where they are.
 */
function turnOf(result: CompareResult, oldPage: number, newPage: number): Turn | null {
  const A = result.oldDoc.tokens;
  const B = result.newDoc.tokens;
  const m = result.matches;
  const pts: [number, number, number, number][] = [];
  for (let p = 0; p < m.length; p += 2) {
    const a = A[m[p]];
    const b = B[m[p + 1]];
    if (a.page !== oldPage || b.page !== newPage) continue;
    const u = a.rects[0];
    const v = b.rects[0];
    pts.push([u.x + u.w / 2, u.y + u.h / 2, v.x + v.w / 2, v.y + v.h / 2]);
  }
  if (pts.length < 3) return null;
  const med = (v: number[]) => v.sort((p, q) => p - q)[v.length >> 1];
  let best: { a: number; b: number; c: number; d: number; tx: number; ty: number } | null = null;
  let err = Infinity;
  // x' = a·x + b·y + tx, y' = c·x + d·y + ty
  for (const [a, b, c, d] of [
    [0, -1, 1, 0],
    [-1, 0, 0, -1],
    [0, 1, -1, 0],
  ]) {
    const tx = med(pts.map(([x, y, X]) => X - a * x - b * y));
    const ty = med(pts.map(([x, y, , Y]) => Y - c * x - d * y));
    const e = med(pts.map(([x, y, X, Y]) => Math.hypot(X - a * x - b * y - tx, Y - c * x - d * y - ty)));
    if (e < err) [best, err] = [{ a, b, c, d, tx, ty }, e];
  }
  if (!best || err > 3) return null;
  const { a, b, c, d, tx, ty } = best;
  return {
    deg: a === -1 ? 180 : b === -1 ? 90 : 270,
    fwd: (x, y) => [a * x + b * y + tx, c * x + d * y + ty],
    // The inverse of a turn is its transpose.
    inv: (x, y) => [a * (x - tx) + c * (y - ty), b * (x - tx) + d * (y - ty)],
  };
}

/**
 * A page turned to another orientation (/Rotate): its text runs another way
 * in the new version. The turn maps the old page onto the new one, by a
 * quarter, a half or three quarters clockwise. It is the difference of the
 * directions the words matched on the pair run in (see turnedBy), with the
 * page size turned with it (a quarter turn swaps width and height), which
 * holds even for a chart page with a one-word caption. Where three or more
 * words are matched on the pair and that turn does not put them within 3 pt
 * of where they are, the turn fitted to them is taken (see turnOf). A half
 * turn keeps the page size, so that says nothing: the turn must also put
 * most of the matched words where they are (an axis label flipped to read
 * the other way, beside a caption that did not turn, is no page turned).
 * Null when the text runs the same way, or neither gives a turn.
 */
export interface Turn {
  /** Degrees clockwise. */
  deg: 90 | 180 | 270;
  /** Old page point → new page point. */
  fwd: (x: number, y: number) => [number, number];
  /** New page point → old page point. */
  inv: (x: number, y: number) => [number, number];
}
export function pageTurn(result: CompareResult, oldPage: number, newPage: number): Turn | null {
  const a = result.oldDoc.pages[oldPage];
  const b = result.newDoc.pages[newPage];
  if (!a || !b) return null;
  const deg = turnedBy(result, oldPage, newPage);
  if (deg !== 90 && deg !== 180 && deg !== 270) return null;
  const near = (u: number, v: number) => Math.abs(u - v) <= 1.5;
  const W = a.width;
  const H = a.height;
  const sized = deg === 180 ? near(W, b.width) && near(H, b.height) : near(W, b.height) && near(H, b.width);
  // x' = p·x + q·y + tx, y' = r·x + s·y + ty
  const [p, q, r, s, tx, ty] = deg === 90 ? [0, -1, 1, 0, H, 0] : deg === 180 ? [-1, 0, 0, -1, W, H] : [0, 1, -1, 0, 0, W];
  const exact: Turn = {
    deg,
    fwd: (x, y) => [p * x + q * y + tx, r * x + s * y + ty],
    // The inverse of a turn is its transpose.
    inv: (x, y) => [p * (x - tx) + r * (y - ty), q * (x - tx) + s * (y - ty)],
  };
  const fit = turnOf(result, oldPage, newPage);
  if (deg === 180) {
    if (sized && mostAt(result, oldPage, newPage, exact)) return exact;
    return fit?.deg === deg ? fit : null;
  }
  if (sized && (!fit || fit.deg === deg)) return exact;
  return fit;
}

/** More than half of the words matched on the pair lie within 3 pt of where the turn puts them. */
function mostAt(result: CompareResult, oldPage: number, newPage: number, turn: Turn): boolean {
  const A = result.oldDoc.tokens;
  const B = result.newDoc.tokens;
  const m = result.matches;
  let n = 0;
  let near = 0;
  for (let p = 0; p < m.length; p += 2) {
    const a = A[m[p]];
    const b = B[m[p + 1]];
    if (a.page !== oldPage || b.page !== newPage) continue;
    const u = a.rects[0];
    const v = b.rects[0];
    const [x, y] = turn.fwd(u.x + u.w / 2, u.y + u.h / 2);
    n++;
    if (Math.hypot(x - v.x - v.w / 2, y - v.y - v.h / 2) <= 3) near++;
  }
  return n > 0 && near > n / 2;
}

/**
 * By how many degrees clockwise the text of the pair turned: the difference
 * of the directions most of the words matched between the two pages run in
 * (by characters). A label set vertically in the margin, or a diagonal
 * watermark, added to a chart page whose only words are "Figure 2", changes
 * the direction most of the page's characters run in, but not that of the
 * words both versions have. A page turns all its text: unless its width and
 * height swapped with a quarter turn, nearly all the matched characters
 * (nine in ten) must have turned so, else the pair did not turn (an axis
 * label set upright in one version and along the axis in the other, longer
 * than the caption beside it, is a label that turned). Without matched
 * words on the pair, the directions of the two pages' text (DocModel
 * textAngle).
 */
function turnedBy(result: CompareResult, oldPage: number, newPage: number): number {
  const of = (deg: number) => ((deg % 360) + 360) % 360;
  const pages = { a: result.oldDoc.pages[oldPage], b: result.newDoc.pages[newPage] };
  const tilted = (doc: DocModel, page: number) => (doc.runs[page] ?? []).some((r) => r.angle !== 0);
  if (!tilted(result.oldDoc, oldPage) && !tilted(result.newDoc, newPage)) return of((pages.b.textAngle ?? 0) - (pages.a.textAngle ?? 0));
  const A = result.oldDoc.tokens;
  const B = result.newDoc.tokens;
  const m = result.matches;
  const count = new Map<number, number>();
  for (let p = 0; p < m.length; p += 2) {
    const a = A[m[p]];
    const b = B[m[p + 1]];
    if (a.page !== oldPage || b.page !== newPage) continue;
    const d = of(wordAngle(result.newDoc, b) - wordAngle(result.oldDoc, a));
    count.set(d, (count.get(d) ?? 0) + [...b.text].length);
  }
  if (!count.size) return of((pages.b.textAngle ?? 0) - (pages.a.textAngle ?? 0));
  let best = 0;
  let all = 0;
  for (const [d, n] of count) {
    all += n;
    if (n > (count.get(best) ?? 0)) best = d;
  }
  const near = (u: number, v: number) => Math.abs(u - v) <= 1.5;
  const swapped = near(pages.a.width, pages.b.height) && near(pages.a.height, pages.b.width) && !near(pages.a.width, pages.a.height);
  if ((best === 90 || best === 270) && swapped) return best;
  return (count.get(best) ?? 0) >= 0.9 * all ? best : 0;
}

/** The direction of the run a word lies in: of the runs whose box holds its centre (and that `of` accepts), the smallest. */
function wordAngle(doc: DocModel, t: Token, of: (run: TextRun) => boolean = () => true): number {
  const r = t.rects[0];
  const x = r.x + r.w / 2;
  const y = r.y + r.h / 2;
  let best: TextRun | null = null;
  for (const run of doc.runs[t.page] ?? []) {
    if (!run.str.trim() || !of(run) || x < run.x - 0.5 || x > run.x + run.w + 0.5 || y < run.y - 0.5 || y > run.y + run.h + 0.5) continue;
    if (!best || run.w * run.h < best.w * best.h) best = run;
  }
  return best?.angle ?? 0;
}

/**
 * The words matched on the pair turned by a quarter or a half turn, but no
 * turn maps one page onto the other (see pageTurn): the page size did not
 * turn with them, and they do not fit one. The graphics cannot be laid over
 * each other.
 */
export function turnedUnmapped(result: CompareResult, oldPage: number, newPage: number): boolean {
  const deg = turnedBy(result, oldPage, newPage);
  return (deg === 90 || deg === 180 || deg === 270) && !pageTurn(result, oldPage, newPage);
}

/** The box of a rect mapped by a turn (see pageTurn). */
function turnRect(r: Rect, map: (x: number, y: number) => [number, number]): Rect {
  const [x0, y0] = map(r.x, r.y);
  const [x1, y1] = map(r.x + r.w, r.y + r.h);
  return { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
}

/**
 * The new page of a turned pair drawn back in the old page's orientation
 * (`w` × `h` points, at the new raster's scale): each pixel is the new
 * raster's pixel where the turn puts its centre, paper beyond its edge. A
 * quarter turn moves whole pixels, so nothing is resampled.
 */
function unturnRaster(rb: Raster, turn: Turn, w: number, h: number): Raster {
  const s = rb.scale;
  const W = Math.max(1, Math.ceil(w * s));
  const H = Math.max(1, Math.ceil(h * s));
  const out = new Uint8ClampedArray(W * H * 4).fill(255);
  const d = rb.data;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const [X, Y] = turn.fwd((x + 0.5) / s, (y + 0.5) / s);
      const qx = Math.floor(X * s);
      const qy = Math.floor(Y * s);
      if (qx < 0 || qy < 0 || qx >= rb.width || qy >= rb.height) continue;
      const q = (qy * rb.width + qx) * 4;
      const p = (y * W + x) * 4;
      out[p] = d[q];
      out[p + 1] = d[q + 1];
      out[p + 2] = d[q + 2];
      out[p + 3] = d[q + 3];
    }
  }
  return { width: W, height: H, data: out, scale: s };
}

/**
 * The comparison's view of a result in which the new page `page` is turned
 * back by `turn` (see pageTurn): its words, lines and runs in the old page's
 * orientation, so that the pair is compared as an unturned one. Only that
 * page's objects are copied; the changes are shared.
 */
function unturnedView(result: CompareResult, oldPage: number, page: number, turn: Turn): CompareResult {
  const doc = result.newDoc;
  const back = (r: Rect) => turnRect(r, turn.inv);
  // A run's direction turned back; its origin (on the baseline) turned with it.
  const angle = (a: number) => ((((a - turn.deg) % 360) + 540) % 360) - 180;
  const runs = doc.runs.slice();
  runs[page] = (doc.runs[page] ?? []).map((run) => {
    const [ox, oy] = turn.inv(run.rot?.x ?? run.x, run.baseline);
    const a = angle(run.angle);
    const { rot, ...rest } = run;
    return { ...rest, ...back(run), angle: a, baseline: oy, ...(rot && a !== 0 ? { rot: { ...rot, x: ox } } : {}) };
  });
  const pages = doc.pages.slice();
  const p = doc.pages[page];
  const [width, height] = turn.deg === 180 ? [p.width, p.height] : [p.height, p.width];
  pages[page] = { ...p, width, height, textAngle: result.oldDoc.pages[oldPage].textAngle };
  return {
    ...result,
    newDoc: {
      ...doc,
      pages,
      runs,
      tokens: doc.tokens.map((t) => (t.page === page ? { ...t, rects: t.rects.map(back) } : t)),
      lines: doc.lines.map((l) => (l.page === page ? { ...l, rect: back(l.rect) } : l)),
    },
  };
}

/**
 * Compare one old page with one new page. Regions already explained by text
 * changes on these pages are not reported again; regions whose graphics only
 * moved by a few points are returned as `minor` changes. `whole` says that
 * the two pages correspond as a whole (mutual best match, a page without
 * text, or paired by the reviewer): they are then compared even without
 * shared text, and areas outside the smaller page count as blank paper.
 *
 * A new page turned to another orientation (see pageTurn) is turned back
 * first, with its words, lines and runs, and the changes listed on it are
 * seen there in the same orientation: the pair is then compared as any
 * other, so a graphic that only turned with the page matches itself, and a
 * graphic edited, added or removed on the turned page is found at its place
 * (a tick in the margin, a cell filled red), wherever the text is.
 * Everything found, and every place added to a listed change, is turned
 * forward again onto the new page.
 */
export function compareRasters(
  result: CompareResult,
  oldPage: number,
  newPage: number,
  ra: Raster,
  rb: Raster,
  options: { appearance?: boolean; whole?: boolean } = {},
): Change[] {
  const turn = pageTurn(result, oldPage, newPage);
  if (!turn) return compareAligned(result, oldPage, newPage, ra, rb, options);
  const toFrame = (r: Rect) => turnRect(r, turn.inv);
  const toReal = (r: Rect) => turnRect(r, turn.fwd);
  const view = unturnedView(result, oldPage, newPage, turn);
  // The listed changes as the comparison sees them (their places on the new
  // page turned back), each with what it had before.
  const copies = new Map<Change, { orig: Change; old: number; new: number }>();
  const seen = (c: Change): Change => {
    const k: Change = { ...c, old: { ...c.old, rects: c.old.rects.slice() }, new: { ...c.new, rects: c.new.rects.map((q) => (q.page === newPage ? { page: q.page, rect: toFrame(q.rect) } : q)) } };
    copies.set(k, { orig: c, old: c.old.rects.length, new: c.new.rects.length });
    return k;
  };
  view.changes = result.changes.map(seen);
  view.minor = result.minor.map(seen);
  const pv = view.newDoc.pages[newPage];
  const out = compareAligned(view, oldPage, newPage, ra, unturnRaster(rb, turn, pv.width, pv.height), { ...options, turned: true });
  const forward = (q: { page: number; rect: Rect }) => (q.page === newPage ? { page: q.page, rect: toReal(q.rect) } : q);
  // Places the comparison added to listed changes (a row's fill, a change bar).
  const placed = new Map<{ page: number; rect: Rect }, { page: number; rect: Rect }>();
  for (const [k, { orig, old, new: n }] of copies) {
    for (const q of k.old.rects.slice(old)) orig.old.rects.push(q);
    for (const q of k.new.rects.slice(n)) {
      const real = forward(q);
      placed.set(q, real);
      orig.new.rects.push(real);
    }
  }
  const viewFolds = folds.get(view);
  if (viewFolds?.length) {
    let list = folds.get(result);
    if (!list) folds.set(result, (list = []));
    for (const f of viewFolds)
      list.push({ ...f, change: copies.get(f.change)?.orig ?? f.change, rect: f.side === 'new' ? toReal(f.rect) : f.rect, place: f.place ? (placed.get(f.place) ?? null) : null });
  }
  for (const c of out) {
    c.new.rects = c.new.rects.map(forward);
    const first = c.new.rects[0]?.rect ?? (c.old.rects[0] ? toReal(c.old.rects[0].rect) : null);
    if (first) c.order = newPage * 100000 + first.y;
  }
  return out;
}

/** Compare one old page with one new page drawn in the same orientation (see compareRasters). */
function compareAligned(
  result: CompareResult,
  oldPage: number,
  newPage: number,
  ra: Raster,
  rb: Raster,
  options: { appearance?: boolean; whole?: boolean; turned?: boolean },
): Change[] {
  const A = prepare(result.oldDoc, oldPage, ra);
  const B = prepare(result.newDoc, newPage, rb);
  const whole = !!options.whole;
  let fwd = anchorsFor(result, oldPage, newPage, false);
  let bwd = anchorsFor(result, oldPage, newPage, true);
  // Text set at an angle (a watermark, a stamp): masked over its letters
  // only, where they can be told (see refineSlanted).
  const inks = { old: slantInks(A), new: slantInks(B) };
  refineSlanted(A, B, inks.old, fwd);
  refineSlanted(B, A, inks.new, bwd);
  const identity = !fwd.some((a) => a.own);
  if (identity) {
    // No shared text: only compare when the pages are paired as a whole.
    if (!whole && result.oldToNew[oldPage] !== newPage) return [];
    fwd = [{ y: 0, dx: 0, dy: 0, own: true }];
    bwd = [{ y: 0, dx: 0, dy: 0, own: true }];
  }
  const ownF = fwd.filter((a) => a.own);
  const ownB = bwd.filter((a) => a.own);
  // The running header rows of a page compared with its counterpart (see
  // furnitureRows) are compared at the same place even where the text
  // next to them came from, or went to, another page.
  const fixedRows = (side: 'old' | 'new', page: number, other: number) => {
    if ((side === 'old' ? result.oldToNew[page] : result.newToOld[page]) !== other) return [];
    const lines = (side === 'old' ? result.oldDoc : result.newDoc).lines.filter((l) => l.page === page && l.end > l.start);
    return lines.filter((l) => l.furniture).map((l) => rowAround([l], lines));
  };
  // The words of the text changes on each page (see unmatched), but for text
  // set at an angle (a watermark, a stamp), which is drawn over what is
  // there and is compared along its letters (see refineSlanted).
  const fresh = (side: 'old' | 'new', page: number) => {
    const angled = ((side === 'old' ? result.oldDoc : result.newDoc).runs[page] ?? []).filter((x) => slantedRun(x) && x.str.trim());
    return result.changes
      .filter((c) => c.category === 'text' && c.kind !== 'position' && c.kind !== 'format')
      .flatMap((c) => c[side].rects.filter((q) => q.page === page && !angled.some((x) => coveredShare(q.rect, [x]) >= 0.5)).map((q) => q.rect));
  };
  const fwdDiff = unmatched(A, B, fwd, whole, identity, identity ? [] : fixedRows('old', oldPage, newPage), fresh('new', newPage));
  const bwdDiff = unmatched(B, A, bwd, whole, identity, identity ? [] : fixedRows('new', newPage, oldPage), fresh('old', oldPage));
  if (debugHook) debugHook({ fwd, bwd, oldRaw: fwdDiff.real, newRaw: bwdDiff.real, oldShift: fwdDiff.shifted, newShift: bwdDiff.shifted });
  const oldRects = cluster(fwdDiff.real, ra.width / ra.scale);
  const newRects = cluster(bwdDiff.real, rb.width / rb.scale);

  const appearance: Change[] = [];
  const furniture: Change[] = [];
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
    // A graphic difference next to the word: the ink of the graphic on the
    // side that has it (see overlayInk); without such ink on either side
    // (a graphic only moved, or changed in place), the word is not measured.
    const near = (a: Token, b: Token): [Cover | null, Cover | null] | 'skip' | null => {
      const na = differsNear(fwdDiff, ra, a.rects[0]);
      const nb = differsNear(bwdDiff, rb, b.rects[0]);
      if (!na && !nb) return null;
      if (!sameShape(a.rects[0], b.rects[0])) return 'skip';
      // A rule through or along the word's box: not measured (as before an
      // overlay's ink was looked for).
      if ((na && ruleAcross(fwdDiff, ra, a.rects[0])) || (nb && ruleAcross(bwdDiff, rb, b.rects[0]))) return 'skip';
      const ga = na ? overlayInk(A, a.rects[0], B, b.rects[0], [diffShape(fwdDiff, ra, a.rects[0])]) : null;
      const gb = nb ? overlayInk(B, b.rects[0], A, a.rects[0], [diffShape(bwdDiff, rb, b.rects[0])]) : null;
      return (ga || gb) && !ga?.partial && !gb?.partial ? [ga, gb] : 'skip';
    };
    // Text drawn over or behind the word that is on one side only (a DRAFT
    // watermark removed, a stamp added) changes its ink there: that belongs
    // to the text change, which is reported. The word is compared outside
    // that text's ink (see overlayInk), so that a change of its own is not
    // put down to the overlay.
    const coverOld = overlays(result, 'old', oldPage);
    const coverNew = overlays(result, 'new', newPage);
    // A list number shown as a tracked change ("4.3[4.4]" in the reviewer's
    // colour): its colour is part of that consequence of a renumbering,
    // which is counted and shown on request.
    const labels = (side: 'old' | 'new', page: number) => result.minor.filter((c) => c.consequence === 'renumber').flatMap((c) => c[side].rects.filter((r) => r.page === page).map((r) => r.rect));
    const labelOld = labels('old', oldPage);
    const labelNew = labels('new', newPage);
    const under = (a: Token, b: Token) => coveredShare(a.rects[0], labelOld) >= 0.5 || coveredShare(b.rects[0], labelNew) >= 0.5;
    // Text on the line above or below whose box reaches into the word's (a
    // word inserted on the next line, set at line height 1.0) lies beside
    // the word, not on it: an overlay covers the middle of the word's box
    // (a watermark's band, a stamp's letters), or lies within it.
    const over = (r: Rect, shapes: Shape[]) => {
      const cy = r.y + r.h / 2;
      return shapes.filter((f) => intersects(f.box, r) && ((f.box.y <= cy && cy <= f.box.y + f.box.h) || (f.box.y >= r.y && f.box.y + f.box.h <= r.y + r.h)));
    };
    const cover = (a: Token, b: Token): [Cover | null, Cover | null] | 'skip' => {
      const oa = covered(a.rects[0], over(a.rects[0], coverOld)) >= OVERLAY_SHARE;
      const ob = covered(b.rects[0], over(b.rects[0], coverNew)) >= OVERLAY_SHARE;
      if (!oa && !ob) return [null, null];
      // A word turned with its page cannot be laid over itself.
      if (!sameShape(a.rects[0], b.rects[0])) return 'skip';
      const ca = oa ? overlayInk(A, a.rects[0], B, b.rects[0], coverOld) : null;
      const cb = ob ? overlayInk(B, b.rects[0], A, a.rects[0], coverNew) : null;
      return ca?.partial || cb?.partial ? 'skip' : [ca, cb];
    };
    // The regions where the graphics comparison found differences, about a
    // word (see appearanceChanges).
    const graphicAt = (a: Token, b: Token) => oldRects.some((r) => intersects(r, a.rects[0])) || newRects.some((r) => intersects(r, b.rects[0]));
    // Those regions at a place of either page (see rowEdge).
    const graphicIn = (side: 'old' | 'new', at: Rect) => (side === 'old' ? oldRects : newRects).some((r) => intersects(r, at));
    appearance.push(...appearanceChanges(result, oldPage, newPage, A, B, (b) => inFormat(b), near, under, cover, !options.turned, graphicAt, graphicIn));
    // Running headers and footers left out of the text comparison: a line
    // through, under or a colour put on their words (a header's
    // "Confidential" struck through) is a difference in them, counted with
    // the others that are ignored (see furnitureMarks).
    if (result.options.ignoreFurniture && result.oldToNew[oldPage] === newPage) {
      const pairs = furniturePairs(result, oldPage, newPage);
      if (pairs.length)
        for (const c of appearanceChanges({ ...result, matches: Int32Array.from(pairs) }, oldPage, newPage, A, B, () => false, near, () => false, cover, !options.turned, graphicAt, graphicIn)) {
          furnitureMarked.add(c);
          furniture.push(c);
        }
    }
  }

  // Regions explained by text changes on the same page. Text that moved
  // sideways explains the spot it left and where it went, and a frame or
  // stamp around it only if that moved along with it.
  const positions = result.changes.filter((c) => c.kind === 'position' && c.old.rects.length && c.new.rects.length);
  // Text set at an angle (a watermark, a stamp) explains what lies along
  // its letters, not its bounding box, which can cover half the page.
  const slantedRuns = (side: 'old' | 'new', page: number) => ((side === 'old' ? result.oldDoc : result.newDoc).runs[page] ?? []).filter((x) => x.rot && x.angle % 90 !== 0 && x.str.trim());
  const slanted = { old: slantedRuns('old', oldPage), new: slantedRuns('new', newPage) };
  const alongSlanted = (side: 'old' | 'new', page: number) => (slanted[side].length ? overlays(result, side, page, { pad: () => 9 }).filter((f) => slanted[side].some((x) => coveredShare(f.box, [expand(x, 9)]) >= 0.9)) : []);
  const along = { old: alongSlanted('old', oldPage), new: alongSlanted('new', newPage) };
  // What such letters, or a stamp's band, do not explain in a region that
  // lies along them: what is neither the letters (see slantHeld) nor what
  // the other page shows at the mapped place (see apartFrom). A tick drawn
  // between a watermark's letters, or a few points beyond a stamp's frame,
  // which the frame's region took in.
  const offSeen = new Map<string, Rect | null>();
  const offInk = (r: Rect, side: 'old' | 'new'): Rect | null => {
    const ks = inks[side];
    if (!ks.length) return null;
    const key = `${side}:${r.x}:${r.y}:${r.w}:${r.h}`;
    if (offSeen.has(key)) return offSeen.get(key)!;
    const v = offInkOf(r, side, ks);
    offSeen.set(key, v);
    return v;
  };
  const offInkOf = (r: Rect, side: 'old' | 'new', ks: SlantInk[]): Rect | null => {
    const [S, O] = side === 'old' ? [A, B] : [B, A];
    const s = S.r.scale;
    const x0 = Math.max(0, Math.floor(r.x * s));
    const y0 = Math.max(0, Math.floor(r.y * s));
    const x1 = Math.min(S.r.width, Math.ceil((r.x + r.w) * s));
    const y1 = Math.min(S.r.height, Math.ceil((r.y + r.h) * s));
    if (x1 - x0 < 3 || y1 - y0 < 3) return null;
    const held = slantHeld(S, ks, x0, y0, x1, y1);
    const w = x1 - x0;
    const paper = (p: number) => S.planes.every((c) => c[p] + THRESH >= 255);
    return apartFrom(S, O, r, (side === 'old' ? toNew : toOld)(r), (p, x, y) => !!held[(y - y0) * w + x - x0] || paper(p));
  };
  const zones = (side: 'old' | 'new', page: number) => {
    const out: Rect[] = [];
    // Text that is cut off or sticks out (overflow) explains the graphics
    // around it as well, as text changes do.
    for (const c of result.changes)
      if (c.category === 'text' || c.kind === 'overflow')
        for (const r of c[side].rects) if (r.page === page && !slanted[side].some((x) => coveredShare(r.rect, [x]) >= 0.5)) out.push(expand(r.rect, 9));
    for (const c of positions) if (c[side].pages[0] === page) for (const r of [...c.old.rects, ...c.new.rects]) out.push(expand(r.rect, 4));
    return out;
  };
  const rows = { old: rowBands(result, 'old', oldPage), new: rowBands(result, 'new', newPage) };
  const runningRows = { old: furnitureRows(result, 'old', oldPage, newPage), new: furnitureRows(result, 'new', newPage, oldPage) };
  // Where a region of one page lies on the other: displaced like the
  // matched line above it, or like the one below it (a rule between an
  // inserted paragraph and the text after it went down with that text).
  const mapWith = (anchors: Anch[], below = false) => (r: Rect): Rect => {
    let best = anchors[0] ?? { y: 0, dx: 0, dy: 0, own: true };
    if (below) best = anchors.find((a) => a.y > r.y + r.h / 2) ?? anchors[anchors.length - 1] ?? best;
    else for (const a of anchors) if (a.y <= r.y + r.h / 2) best = a;
    return { x: r.x + best.dx, y: r.y + best.dy, w: r.w, h: r.h };
  };
  const toNew = mapWith(ownF);
  const toOld = mapWith(ownB);
  const toNewBelow = mapWith(ownF, true);
  const toOldBelow = mapWith(ownB, true);
  // Words of a text change on the other page drawn over the same fill as
  // this page shows there (words added in a shaded cell or a filled form
  // field, the old ones deleted): the fill under them differs from the
  // glyphs, which are not compared. The region on this page must be of one
  // colour, and the other page around those words of the same colour.
  const textOn = (side: 'old' | 'new', page: number) =>
    result.changes.filter((c) => c.category === 'text' && c.kind !== 'position' && c.kind !== 'format').flatMap((c) => c[side].rects.filter((q) => q.page === page).map((q) => expand(q.rect, 2)));
  const words = { old: textOn('old', oldPage), new: textOn('new', newPage) };
  const fillOf = (P: Prepared, q: Rect, accept: (k: number) => boolean, share = 0.9): number[] | null => {
    const s = P.r.scale;
    const x0 = Math.max(0, Math.floor(q.x * s));
    const y0 = Math.max(0, Math.floor(q.y * s));
    const x1 = Math.min(P.r.width, Math.ceil((q.x + q.w) * s));
    const y1 = Math.min(P.r.height, Math.ceil((q.y + q.h) * s));
    const step = Math.max(1, Math.round(Math.sqrt(((x1 - x0) * (y1 - y0)) / 2000)));
    const px: number[] = [];
    for (let y = y0; y < y1; y += step) for (let x = x0; x < x1; x += step) if (accept(P.mask[y * P.r.width + x])) px.push(y * P.r.width + x);
    if (px.length < 20) return null;
    const med = P.planes.map((c) => px.map((i) => c[i]).sort((u, v) => u - v)[px.length >> 1]);
    const alike = px.filter((i) => P.planes.every((c, k) => Math.abs(c[i] - med[k]) <= THRESH)).length;
    return alike >= share * px.length ? med : null;
  };
  // What else the region holds on its own page (a status square removed
  // where the new words go): see apartFrom, with the fill as what explains.
  const notFill = (S: Prepared, O: Prepared, r: Rect, m: Rect, fill: number[]): Rect | null =>
    apartFrom(S, O, r, m, (p) => S.planes.every((c, j) => Math.abs(c[p] - fill[j]) <= THRESH));
  /**
   * The region is the fill under a text change's words on the other page
   * (see above): true. When it also holds something that is not that fill
   * (see notFill), that part is returned, to be compared on its own; false
   * when the region is not such a fill.
   */
  const fillUnderText = (r: Rect, side: 'old' | 'new'): boolean | Rect => {
    const o = side === 'old' ? 'new' : 'old';
    if (!words[o].length) return false;
    const [S, O] = side === 'old' ? [A, B] : [B, A];
    const maps = side === 'old' ? [toNew, toNewBelow] : [toOld, toOldBelow];
    const spots = maps.map((f) => f(r)).filter((m) => coveredShare(m, words[o]) >= 0.6);
    if (!spots.length) return false;
    const here = fillOf(S, r, (k) => k !== GLYPH && k !== PAD);
    if (!here) return false;
    const m = spots.find((m) => {
      // Around the words, the fill is the most common colour; their
      // anti-aliased edges reach into it.
      const there = fillOf(O, expand(m, 3), (k) => k !== GLYPH, 0.5);
      return !!there && there.every((v, k) => Math.abs(v - here[k]) <= THRESH);
    });
    if (!m) return false;
    // Words of this page's own in the region (a badge's "URGENT" deleted
    // there): the fill must be what lies behind them too.
    const behind = fillOf(S, r, (k) => k === GLYPH || k === PAD, 0.5);
    if (behind ? !behind.every((v, k) => Math.abs(v - here[k]) <= THRESH) : masked(S, r)) return false;
    return notFill(S, O, r, m, here) ?? true;
  };
  /** Pixels of the region under the page's own text mask (at fillOf's sampling, 20 or more). */
  const masked = (P: Prepared, q: Rect) => fillOf(P, q, (k) => k === GLYPH || k === PAD, 0) !== null;
  // `loose`: the regions of each side that nothing explains, as found
  // before any is folded into a text change (see the row bands below).
  // Found on first need (a region in a text change's row band), once.
  let loose: { old: Rect[]; new: Rect[] } | undefined;
  const looseOf = (): { old: Rect[]; new: Rect[] } => (loose ??= { old: keep(oldRects, 'old', true, true), new: keep(newRects, 'new', true, true) });
  const keep = (rects: Rect[], side: 'old' | 'new', real = false, dry = false) => {
    const page = side === 'old' ? oldPage : newPage;
    const explained = zones(side, page);
    const [src, dst] = side === 'old' ? [A, B] : [B, A];
    const [map, mapBelow] = side === 'old' ? [toNew, toNewBelow] : [toOld, toOldBelow];
    const rest = (r: Rect): boolean => {
      // A change bar in the margin beside the lines of a change.
      const bar = real ? changeBar(result, side, page, r, src.r.scale, appearance) : null;
      if (bar) {
        if (!dry) bar[side].rects.push({ page, rect: r });
        return false;
      }
      // The second stroke of a double underline (an amount underlined twice,
      // as accounting styles do in a ruled spreadsheet cell): a thin region
      // right below an underline found on this side, no wider than its word.
      // Shown as part of that underline.
      const twice = appearance.find(
        (c) =>
          c.format?.decoration?.line === 'underline' &&
          c.format.decoration.added === (side === 'new') &&
          c[side].rects.some((q) => q.page === page && r.h <= 4 && r.y >= q.rect.y + 0.5 * q.rect.h && r.y <= q.rect.y + q.rect.h + 3 && r.x >= q.rect.x - 2 && r.x + r.w <= q.rect.x + q.rect.w + 2),
      );
      if (twice) {
        if (!dry) twice[side].rects.push({ page, rect: r });
        return false;
      }
      // The fill and rules of a table row whose text is a change of its own
      // (or a header row repeated at a page top only because a page break
      // moved): part of that change. A row's fill and rules run across it;
      // a compact graphic on the line of a text change (a signature beside
      // an inserted line, a rule that got shorter and red) is a change of
      // its own. Around text set at an angle (a stamp), which is no table
      // row, what lies in the band is the stamp's own frame.
      // A row of a text change on one side only (a line inserted above a
      // rule that was restyled too) whose region the other side has a
      // region for, at the same place, that nothing explains: one graphic
      // that changed, listed with both places.
      const matched = (x: { change: Change; angled: Shape[] | null }) => {
        if (dry || x.angled || x.change.consequence) return false;
        const l = looseOf();
        return (side === 'old' ? l.new : l.old).some((q) => intersects(expand(map(r), 6), q) || intersects(expand(mapBelow(r), 6), q));
      };
      const row = rows[side].find(
        (x) => (x.angled ? covered(r, x.angled) >= 0.6 && !offInk(r, side) : coveredShare(r, [x.rect]) >= 0.6 && (x.change.consequence === 'repeatedLine' || r.w >= 0.5 * x.rect.w)) && !matched(x),
      );
      if (row && dry) return false;
      if (row) {
        const s = row.change[side];
        const place = { page, rect: r };
        const pushed = !s.rects.some((q) => q.page === page && coveredShare(r, [q.rect]) >= 0.6);
        if (pushed) s.rects.push(place);
        // A header row repeated at a moved page top: checked against
        // another copy of that row (see rowFolds).
        if (real && row.change.consequence === 'repeatedLine') {
          let list = folds.get(result);
          if (!list) folds.set(result, (list = []));
          list.push({ change: row.change, side, page, rect: r, pair: [oldPage, newPage], place: pushed ? place : null });
        }
        return false;
      }
      if (coveredShare(r, runningRows[side]) >= 0.6) return false;
      for (const c of positions) {
        if (c[side].pages[0] !== page) continue;
        const o = c.old.rects[0].rect;
        const n = c.new.rects[0].rect;
        const near = [...c.old.rects, ...c.new.rects].some((q) => intersects(expand(q.rect, 36), r));
        const sign = side === 'old' ? 1 : -1;
        if (near && movedWith(src, dst, r, sign * (n.x - o.x), sign * (n.y - o.y))) return false;
      }
      return true;
    };
    const out: Rect[] = [];
    // A region that took in, along its row, both text set at an angle (a
    // stamp and its frame) and something far from it (a tick at the other
    // end of the row): its parts are judged one by one.
    const raw = side === 'old' ? fwdDiff.real : bwdDiff.real;
    const angledShapes = [...along[side], ...rows[side].flatMap((x) => x.angled ?? [])];
    const parts = (r: Rect) => {
      if (!real || !inks[side].length || !angledShapes.some((f) => intersects(f.box, r))) return [r];
      const own = cluster(raw.filter((q) => coveredShare(q, [r]) >= 0.99), src.r.width / src.r.scale, 18, false);
      return own.length > 1 ? own : [r];
    };
    for (let found of rects.flatMap(parts)) {
      if (coveredShare(found, explained) >= 0.6) continue;
      // Along the letters of text set at an angle, or in a stamp's band (see
      // rowBands): only what they do not explain is left.
      if (covered(found, along[side]) >= 0.6) {
        const off = offInk(found, side);
        if (!off) continue;
        found = off;
      }
      if (rows[side].some((x) => x.angled && covered(found, x.angled) >= 0.6)) found = offInk(found, side) ?? found;
      // The fill under the other page's new words: only what is not that
      // fill is left.
      const fill = fillUnderText(found, side);
      if (fill === true) continue;
      const r = fill || found;
      if (rest(r)) out.push(r);
    }
    return out;
  };
  const oldKeep = keep(oldRects, 'old', true);
  const newKeep = keep(newRects, 'new', true);

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
    // Displaced like the line below it instead (a rule under an inserted line).
    if (!partners.length) partners = all.filter(([n]) => intersects(expand(toNewBelow(r), 10), n));
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
    // A graphic of about the same ink where the region lies on the other
    // page (a thin rule recoloured at the same width, whose new colour
    // lies within the old rule's range of anti-aliased greys there): it
    // changed; it was not added or removed.
    // Not where text set at an angle lies on the other page (a stamp's
    // frame drawn over what was there). Only on pages that correspond: on
    // a pair across a moved page break, a region found on one side is
    // compared with the other pairs of its page (see dedupeGraphics).
    if (!c[other].rects.length && result.oldToNew[oldPage] === newPage && result.newToOld[newPage] === oldPage) {
      const [P, Q] = added ? [B, A] : [A, B];
      const ink = (X: Prepared, q: Rect) => inkIn(X, q.x * X.r.scale, q.y * X.r.scale, (q.x + q.w) * X.r.scale, (q.y + q.h) * X.r.scale);
      const stamped = (q: Rect) => covered(q, along[other]) > 0 || rows[other].some((x) => !!x.angled && covered(q, x.angled) > 0);
      for (const r of c[side].rects) {
        const own = ink(P, r.rect);
        const there = [map(r.rect), ...(whole ? [r.rect] : [])].find((q) => {
          const v = ink(Q, q);
          return own >= 1 && v >= 0.5 * own && v <= 2 * own && !stamped(q);
        });
        if (there) c[other].rects.push({ page, rect: there });
      }
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

  changes.push(...appearance, ...furniture);
  for (const c of changes) foundOn.set(c, `${oldPage}:${newPage}`);
  return changes;
}

/** Appearance changes of running header and footer words (see compareAligned): counted, not listed. */
const furnitureMarked = new WeakSet<Change>();
export function furnitureMark(c: Change): boolean {
  return furnitureMarked.has(c);
}

/**
 * The words of the running header and footer lines of two corresponding
 * pages, paired as matches ([old, new, …]): lines of the same words within
 * 6 pt of the same place.
 */
function furniturePairs(result: CompareResult, oldPage: number, newPage: number): number[] {
  const A = result.oldDoc;
  const B = result.newDoc;
  const of = (doc: DocModel, page: number) => doc.lines.filter((l) => l.page === page && l.furniture && l.end > l.start);
  const key = (doc: DocModel, l: DocModel['lines'][number]) => doc.tokens.slice(l.start, l.end).map((t) => t.key).join(' ');
  const lb = of(B, newPage);
  const used = new Set<number>();
  const out: number[] = [];
  for (const a of of(A, oldPage)) {
    const k = key(A, a);
    const b = lb.find((l) => !used.has(l.id) && Math.abs(l.rect.x - a.rect.x) <= 6 && Math.abs(l.rect.y - a.rect.y) <= 6 && key(B, l) === k);
    if (!b) continue;
    used.add(b.id);
    // Words of the same text only: a page number (keyed alike on every
    // page) is another glyph on the next page, not a "7" struck into an "8".
    for (let i = 0; i < a.end - a.start; i++) if (A.tokens[a.start + i].text === B.tokens[b.start + i].text) out.push(a.start + i, b.start + i);
  }
  return out;
}

/**
 * A difference region shown with a header row repeated at the top of a page
 * only because a page break moved (consequence 'repeatedLine', see
 * rowBands), found on the page pair `pair`.
 */
export interface RowFold {
  change: Change;
  side: 'old' | 'new';
  page: number;
  rect: Rect;
  pair: [number, number];
  /** The place added to the consequence for it (null if one already covered it). */
  place: { page: number; rect: Rect } | null;
}
const folds = new WeakMap<CompareResult, RowFold[]>();

/**
 * The regions that compareRasters showed with repeated header rows. Such a
 * row's fill and rules come and go with it, but only what another copy of
 * the same row also shows is part of it: the caller compares each row
 * with its copies (see rowCopies and rowDiffers) and lists what differs as a
 * graphic change of its own (see listRow). A stamp, a tint or a highlight
 * put on one copy of a header row is so not hidden in the row's
 * consequence.
 */
export function rowFolds(result: CompareResult): RowFold[] {
  return folds.get(result) ?? [];
}

/** A header row repeated at a moved page top (consequence 'repeatedLine') on one page of one side. */
export interface RepeatedRow {
  change: Change;
  side: 'old' | 'new';
  page: number;
  /** Its lines, and the row's width across the text block (see rowAround). */
  lines: DocModel['lines'];
  rect: Rect;
  /** The table row around its lines (see rowAround), within which compareRasters showed regions with it. */
  band: Rect;
  /**
   * The row with the rules along it: its lines and most of the way to the
   * band's edges (a rule between two rows lies halfway between their text),
   * but not the next row's fill beyond.
   */
  edges: Rect;
}

/** The header rows repeated at moved page tops, per page and side (see RepeatedRow). */
export function repeatedRows(result: CompareResult): RepeatedRow[] {
  const out: RepeatedRow[] = [];
  for (const c of result.minor) {
    if (c.consequence !== 'repeatedLine') continue;
    for (const side of ['old', 'new'] as const) {
      const s = c[side];
      if (s.start === undefined || s.end === undefined) continue;
      const doc = side === 'old' ? result.oldDoc : result.newDoc;
      for (const page of s.pages) {
        const all = doc.lines.filter((l) => l.page === page && l.end > l.start);
        const own = all.filter((l) => l.start >= s.start! && l.end <= s.end!);
        if (!own.length) continue;
        const band = rowAround(own, all);
        const u = union(own.map((l) => l.rect));
        const lh = Math.max(...own.map((l) => l.rect.h));
        // The row itself: its lines and a little of the fill around them,
        // not the rows above and below, which differ between copies.
        const top = Math.max(band.y, u.y - 0.3 * lh);
        const bottom = Math.min(band.y + band.h, u.y + u.h + 0.3 * lh);
        const above = u.y - 0.7 * (u.y - band.y);
        const below = u.y + u.h + 0.7 * (band.y + band.h - u.y - u.h);
        out.push({
          change: c,
          side,
          page,
          lines: own,
          rect: { x: band.x, y: top, w: band.w, h: bottom - top },
          band,
          edges: { x: band.x, y: Math.min(top, above), w: band.w, h: Math.max(bottom, below) - Math.min(top, above) },
        });
      }
    }
  }
  return out;
}

/** Another copy of a repeated header row (see rowCopies): its side and page, and how far it lies from the row (points). */
export interface RowCopy {
  side: 'old' | 'new';
  page: number;
  dx: number;
  dy: number;
}

/**
 * Other copies of a repeated header row, in either version: the same lines
 * in the same order, with every word at the same place relative to the
 * first (within 1.5 pt: the same table, not another one with the same
 * headings and other column widths). Copies at the same place on their page
 * (another page top, drawn alike: a program may draw the rule under a
 * repeated row unlike the one under the table's first row) come first,
 * then the nearest pages, this version before the other; at most `max`.
 */
export function rowCopies(result: CompareResult, row: RepeatedRow, max = 4): RowCopy[] {
  const own = row.side === 'old' ? result.oldDoc : result.newDoc;
  const keyOf = (doc: DocModel, l: DocModel['lines'][number]) => doc.tokens.slice(l.start, l.end).map((t) => t.key).join(' ');
  const words = row.lines.map((l) => keyOf(own, l)).join(' | ');
  const first = row.lines[0];
  const mine = row.lines.flatMap((c) => own.tokens.slice(c.start, c.end));
  const out: (RowCopy & { rank: number })[] = [];
  for (const side of ['old', 'new'] as const) {
    const doc = side === 'old' ? result.oldDoc : result.newDoc;
    doc.lines.forEach((l, at) => {
      if (l.end <= l.start || (side === row.side && l.page === row.page)) return;
      const copy = doc.lines.slice(at, at + row.lines.length);
      if (copy.length !== row.lines.length || copy.some((c) => c.page !== l.page) || copy.map((c) => keyOf(doc, c)).join(' | ') !== words) return;
      const dx = l.rect.x - first.rect.x;
      const dy = l.rect.y - first.rect.y;
      const theirs = copy.flatMap((c) => doc.tokens.slice(c.start, c.end));
      if (theirs.length !== mine.length || mine.some((t, k) => Math.abs(theirs[k].rects[0].x - t.rects[0].x - dx) > 1.5 || Math.abs(theirs[k].rects[0].y - t.rects[0].y - dy) > 1.5)) return;
      const rank = (Math.abs(dy) <= 2 ? 0 : 100000) + Math.abs(l.page - row.page) * 2 + (side === row.side ? 0 : 1);
      out.push({ side, page: l.page, dx, dy, rank });
    });
  }
  return out
    .sort((a, b) => a.rank - b.rank)
    .slice(0, max)
    .map(({ side, page, dx, dy }) => ({ side, page, dx, dy }));
}

/**
 * How a repeated header row and a copy of it (see rowCopies) differ: for
 * each of three looks, the box where they do not look alike (covering at
 * least 2 pt²), or null where they do.
 * - `marks`: the ink of the row, glyphs included, that is not found in the
 *   same colours at the copy (see movedWith): a tick, a tint or a highlight
 *   put on this copy.
 * - `fill`: outside the text, each one's ink that the other does not show,
 *   in colours that must match closely (a light fill taken off one copy
 *   differs from paper by only 20–40 levels; the same glyph drawn at
 *   another sub-pixel position differs by more, so glyphs are left out).
 * - `rules`: the same along the row's edges, above and below its text (see
 *   RepeatedRow.edges), within 48 levels: a rule under one copy recoloured,
 *   thickened or taken off.
 * Fill and rules are only told by a copy at the same place of its page
 * (undefined otherwise): a program may draw the rules of a table's first
 * header row unlike those of its repeated copies (a top border).
 * Two copies of one row drawn by the same program match all but a few
 * pixels. `region` is the part of the row's page compared for marks and
 * fill (by default the row itself): the row, and what compareRasters found
 * differing around it on its page pair (see rowFolds).
 */
export interface RowDifference {
  marks: Rect | null;
  fill: Rect | null | undefined;
  rules: Rect | null | undefined;
}
export function rowDiffers(result: CompareResult, row: RepeatedRow, r: Raster, copy: RowCopy, rc: Raster, region: Rect = row.rect): RowDifference {
  const at = (s: Raster, d: Raster, dx: number, dy: number) => (x: number, y: number): [number, number] => [(x * d.scale) / s.scale + dx * d.scale, (y * d.scale) / s.scale + dy * d.scale];
  const docOf = (side: 'old' | 'new') => (side === 'old' ? result.oldDoc : result.newDoc);
  const here = (where: Rect, tol: number, text: boolean) => {
    const m = missing({ r, mask: text ? null : maskOf(docOf(row.side), row.page, r) }, { r: rc }, where, at(r, rc, copy.dx, copy.dy), true, tol, 1, true, 2);
    return m?.box && m.miss * m.area >= 2 ? m.box : null;
  };
  const there = (where: Rect, tol: number) => {
    const away = { ...where, x: where.x + copy.dx, y: where.y + copy.dy };
    const m = missing({ r: rc, mask: maskOf(docOf(copy.side), copy.page, rc) }, { r }, away, at(rc, r, -copy.dx, -copy.dy), true, tol, 1, true, 2);
    return m?.box && m.miss * m.area >= 2 ? { ...m.box, x: m.box.x - copy.dx, y: m.box.y - copy.dy } : null;
  };
  const both = (where: Rect, tol: number) => here(where, tol, false) ?? there(where, tol);
  const e = row.edges;
  const strips = [
    { x: e.x, y: e.y, w: e.w, h: row.rect.y - e.y },
    { x: e.x, y: row.rect.y + row.rect.h, w: e.w, h: e.y + e.h - row.rect.y - row.rect.h },
  ].filter((q) => q.h > 0.5);
  const samePlace = Math.abs(copy.dy) <= 2;
  return {
    marks: here(region, 48, true),
    fill: samePlace ? both(region, 16) : undefined,
    rules: samePlace ? (strips.map((q) => both(q, 48)).find((b) => b) ?? null) : undefined,
  };
}

/**
 * A repeated header row that does not look like any of its copies (at
 * `rect`, see rowDiffers), or has none (`rect` null: each region shown with
 * it), is a graphic change of its own, at `rect`. Without a copy, the
 * regions that compareRasters showed with the row there are its place and
 * are taken off the row's consequence.
 */
export function listRow(result: CompareResult, row: RepeatedRow, rect: Rect | null): Change | null {
  const mine = rowFolds(result).filter((f) => f.change === row.change && f.side === row.side && f.page === row.page && (!rect || intersects(expand(rect, 4), f.rect)));
  if (!rect && !mine.length) return null;
  // Where a copy was compared, the place is what differs from it (a tick,
  // not the whole header band around it); the regions shown with the row
  // stay with it. Without a copy, they are the place.
  if (!rect) {
    for (const f of mine) {
      if (!f.place) continue;
      const s = f.change[f.side];
      s.rects = s.rects.filter((q) => q !== f.place);
    }
  }
  const place = rect ?? union(mine.map((f) => f.rect));
  const counterpart = row.side === 'old' ? result.oldToNew[row.page] : result.newToOld[row.page];
  const [op, np] = mine[0]?.pair ?? (row.side === 'old' ? [row.page, counterpart ?? -1] : [counterpart ?? -1, row.page]);
  const c = graphicChange(op, np, row.side === 'old' ? [place] : [], row.side === 'new' ? [place] : [], place.y);
  c.order = Math.max(0, np) * 100000 + place.y;
  foundOn.set(c, `${op}:${np}`);
  return c;
}

/**
 * The text change that a difference region is the change bar of: a narrow
 * vertical bar (at most 8 pt wide, at least twice as tall) in the margin
 * beside that change's lines — no line of text at its height reaches it, the
 * nearest one starts or ends within 36 pt of it — whose height lies within
 * those lines (give or take half a line and a cell) and is mostly covered
 * by them. Word
 * and LibreOffice mark the lines of tracked changes so in the margin; any
 * revision bar looks the same. The change may be a text change, one of
 * `also` (the colour and line changes of the page pair: a tracked deletion
 * shown struck through) or a consequence (a list number shown as a tracked
 * change), a listed change before a consequence. The bar is then shown as
 * part of that change (its region is added to the change's place) instead
 * of as a graphic of its own. A vertical rule deliberately added in the
 * margin next to edited lines is shown with that edit the same way, not as
 * a separate item.
 */
function changeBar(result: CompareResult, side: 'old' | 'new', page: number, r: Rect, scale: number, also: Change[]): Change | null {
  if (r.w > 8 || r.h < 8 || r.h < 2 * r.w) return null;
  const doc = side === 'old' ? result.oldDoc : result.newDoc;
  const level = doc.lines.filter((l) => l.page === page && l.end > l.start && !l.furniture && l.rect.y < r.y + r.h && l.rect.y + l.rect.h > r.y);
  if (!level.length) return null;
  const starts = Math.min(...level.map((l) => l.rect.x));
  const ends = Math.max(...level.map((l) => l.rect.x + l.rect.w));
  const leftOf = r.x + r.w <= starts + 1 && starts - (r.x + r.w) <= 36;
  const rightOf = r.x >= ends - 1 && r.x - ends <= 36;
  if (!leftOf && !rightOf) return null;
  // Text changes, the colour or line changes of this page pair (a tracked
  // deletion shown struck through), and consequences such as a list number
  // shown as a tracked change; a listed change is preferred to a consequence
  // that covers the bar as well.
  const hosts = [...result.changes.filter((c) => c.category === 'text' && c.kind !== 'position'), ...also, ...result.minor.filter((c) => c.consequence)];
  let best: Change | null = null;
  let bestCover = 0;
  for (const c of hosts) {
    const rs = c[side].rects.filter((q) => q.page === page && q.rect.y < r.y + r.h && q.rect.y + q.rect.h > r.y).map((q) => q.rect);
    if (!rs.length) continue;
    const top = Math.min(...rs.map((q) => q.y));
    const bottom = Math.max(...rs.map((q) => q.y + q.h));
    // The bar spans the lines' leading, and the region is rounded out to
    // whole cells.
    const slack = CELL / scale + 0.5 * Math.max(...rs.map((q) => q.h));
    if (r.y < top - slack || r.y + r.h > bottom + slack) continue;
    const cover = (Math.min(bottom, r.y + r.h) - Math.max(top, r.y)) / r.h;
    if (cover >= 0.7 && (!best || (best.minor && !c.minor) || (!!best.minor === !!c.minor && cover > bestCover))) [best, bestCover] = [c, cover];
  }
  return best;
}

/**
 * Table rows on one page whose text is a change on its own: whole lines
 * inserted, deleted, replaced or moved (a row added to a table, a group
 * heading row that went to the next page), and lines repeated at the page
 * top only because a page break moved (a table's header row that came or
 * went: consequence 'repeatedLine', kept among the minor changes). A row is
 * the lines' box widened to the table row around it: up to a line height
 * above and below, but not into another line of text, and across the page's
 * text block. The fill and rules of such a row come and go with its text, so
 * they belong to that change (compareRasters adds them to its place); for a
 * consequence they are counted and shown with it. This holds for any table
 * whose rows are filled or ruled (Word, LibreOffice, Chromium, spreadsheet
 * print titles). A graphic deliberately added inside a changed row is
 * shown with the row's change, not as an item of its own. A repeated header
 * row keeps only what another copy of it shows as well (see rowFolds): a
 * stamp, a tint or a highlight put on one copy is listed. The copies of a
 * header row that are matched on other pages are compared as usual, so a
 * header shading or rule changed throughout a table is reported there.
 */
function rowBands(result: CompareResult, side: 'old' | 'new', page: number): { rect: Rect; change: Change; angled: Shape[] | null }[] {
  const doc = side === 'old' ? result.oldDoc : result.newDoc;
  const out: { rect: Rect; change: Change; angled: Shape[] | null }[] = [];
  const rotated = (doc.runs[page] ?? []).filter((r) => r.angle !== 0 && r.str.trim());
  let lines: DocModel['lines'] | null = null;
  const candidates = [
    ...result.minor.filter((c) => c.consequence === 'repeatedLine'),
    ...result.changes.filter((c) => c.category === 'text' && c.kind !== 'format' && c.kind !== 'position'),
  ];
  for (const c of candidates) {
    const s = c[side];
    if (!s.pages.includes(page) || s.start === undefined || s.end === undefined) continue;
    lines ??= doc.lines.filter((l) => l.page === page && l.end > l.start);
    // Whole lines only: a word changed inside a row says nothing about its fill.
    const own = lines.filter((l) => l.start >= s.start! && l.end <= s.end!);
    if (!own.length) continue;
    // Lines set at an angle (a stamp): not a table row. What lies along
    // its letters, or within a third of their height and 10 pt (its frame),
    // is its own.
    const angled = own.every((l) => rotated.some((r) => intersects(r, l.rect) && coveredShare(l.rect, [r]) >= 0.5));
    out.push({ rect: rowAround(own, lines), change: c, angled: angled ? overlays(result, side, page, { only: [c], pad: (h) => Math.min(h / 3, 10) + 2 }) : null });
  }
  return out;
}

/** The table row around some lines of a page (see rowBands): `lines` are all lines of the page. */
function rowAround(own: DocModel['lines'], lines: DocModel['lines']): Rect {
  const u = union(own.map((l) => l.rect));
  const lh = Math.max(...own.map((l) => l.rect.h));
  let top = u.y - lh;
  let bottom = u.y + u.h + lh;
  for (const l of lines) {
    if (own.includes(l)) continue;
    if (l.rect.y + l.rect.h <= u.y + 0.5) top = Math.max(top, l.rect.y + l.rect.h);
    else if (l.rect.y >= u.y + u.h - 0.5) bottom = Math.min(bottom, l.rect.y);
  }
  const left = Math.min(u.x, ...lines.map((l) => l.rect.x)) - 12;
  const right = Math.max(u.x + u.w, ...lines.map((l) => l.rect.x + l.rect.w)) + 12;
  return { x: left, y: top, w: right - left, h: bottom - top };
}

/**
 * Rows of the running headers and footers of a page (furniture, which
 * includes a table's header row repeated at the top of most pages), when
 * the page is compared with a page other than its own counterpart in the
 * page map: there the rows' fill and rules stay at the same place, and they
 * are compared on that pair. On another pair (rows that came from the
 * previous page under the repeated header row) the header row's shading
 * has no counterpart, as its text is not compared there either.
 */
function furnitureRows(result: CompareResult, side: 'old' | 'new', page: number, other: number): Rect[] {
  const counterpart = side === 'old' ? result.oldToNew[page] : result.newToOld[page];
  if (counterpart === undefined || counterpart < 0 || counterpart === other) return [];
  const doc = side === 'old' ? result.oldDoc : result.newDoc;
  const lines = doc.lines.filter((l) => l.page === page && l.end > l.start);
  return lines.filter((l) => l.furniture).map((l) => rowAround([l], lines));
}

/** Merge difference regions that are close together (e.g. the borders of one table). */
function cluster(rects: Rect[], pageWidth: number, gap = 18, band = true): Rect[] {
  const out = rects.map((r) => ({ ...r }));
  // Same horizontal band (e.g. several column borders of one table).
  const sameBand = (a: Rect, b: Rect) => {
    if (!band) return false;
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
