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
import { expand, intersects, overlapArea, union } from './geometry.ts';
import { joinTokens } from './tokenize.ts';

export interface Raster {
  width: number;
  height: number;
  /** RGBA, 4 bytes per pixel. */
  data: Uint8ClampedArray | Uint8Array;
  /** Pixels per PDF point. */
  scale: number;
}

const THRESH = 48;
const CELL = 6;

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

function textMask(doc: DocModel, page: number, r: Raster): Uint8Array {
  const m = new Uint8Array(r.width * r.height);
  for (const run of doc.runs[page] ?? []) {
    if (!run.str.trim()) continue;
    const fs = run.fontSize;
    const rect = expand({ x: run.x, y: run.y, w: run.w, h: run.h }, 0.12 * fs + 1, 0.12 * fs + 1);
    const x0 = Math.max(0, Math.floor(rect.x * r.scale));
    const y0 = Math.max(0, Math.floor(rect.y * r.scale));
    const x1 = Math.min(r.width, Math.ceil((rect.x + rect.w) * r.scale));
    const y1 = Math.min(r.height, Math.ceil((rect.y + rect.h) * r.scale));
    for (let y = y0; y < y1; y++) m.fill(1, y * r.width + x0, y * r.width + x1);
  }
  return m;
}

interface Anch {
  y: number; // source y (pt)
  dx: number;
  dy: number;
}

/** Per-line displacement of matched text between the two pages. */
function anchorsFor(result: CompareResult, oldPage: number, newPage: number, invert: boolean): Anch[] {
  const A = result.oldDoc.tokens;
  const B = result.newDoc.tokens;
  const m = result.matches;
  const byLine = new Map<number, Anch[]>();
  for (let p = 0; p < m.length; p += 2) {
    const a = A[m[p]];
    const b = B[m[p + 1]];
    if (a.page !== oldPage || b.page !== newPage) continue;
    const ra = a.rects[0];
    const rb = b.rects[0];
    const src = invert ? b : a;
    const anc = invert
      ? { y: rb.y, dx: ra.x - rb.x, dy: ra.y - rb.y }
      : { y: ra.y, dx: rb.x - ra.x, dy: rb.y - ra.y };
    let arr = byLine.get(src.line);
    if (!arr) byLine.set(src.line, (arr = []));
    arr.push(anc);
  }
  const out: Anch[] = [];
  for (const arr of byLine.values()) {
    arr.sort((u, v) => u.dy - v.dy);
    const mid = arr[arr.length >> 1];
    const dxs = arr.map((a) => a.dx).sort((u, v) => u - v);
    out.push({ y: Math.min(...arr.map((a) => a.y)), dx: dxs[dxs.length >> 1], dy: mid.dy });
  }
  return out.sort((u, v) => u.y - v.y);
}

/**
 * Pixels of `src` that have no counterpart in `dst`, as rects in src page
 * points. Each source row is tried with the displacement of the nearest
 * anchor above and below it.
 */
