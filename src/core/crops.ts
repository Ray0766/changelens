import type { Change, DocModel, Rect } from './types.ts';
import { focusRect } from './pipeline.ts';

/** Minimal Canvas 2D surface shared by browsers and @napi-rs/canvas. */
export interface CanvasLike {
  width: number;
  height: number;
  getContext(type: '2d'): unknown;
  toDataURL(type?: string, quality?: number): string;
}

interface Ctx {
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  globalAlpha: number;
  imageSmoothingQuality?: string;
  drawImage(img: unknown, sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  strokeRect(x: number, y: number, w: number, h: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
  fill(): void;
}

export const COLORS = {
  del: '#e5484d',
  ins: '#2f9e5b',
  move: '#3e63dd',
  visual: '#8e4ec6',
};

export function sideColor(c: Change, side: 'old' | 'new'): string {
  if (c.category === 'visual') return COLORS.visual;
  if (c.kind === 'move') return COLORS.move;
  return side === 'old' ? COLORS.del : COLORS.ins;
}

export type Region = { page: number; rect: Rect };

/**
 * Regions to show for both sides of a change. Both get the same width so
 * that, displayed side by side at equal size, they share one zoom level.
 */
export function cropRegions(c: Change, oldDoc: DocModel, newDoc: DocModel): { old: Region | null; new: Region | null } {
  const a = cropRegion(c, 'old', oldDoc);
  const b = cropRegion(c, 'new', newDoc);
  if (!a || !b) return { old: a, new: b };
  const w = Math.max(a.rect.w, b.rect.w);
  return { old: cropRegion(c, 'old', oldDoc, w), new: cropRegion(c, 'new', newDoc, w) };
}

/** Region of a page to show for a change, with some context around it. */
export function cropRegion(c: Change, side: 'old' | 'new', doc: DocModel, width?: number): Region | null {
  const f = focusRect(c, side);
  if (!f) return null;
  const pg = doc.pages[f.page];
  const padX = 36;
  const padY = 28;
  // Widen to the full text lines involved (e.g. a whole table row) so the
  // reader sees what a changed value belongs to.
  let lx0 = f.rect.x;
  let lx1 = f.rect.x + f.rect.w;
  for (const line of doc.lines) {
    if (line.page !== f.page || line.furniture) continue;
    const r = line.rect;
    const overlap = Math.min(r.y + r.h, f.rect.y + f.rect.h) - Math.max(r.y, f.rect.y);
    if (overlap > 0.5 * Math.min(r.h, f.rect.h)) {
      lx0 = Math.min(lx0, r.x);
      lx1 = Math.max(lx1, r.x + r.w);
    }
  }
  let x0 = lx0 - padX;
  let x1 = lx1 + padX;
  let y0 = f.rect.y - padY;
  let y1 = f.rect.y + f.rect.h + padY;
  const minW = Math.min(pg.width, Math.max(300, width ?? 0));
  if (x1 - x0 < minW) {
    const cx = (x0 + x1) / 2;
    x0 = cx - minW / 2;
    x1 = cx + minW / 2;
  }
  const maxH = 360;
  if (y1 - y0 > maxH) y1 = y0 + maxH;
  // Clamp to the page.
  if (x0 < 0) {
    x1 -= x0;
    x0 = 0;
  }
  if (x1 > pg.width) {
    x0 = Math.max(0, x0 - (x1 - pg.width));
    x1 = pg.width;
  }
  y0 = Math.max(0, y0);
  y1 = Math.min(pg.height, y1);
  return { page: f.page, rect: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } };
}

/**
 * Draw the crop of a rendered page with the change highlighted and return it
 * as a PNG data URL.
 */
export function drawCrop(
  make: (w: number, h: number) => CanvasLike,
  page: CanvasLike,
  scale: number,
  region: { page: number; rect: Rect },
  c: Change,
  side: 'old' | 'new',
  maxWidth = 900,
): string {
  const r = region.rect;
  const out = Math.min(1, maxWidth / (r.w * scale));
  const w = Math.max(1, Math.round(r.w * scale * out));
  const h = Math.max(1, Math.round(r.h * scale * out));
  const canvas = make(w, h);
  const ctx = canvas.getContext('2d') as Ctx;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(page, r.x * scale, r.y * scale, r.w * scale, r.h * scale, 0, 0, w, h);
  const k = scale * out;
  const color = sideColor(c, side);
  const s = c[side];
  for (const hr of s.rects) {
    if (hr.page !== region.page) continue;
    const x = (hr.rect.x - r.x) * k;
    const y = (hr.rect.y - r.y) * k;
    const rw = hr.rect.w * k;
    const rh = hr.rect.h * k;
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = color;
    ctx.fillRect(x - 2, y - 2, rw + 4, rh + 4);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.strokeRect(x - 2, y - 2, rw + 4, rh + 4);
  }
  if (s.caret && s.caret.page === region.page && s.rects.length === 0) {
    const x = (s.caret.x - r.x) * k;
    const y = (s.caret.y - r.y) * k;
    const ch = s.caret.h * k;
    ctx.fillStyle = color;
    ctx.fillRect(x - 1.5, y - 2, 3, ch + 4);
    ctx.beginPath();
    ctx.moveTo(x - 6, y - 8);
    ctx.lineTo(x + 6, y - 8);
    ctx.lineTo(x, y - 1);
    ctx.closePath();
    ctx.fill();
  }
  return canvas.toDataURL('image/png');
}
