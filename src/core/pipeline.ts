import type { Change, CompareResult, DocModel, Rect, Side } from './types.ts';
import { sortAndNumber } from './compare.ts';
import { expand, intersects, union as unionRect } from './geometry.ts';
import {
  alignPages,
  compareRasters,
  dedupeGraphics,
  foundOnPair,
  furnitureMark,
  pageGraphics,
  pageSignature,
  planVisual,
  reappears,
  repeatedRows,
  rowCopies,
  rowDiffers,
  rowFolds,
  listRow,
  pageTurn,
  sameGraphic,
  tooLargeToCompare,
  type Raster,
  type RepeatedRow,
  type RowCopy,
  type VisualPair,
} from './visual.ts';

export type RenderFn = (page: number) => Promise<Raster>;

/** The header and footer differences found as text, per result (see addVisualChanges). */
const furnitureText = new WeakMap<CompareResult, number>();

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
  // Header and footer differences found as text, before this stage added
  // the ones it finds in their look (an earlier run on this result).
  const textFurniture = furnitureText.get(result) ?? result.ignored.furniture;
  furnitureText.set(result, textFurniture);
  // Regions shown with repeated header rows by an earlier run on this result.
  rowFolds(result).splice(0);
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
    // A page turned to another orientation (/Rotate) is a page change too,
    // also when its size stays (turned upside down).
    const turn = pageTurn(result, op, np);
    if (pair.whole && (Math.abs(a.width - b.width) > 1 || Math.abs(a.height - b.height) > 1 || turn)) {
      const key = `${Math.round(a.width)}x${Math.round(a.height)}:${Math.round(b.width)}x${Math.round(b.height)}:${turn?.deg ?? 0}`;
      const cur = sizes.get(key);
      if (cur) cur.count++;
      else sizes.set(key, { pair, count: 1 });
    }
    // Text that runs another way on the new page, without a turn that maps
    // one page onto the other (see pageTurn): the graphics cannot be laid
    // over each other, and the pages are named as not compared.
    const unturned = !turn && (a.textAngle ?? 0) !== (b.textAngle ?? 0);
    if (large('old', op) || large('new', np) || unturned) {
      if (large('old', op) || unturned) skipped.old.add(op);
      if (large('new', np) || unturned) skipped.new.add(np);
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
  // A header row repeated at a moved page top, and what was shown with it,
  // belongs to that consequence only if it looks like another copy of the
  // row (see rowCopies); what no copy shows (a stamp, a tint or a highlight
  // put on this copy) is a graphic change of its own. A row without a copy
  // that can be rendered gets the regions shown with it listed.
  const pages = { old: new Map<number, Promise<Raster>>(), new: new Map<number, Promise<Raster>>() };
  const page = (side: 'old' | 'new', p: number) => {
    let r = pages[side].get(p);
    if (!r) {
      // Keep at most a few pages.
      while (pages[side].size >= 4) pages[side].delete(pages[side].keys().next().value!);
      pages[side].set(p, (r = render[side](p)));
    }
    return r;
  };
  // The row is compared with its copies together with what was found
  // differing around it (its fill and the rules along it), so that a rule
  // under one copy recoloured or taken off is seen as well.
  const listed: { row: RepeatedRow; copy: RowCopy | null; rect: Rect | null; change: Change }[] = [];
  for (const row of repeatedRows(result)) {
    if (large(row.side, row.page)) continue;
    const around = rowFolds(result).filter((f) => f.change === row.change && f.side === row.side && f.page === row.page && intersects(f.rect, row.band));
    const region = unionRect([row.rect, ...around.map((f) => f.rect)]);
    // For each look (see rowDiffers), whether every copy that tells differs,
    // and where the first one does. A copy alike in every look ends it.
    const looks = { marks: { all: true, at: null as Rect | null, by: null as RowCopy | null, n: 0 }, fill: { all: true, at: null as Rect | null, by: null as RowCopy | null, n: 0 }, rules: { all: true, at: null as Rect | null, by: null as RowCopy | null, n: 0 } };
    let compared = false;
    const copies = rowCopies(result, row);
    for (const copy of copies) {
      if (large(copy.side, copy.page)) continue;
      try {
        const [r, rc] = await Promise.all([page(row.side, row.page), page(copy.side, copy.page)]);
        const d = rowDiffers(result, row, r, copy, rc, region);
        compared = true;
        for (const k of ['marks', 'fill', 'rules'] as const) {
          const v = d[k];
          if (v === undefined) continue;
          const l = looks[k];
          l.n++;
          if (!v) l.all = false;
          else if (!l.at) [l.at, l.by] = [v, copy];
        }
        // Fill and rules are told by copies at the same place only.
        if (!looks.marks.all && ((!looks.fill.all && !looks.rules.all) || !copies.some((c) => Math.abs(c.dy) <= 2))) break;
      } catch {
        // Not rendered: the next copy is tried.
      }
    }
    const differs = (['marks', 'fill', 'rules'] as const).map((k) => looks[k]).find((l) => l.n > 0 && l.all);
    if (compared && !differs) continue;
    const rect = differs?.at ?? null;
    const first = differs?.by ?? null;
    const c = listRow(result, row, compared ? rect : null);
    if (c) listed.push({ row, copy: first, rect, change: c });
  }
  // A copy that differs from the other version's copy at the same place
  // of the page, which differs back at the same spot, is one edit seen from
  // both sides (a tick put on the new copy, which the old copy lacks): one
  // change with both places.
  const shownRows = new Set<Change>();
  const into = new Set<Change>();
  for (const x of listed) {
    const k = x.copy;
    if (into.has(x.change) || !k || !x.rect || k.side === x.row.side || Math.abs(k.dy) > 2) continue;
    const y = listed.find(
      (y) => y !== x && !into.has(y.change) && y.row.side === k.side && y.row.page === k.page && !!y.rect && intersects(expand(x.rect!, 4), { ...y.rect, x: y.rect.x - k.dx, y: y.rect.y - k.dy }),
    );
    if (!y) continue;
    const s = y.row.side;
    x.change[s].rects.push(...y.change[s].rects);
    x.change[s].pages = [...new Set(x.change[s].rects.map((q) => q.page))].sort((a, b) => a - b);
    into.add(y.change);
  }
  for (const x of listed) {
    if (into.has(x.change)) continue;
    found.push(x.change);
    shownRows.add(x.change);
  }
  pages.old.clear();
  pages.new.clear();
  // A graphic found on one side of a page pair only may have gone to the
  // next or previous page with the text next to it (a figure pushed onto the
  // next page by added text). If it reappears unchanged on another page
  // paired with the same page, it moved; it was not added or removed.
  const pushed = new Set<Change>();
  const again = { old: new Map<number, Promise<Raster>>(), new: new Map<number, Promise<Raster>>() };
  // A repeated header row that looks unlike every copy of it (see
  // rowDiffers) was compared with those copies already: it is not taken
  // for a figure that moved.
  for (const c of found) {
    if (c.minor || c.kind !== 'graphic' || c.format || c.pageChange || shownRows.has(c) || !c.old.rects.length === !c.new.rects.length) continue;
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
    !pushed.has(c) && !shownRows.has(c) && !c.minor && c.kind === 'graphic' && !c.format && !c.pageChange && c[side].rects.length > 0 && !c[side === 'old' ? 'new' : 'old'].rects.length;
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
  // A change of page size or orientation, once per kind of change. On a
  // page turned by /Rotate, the graphics are compared turned back (see
  // compareRasters), so what is found there is a change of its own.
  for (const { pair, count } of sizes.values()) {
    const c = wholePage('resized', result, pair.new, undefined, [pair.old, pair.new], false);
    const turn = pageTurn(result, pair.old, pair.new);
    if (turn) c.turned = turn.deg;
    if (count > 1) c.places = count;
    pageChanges.push(c);
  }
  // A line or a colour put on header or footer words: a difference in
  // them, which is ignored with the others and counted (shown on request).
  const marks = found.filter(furnitureMark);
  if (marks.length) found.splice(0, found.length, ...found.filter((c) => !furnitureMark(c)));
  result.ignored.furniture = textFurniture + marks.length;
  await graphicsOfUnpairedPages(result, pairs, render, large);
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
 * A page with text that no page of the other version corresponds to (an
 * inserted or a deleted page) is not compared visually, so its graphics are
 * not reported on their own. They belong to the page's text that was added
 * or deleted: their regions are added to the largest insertion (deletion)
 * on that page, so the reviewer sees the chart with its caption. Graphics
 * that the neighbouring pages have at the same place (the template) are
 * left out. A page without such a text change keeps its graphics unshown.
 */
async function graphicsOfUnpairedPages(
  result: CompareResult,
  pairs: VisualPair[],
  render: { old: RenderFn; new: RenderFn },
  large: (side: 'old' | 'new', p: number) => boolean,
): Promise<void> {
  for (const side of ['old', 'new'] as const) {
    const doc = side === 'old' ? result.oldDoc : result.newDoc;
    const textless = new Set(result.coverage?.[side].textless ?? []);
    const kind = side === 'old' ? 'delete' : 'insert';
    for (let p = 0; p < doc.pages.length; p++) {
      if (textless.has(p) || large(side, p) || pairs.some((x) => x[side] === p)) continue;
      const onPage = (c: Change) => c[side].rects.filter((r) => r.page === p).length;
      const host = result.changes.filter((c) => c.kind === kind && onPage(c) > 0).sort((a, b) => onPage(b) - onPage(a))[0];
      if (!host) continue;
      try {
        const neighbours = [];
        for (const q of [p - 1, p + 1]) if (q >= 0 && q < doc.pages.length && !large(side, q)) neighbours.push({ page: q, r: await render[side](q) });
        for (const rect of pageGraphics(doc, p, await render[side](p), neighbours)) host[side].rects.push({ page: p, rect });
      } catch {
        // Not rendered: the page's text change stays as it is.
      }
    }
  }
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
  const change: Change = { id: '', kind: 'graphic', category: 'visual', old, new: nw, pageChange: what, size: 0, cjk: false, contextBefore: '', contextAfter: '', order };
  // Rendered, and nothing on it: a blank page (an extra page break), not one with images or drawings.
  if (what !== 'resized' && ink === null) change.blankPage = true;
  return change;
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