function unmatched(
  src: Uint8Array[],
  ms: Uint8Array,
  rs: Raster,
  dst: [Uint8Array, Uint8Array][],
  md: Uint8Array,
  rd: Raster,
  anchors: Anch[],
): Rect[] {
  const [s0, s1, s2] = src;
  const [[n0, x0], [n1, x1], [n2, x2]] = dst;
  const T = THRESH;
  const fits = (q: number, p: number) =>
    md[q] === 1 ||
    (s0[p] + T >= n0[q] && s0[p] <= x0[q] + T && s1[p] + T >= n1[q] && s1[p] <= x1[q] + T && s2[p] + T >= n2[q] && s2[p] <= x2[q] + T);
  const w = rs.width;
  const h = rs.height;
  const scale = rs.scale;
  const ratio = rd.scale / rs.scale;
  const cols = Math.ceil(w / CELL);
  const rows = Math.ceil(h / CELL);
  const cells = new Uint16Array(cols * rows);
  // Row → candidate offsets (in destination pixels).
  let ai = 0;
  for (let y = 0; y < h; y++) {
    const ypt = y / scale;
    while (ai < anchors.length && anchors[ai].y <= ypt) ai++;
    const above = anchors[ai - 1];
    const below = anchors[ai];
    const c1 = above ?? below ?? { dx: 0, dy: 0, y: 0 };
    const c2 = below ?? above ?? c1;
    const ox1 = Math.round(c1.dx * rd.scale);
    const oy1 = Math.round((ypt + c1.dy) * rd.scale);
    const ox2 = Math.round(c2.dx * rd.scale);
    const oy2 = Math.round((ypt + c2.dy) * rd.scale);
    const in1 = oy1 >= 0 && oy1 < rd.height;
    const in2 = oy2 >= 0 && oy2 < rd.height;
    if (!in1 && !in2) continue;
    const row = y * w;
    const crow = ((y / CELL) | 0) * cols;
    for (let x = 0; x < w; x++) {
      const p = row + x;
      if (ms[p]) continue;
      const xd = Math.round(x * ratio);
      let ok = false;
      let known = false;
      if (in1) {
        const qx = xd + ox1;
        if (qx >= 0 && qx < rd.width) {
          known = true;
          ok = fits(oy1 * rd.width + qx, p);
        }
      }
      if (!ok && in2) {
        const qx = xd + ox2;
        if (qx >= 0 && qx < rd.width) {
          known = true;
          ok = fits(oy2 * rd.width + qx, p);
        }
      }
      if (known && !ok) cells[crow + ((x / CELL) | 0)]++;
    }
  }
  // Connected components of "hot" cells.
  const hot = new Uint8Array(cells.length);
  for (let i = 0; i < cells.length; i++) hot[i] = cells[i] >= 3 ? 1 : 0;
  const seen = new Uint8Array(cells.length);
  const rects: Rect[] = [];
  const stack: number[] = [];
  for (let i = 0; i < cells.length; i++) {
    if (!hot[i] || seen[i]) continue;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -1;
    let maxY = -1;
    let total = 0;
    stack.push(i);
    seen[i] = 1;
    while (stack.length) {
      const c = stack.pop()!;
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
    rects.push({
      x: (minX * CELL) / scale,
      y: (minY * CELL) / scale,
      w: ((maxX - minX + 1) * CELL) / scale,
      h: ((maxY - minY + 1) * CELL) / scale,
    });
  }
  return rects;
}

/**
 * Total ink (darkness) inside a rect and the ink's chroma (its deviation
 * from neutral grey). Both survive anti-aliasing: grey edge pixels of black
 * text have no chroma, and total coverage is preserved under sub-pixel shifts.
 */
function ink(r: Raster, l: Uint8Array, rect: Rect): { total: number; chroma: [number, number, number]; n: number } {
  // Pad so that sub-pixel placement does not cut glyphs differently.
  const pad = rect.h * 0.15;
  const x0 = Math.max(0, Math.floor((rect.x - pad) * r.scale));
  const y0 = Math.max(0, Math.floor((rect.y - pad) * r.scale));
  const x1 = Math.min(r.width, Math.ceil((rect.x + rect.w + pad) * r.scale));
  const y1 = Math.min(r.height, Math.ceil((rect.y + rect.h + pad) * r.scale));
  let bg = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) bg = Math.max(bg, l[y * r.width + x]);
  let total = 0;
  let n = 0;
  let wsum = 0;
  let cr = 0;
  let cg = 0;
  let cb = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const p = y * r.width + x;
      const v = bg - l[p];
      total += v;
      if (v > 40) {
        n++;
        const q = p * 4;
        wsum += v;
        cr += (r.data[q] - l[p]) * v;
        cg += (r.data[q + 1] - l[p]) * v;
        cb += (r.data[q + 2] - l[p]) * v;
      }
    }
  }
  // Normalise by scale² so both rasters are comparable.
  return { total: total / (r.scale * r.scale), chroma: wsum ? [cr / wsum, cg / wsum, cb / wsum] : [0, 0, 0], n };
}

