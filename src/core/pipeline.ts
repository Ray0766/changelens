import type { Change, CompareResult, DocModel, Rect, Side } from './types.ts';
import { sortAndNumber } from './compare.ts';
import { union as unionRect } from './geometry.ts';
import { alignPages, compareRasters, dedupeGraphics, foundOnPair, pageSignature, planVisual, reappears, sameGraphic, tooLargeToCompare, type Raster, type VisualPair } from './visual.ts';

export type RenderFn = (page: number) => Promise<Raster>;

/**
 * Add visual (graphic / colour) changes to a text comparison. Pages are
 * rendered on demand through the supplied callbacks and released as soon
 * as no later page pair needs them. A page that is too large, or that fails
 * to render or compare, is skipped and listed in `coverage.*.visualSkipped`;
 * the text result is kept either way.
 */
export async function addVisualChanges(
  result: CompareResult,
  renderOld: RenderFn,
  renderNew: RenderFn,
  onProgress?: (done: number, total: number) => void,
): Promise<Change[]> {
  const docs = { old: result.oldDoc, new: result.newDoc };
  const render = { old: renderOld, new: renderNew };
  const skipped = { old: new Set<number>(), new: new Set<number>() };
  const large = (side: 'old' | 'new', p: number) => {
    const pg = docs[side].pages[p];
    return !!pg && tooLargeToCompare(pg.width, pg.height);
  };
  /** Render a page once for a quick look; null if it cannot be. */
  const look = async (side: 'old' | 'new', p: number) => {
    if (large(side, p)) {
      skipped[side].add(p);
      return null;
    }
    try {
      return pageSignature(await render[side](p));
    } catch {
      skipped[side].add(p);
      return null;
    }
  };

  // Pages without text that the page map could not pair: pair them by their
  // look, and report the rest as added or removed pages.
  const plan = planVisual(result);
  const pairs: VisualPair[] = [...plan.pairs];
  const pageChanges: Change[] = [];
  for (const gap of plan.gaps) {
    const sigOld = await Promise.all(gap.old.map((p) => look('old', p)));
    const sigNew = await Promise.all(gap.new.map((p) => look('new', p)));
    const matched =
      gap.old.length && gap.new.length
        ? alignPages(
            sigOld.map((s) => s?.grid ?? new Float32Array(256)),
            sigNew.map((s) => s?.grid ?? new Float32Array(256)),
          )
        : [];
    for (const [i, j] of matched) pairs.push({ old: gap.old[i], new: gap.new[j], whole: true });
    // The other side's caret goes before the next paired page (one matched
    // within the gap, or the one after it), or after the last one.
    const next = (side: 0 | 1, k: number): [number, number] | null => {
      const m = matched.find((pair) => pair[side] > k);
      return m ? [gap.old[m[0]], gap.new[m[1]]] : gap.after;
    };
    gap.old.forEach((p, i) => {
      if (matched.some(([k]) => k === i)) return;
      const at = next(0, i);
      pageChanges.push(wholePage('removed', result, p, sigOld[i]?.ink, at ?? gap.before, !at));
    });
    gap.new.forEach((p, j) => {
      if (matched.some(([, k]) => k === j)) return;
      const at = next(1, j);
      pageChanges.push(wholePage('added', result, p, sigNew[j]?.ink, at ?? gap.before, !at));
    });
  }
  pairs.sort((a, b) => a.new - b.new || a.old - b.old);

  const cacheOld = new Map<number, Promise<Raster>>();
  const cacheNew = new Map<number, Promise<Raster>>();
  const found: Change[] = [];
  const sizes = new Map<string, { pair: VisualPair; count: number }>();
  for (let k = 0; k < pairs.length; k++) {
    const pair = pairs[k];
    const { old: op, new: np } = pair;
    const a = docs.old.pages[op];
    const b = docs.new.pages[np];
    if (pair.whole && (Math.abs(a.width - b.width) > 1 || Math.abs(a.height - b.height) > 1)) {
      const key = `${Math.round(a.width)}x${Math.round(a.height)}:${Math.round(b.width)}x${Math.round(b.height)}`;
      const cur = sizes.get(key);
      if (cur) cur.count++;
      else sizes.set(key, { pair, count: 1 });
    }
    if (large('old', op) || large('new', np)) {
      if (large('old', op)) skipped.old.add(op);
      if (large('new', np)) skipped.new.add(np);
    } else {
      if (!cacheOld.has(op)) cacheOld.set(op, renderOld(op));
      if (!cacheNew.has(np)) cacheNew.set(np, renderNew(np));
      try {
        const [ra, rb] = await Promise.all([cacheOld.get(op)!, cacheNew.get(np)!]);
        found.push(...compareRasters(result, op, np, ra, rb, { whole: pair.whole }));
        // A page without text compared as an image with a page chosen by
        // position and look: shown in the page map and the notices.
        const textless = result.coverage?.old.textless.includes(op) || result.coverage?.new.textless.includes(np);
        if (textless && !result.pageLinks.some((l) => l.oldPage === op && l.newPage === np && (l.manual || l.weight >= 3)))
          result.pageLinks.push({ oldPage: op, newPage: np, weight: 0, image: true });
      } catch {
        skipped.old.add(op);
        skipped.new.add(np);
      }
    }
    const rest = pairs.slice(k + 1);
    for (const p of [...cacheOld.keys()]) if (!rest.some((r) => r.old === p)) cacheOld.delete(p);
    for (const p of [...cacheNew.keys()]) if (!rest.some((r) => r.new === p)) cacheNew.delete(p);
    onProgress?.(k + 1, pairs.length);
  }
  // A graphic found on one side of a page pair only may have gone to the
  // next or previous page with the text next to it (a figure pushed onto the
  // next page by added text). If it reappears unchanged on another page
  // paired with the same page, it moved; it was not added or removed.
  const pushed = new Set<Change>();
  const again = { old: new Map<number, Promise<Raster>>(), new: new Map<number, Promise<Raster>>() };
  for (const c of found) {
    if (c.minor || c.kind !== 'graphic' || c.format || c.pageChange || !c.old.rects.length === !c.new.rects.length) continue;
    const at = foundOnPair(c);
    if (!at) continue;
    const side = c.old.rects.length ? 'old' : 'new';
    const others = pairs.filter((p) => (side === 'old' ? p.old === at[0] && p.new !== at[1] : p.new === at[1] && p.old !== at[0]) && !large('old', p.old) && !large('new', p.new));
    // Keep only the pages this change needs.
    for (const s of ['old', 'new'] as const) for (const pg of [...again[s].keys()]) if (!others.some((p) => p[s] === pg)) again[s].delete(pg);
    for (const p of others) {
      try {
        for (const s of ['old', 'new'] as const) if (!again[s].has(p[s])) again[s].set(p[s], render[s](p[s]));
        const [ra, rb] = await Promise.all([again.old.get(p.old)!, again.new.get(p.new)!]);
        if (c[side].rects.every((r) => reappears(result, p.old, p.new, ra, rb, side, r.rect))) {
          pushed.add(c);
          break;
        }
      } catch {
        // Not compared again: the change stays.
      }
    }
  }
  // Removed from one page and added to a neighbouring one with the same
  // look (a figure that a new page size put on the next page): it moved.
  const oneSided = (c: Change, side: 'old' | 'new') =>
    !pushed.has(c) && !c.minor && c.kind === 'graphic' && !c.format && !c.pageChange && c[side].rects.length > 0 && !c[side === 'old' ? 'new' : 'old'].rects.length;
  const removed = found.filter((c) => oneSided(c, 'old'));
  const added = found.filter((c) => oneSided(c, 'new'));
  for (const r of removed) {
    const ro = foundOnPair(r);
    if (!ro) continue;
    const o = unionRect(r.old.rects.map((x) => x.rect));
    for (const a of added) {
      const an = foundOnPair(a);
      if (!an || pushed.has(a) || Math.abs(an[0] - ro[0]) > 1 || Math.abs(an[1] - ro[1]) > 1 || large('old', ro[0]) || large('new', an[1])) continue;
      for (const s of ['old', 'new'] as const) for (const pg of [...again[s].keys()]) if (pg !== (s === 'old' ? ro[0] : an[1])) again[s].delete(pg);
      try {
        if (!again.old.has(ro[0])) again.old.set(ro[0], render.old(ro[0]));
        if (!again.new.has(an[1])) again.new.set(an[1], render.new(an[1]));
        const [ra, rb] = await Promise.all([again.old.get(ro[0])!, again.new.get(an[1])!]);
        if (sameGraphic(result, ro[0], an[1], ra, rb, o, unionRect(a.new.rects.map((x) => x.rect)))) {
          pushed.add(r).add(a);
          break;
        }
      } catch {
        // Not compared: both changes stay.
      }
    }
  }
  again.old.clear();
  again.new.clear();
  if (pushed.size) found.splice(0, found.length, ...found.filter((c) => !pushed.has(c)));
  // A change of page size or orientation, once per kind of change.
  for (const { pair, count } of sizes.values()) {
    const c = wholePage('resized', result, pair.new, undefined, [pair.old, pair.new], false);
    if (count > 1) c.places = count;
    pageChanges.push(c);
  }
  const visual = [...dedupeGraphics(found.filter((c) => !c.minor)), ...pageChanges];
  const shifts = found.filter((c) => c.minor);
  result.minor = [...result.minor.filter((c) => c.consequence), ...shifts].sort((a, b) => a.order - b.order);
  result.minor.forEach((c, k) => (c.id = 'm' + (k + 1)));
  result.ignored.minorShifts = shifts.length;
  for (const side of ['old', 'new'] as const) {
    if (skipped[side].size && result.coverage?.[side]) result.coverage[side].visualSkipped = [...skipped[side]].sort((x, y) => x - y);
  }
  result.changes.push(...visual);
  sortAndNumber(result.changes);
  return visual;
}