/** Matched text whose colour or stroke weight changed (e.g. turned red, synthetic bold). */
function appearanceChanges(
  result: CompareResult,
  oldPage: number,
  newPage: number,
  ra: Raster,
  la: Uint8Array,
  rb: Raster,
  lb: Uint8Array,
  skip: Set<number>,
): Change[] {
  const A = result.oldDoc.tokens;
  const B = result.newDoc.tokens;
  const m = result.matches;
  type Hit = { a: Token; b: Token; colour: boolean };
  const hits: Hit[] = [];
  for (let p = 0; p < m.length; p += 2) {
    const a = A[m[p]];
    const b = B[m[p + 1]];
    if (a.page !== oldPage || b.page !== newPage || a.kind === 'punct' || skip.has(b.i)) continue;
    if (a.rects.length !== 1 || b.rects.length !== 1) continue;
    const ia = ink(ra, la, a.rects[0]);
    const ib = ink(rb, lb, b.rects[0]);
    if (ia.n < 6 || ib.n < 6) continue;
    const colour = Math.hypot(ia.chroma[0] - ib.chroma[0], ia.chroma[1] - ib.chroma[1], ia.chroma[2] - ib.chroma[2]) > 30;
    const weight = Math.abs(ia.total - ib.total) / Math.max(ia.total, ib.total, 1) > 0.3;
    if (colour || weight) hits.push({ a, b, colour });
  }
  const out: Change[] = [];
  let group: Hit[] = [];
  const flush = () => {
    // A weight change must be consistent over at least two neighbouring
    // tokens; a colour change is convincing on its own.
    if (group.length >= 2 || group.some((h) => h.colour)) {
      const oldRects = group.map((h) => h.a.rects[0]);
      const newRects = group.map((h) => h.b.rects[0]);
      out.push({
        id: '',
        kind: 'graphic',
        category: 'visual',
        old: { pages: [oldPage], rects: [{ page: oldPage, rect: union(oldRects) }], text: joinTokens(group.map((h) => h.a)) },
        new: { pages: [newPage], rects: [{ page: newPage, rect: union(newRects) }], text: joinTokens(group.map((h) => h.b)) },
        format: { appearanceChanged: true },
        size: group.length,
        cjk: group.some((h) => h.b.kind === 'cjk'),
        contextBefore: '',
        contextAfter: '',
        order: newPage * 100000 + newRects[0].y,
      });
    }
    group = [];
  };
  for (const h of hits) {
    const last = group[group.length - 1];
    if (last && (last.b.line !== h.b.line || h.b.i - last.b.i > 2)) flush();
    group.push(h);
  }
  flush();
  return out;
}

/**
 * Compare one old page with one new page. Regions already explained by text
 * changes on these pages are not reported again.
 */