/**
 * A change that concerns a whole page: a page without text that has no
 * counterpart (added / removed), or a page whose size changed (resized; `p`
 * is then the new page and `near` the pair). `near` is a paired page next to
 * the added or removed one, where the other side shows a caret; `after`
 * means the page comes after that pair.
 */
function wholePage(what: 'added' | 'removed' | 'resized', result: CompareResult, p: number, ink: Rect | null | undefined, near: [number, number] | null, after: boolean): Change {
  const pageRect = (doc: DocModel, page: number): Rect => ({ x: 0, y: 0, w: doc.pages[page].width, h: doc.pages[page].height });
  const full = (doc: DocModel, page: number): Side => ({ pages: [page], rects: [{ page, rect: ink ?? pageRect(doc, page) }], text: '' });
  const caret = (doc: DocModel, page: number | undefined): Side => {
    if (page === undefined || !doc.pages[page]) return { pages: [], rects: [], text: '' };
    const h = doc.pages[page].height;
    return { pages: [], rects: [], text: '', caret: { page, x: 36, y: after ? h - 30 : 12, h: 18 } };
  };
  let old: Side;
  let nw: Side;
  if (what === 'resized') {
    old = { pages: [near![0]], rects: [{ page: near![0], rect: pageRect(result.oldDoc, near![0]) }], text: '' };
    nw = { pages: [p], rects: [{ page: p, rect: pageRect(result.newDoc, p) }], text: '' };
  } else if (what === 'added') {
    old = caret(result.oldDoc, near?.[0]);
    nw = full(result.newDoc, p);
  } else {
    old = full(result.oldDoc, p);
    nw = caret(result.newDoc, near?.[1]);
  }
  const order = what === 'removed' ? (near ? near[1] + (after ? 0.99 : 0) : 0) * 100000 : p * 100000;
  return { id: '', kind: 'graphic', category: 'visual', old, new: nw, pageChange: what, size: 0, cjk: false, contextBefore: '', contextAfter: '', order };
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