export function compareRasters(
  result: CompareResult,
  oldPage: number,
  newPage: number,
  ra: Raster,
  rb: Raster,
  options: { appearance?: boolean } = {},
): Change[] {
  const la = luminance(ra);
  const lb = luminance(rb);
  const ma = textMask(result.oldDoc, oldPage, ra);
  const mb = textMask(result.newDoc, newPage, rb);
  const pa = planes(ra);
  const pb = planes(rb);
  const fa = pa.map((c) => minMax(c, ra.width, ra.height));
  const fb = pb.map((c) => minMax(c, rb.width, rb.height));
  let fwd = anchorsFor(result, oldPage, newPage, false);
  let bwd = anchorsFor(result, oldPage, newPage, true);
  if (fwd.length === 0) {
    // No shared text: only compare when the page map pairs these pages.
    if (result.oldToNew[oldPage] !== newPage) return [];
    fwd = [{ y: 0, dx: 0, dy: 0 }];
    bwd = [{ y: 0, dx: 0, dy: 0 }];
  }
  const oldRects = cluster(unmatched(pa, ma, ra, fb, mb, rb, fwd), ra.width / ra.scale);
  const newRects = cluster(unmatched(pb, mb, rb, fa, ma, ra, bwd), rb.width / rb.scale);

  // Ignore regions explained by text changes on the same page.
  const textRects = (side: 'old' | 'new', page: number) =>
    result.changes
      .filter((c) => c.category === 'text')
      .flatMap((c) => c[side].rects.filter((r) => r.page === page).map((r) => expand(r.rect, 3)));
  const keep = (rects: Rect[], explained: Rect[]) =>
    rects.filter((r) => {
      const covered = explained.reduce((s, e) => s + overlapArea(r, e), 0);
      return covered < 0.6 * r.w * r.h;
    });
  const oldKeep = keep(oldRects, textRects('old', oldPage));
  const newKeep = keep(newRects, textRects('new', newPage));

  // Pair old and new regions that correspond to each other.
  const shift = (r: Rect): Rect => {
    let best = fwd[0];
    for (const a of fwd) if (a.y <= r.y + r.h / 2) best = a;
    return { x: r.x + best.dx, y: r.y + best.dy, w: r.w, h: r.h };
  };
  const changes: Change[] = [];
  const usedNew = new Set<number>();
  for (const r of oldKeep) {
    const s = expand(shift(r), 10);
    const partners = newKeep.map((n, k) => [n, k] as const).filter(([n, k]) => !usedNew.has(k) && intersects(s, n));
    partners.forEach(([, k]) => usedNew.add(k));
    const nr = partners.map(([n]) => n);
    changes.push(graphicChange(oldPage, newPage, [r], nr, nr[0]?.y ?? shift(r).y));
  }
  newKeep.forEach((n, k) => {
    if (!usedNew.has(k)) changes.push(graphicChange(oldPage, newPage, [], [n], n.y));
  });
  if (options.appearance !== false) {
    const skip = new Set<number>();
    for (const c of result.changes) if (c.kind === 'format' && c.new.start !== undefined) for (let i = c.new.start; i < c.new.end!; i++) skip.add(i);
    changes.push(...appearanceChanges(result, oldPage, newPage, ra, la, rb, lb, skip));
  }
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

/** Page pairs worth comparing visually, in document order. */
export function visualPairs(result: CompareResult): [number, number][] {
  const pairs = new Map<string, [number, number]>();
  for (const l of result.pageLinks) if (l.weight >= 3) pairs.set(`${l.oldPage}:${l.newPage}`, [l.oldPage, l.newPage]);
  result.oldToNew.forEach((np, op) => {
    if (np >= 0) pairs.set(`${op}:${np}`, [op, np]);
  });
  return [...pairs.values()].sort((a, b) => a[1] - b[1] || a[0] - b[0]);
}

/** Merge graphic changes found by several page pairs that overlap. */
export function dedupeGraphics(changes: Change[]): Change[] {
  const out: Change[] = [];
  for (const c of changes) {
    const dup = out.find(
      (o) =>
        o.kind === c.kind &&
        !!o.format === !!c.format &&
        c.new.rects.length > 0 &&
        o.new.rects.some((r) => c.new.rects.some((s) => r.page === s.page && intersects(expand(r.rect, 4), s.rect))),
    );
    if (!dup) {
      out.push(c);
      continue;
    }
    for (const r of c.old.rects) if (!dup.old.rects.some((s) => s.page === r.page && intersects(s.rect, r.rect))) dup.old.rects.push(r);
    dup.old.pages = [...new Set(dup.old.rects.map((r) => r.page))];
  }
  // Also drop old-only regions that another pair already covers.
  return out.filter(
    (c) =>
      c.new.rects.length > 0 ||
      !out.some((o) => o !== c && o.old.rects.some((r) => c.old.rects.some((s) => r.page === s.page && intersects(r.rect, s.rect)))),
  );
}
