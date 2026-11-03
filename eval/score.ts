// Scoring rules of the evaluation (see eval/run.ts for the rules in words).
// Kept apart from run.ts so that the rules can be tested on their own
// (test/eval.test.ts).
import { joinTokens } from '../src/core/tokenize.ts';
import { compareDocs } from '../src/core/compare.ts';
import type { Change, CompareResult, DocModel, Rect } from '../src/core/types.ts';

export const TYPES = ['number', 'replace', 'insert', 'delete', 'move', 'format', 'graphic', 'position', 'overflow', 'furniture'] as const;
export type TruthType = (typeof TYPES)[number];
export type Box = [number, number, number, number];

export interface Truth {
  type: TruthType;
  old?: string;
  new?: string;
  oldPage?: number | number[];
  newPage?: number | number[];
  /** Region [x, y, w, h] in PDF points (top-left origin) on oldPage / newPage. */
  oldRect?: Box;
  newRect?: Box;
  /** How many reported items this truth item may explain (default 1). */
  maxItems?: number;
  /** Why a case-specific decision was made (not read by the scorer). */
  note?: string;
}
export interface CaseMeta {
  description: string;
  set?: string;
  blind?: boolean;
  truth: Truth[];
}
export interface Item {
  oldText: string;
  newText: string;
  oldPages: number[]; // 1-based
  newPages: number[];
  change?: Change;
}
export interface Score {
  found: number;
  located: number;
  separate: number;
  total: number;
  extra: number;
  items: number;
  ms: number;
}
export interface Miss {
  truth: number;
  text: string;
  why: 'not found' | 'wrong page' | 'not a separate item';
}

export const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
export const asList = (p?: number | number[]) => (p === undefined ? [] : Array.isArray(p) ? p : [p]);
const label = (t: Truth) => `${t.type}${t.old !== undefined ? ` "${t.old}"` : ''}${t.new !== undefined ? ` → "${t.new}"` : ''}`;

// ------------------------------------------------------------ truth files --

/** Reject truth items that the scorer could not check strictly. */
export function validate(id: string, truth: Truth[]): void {
  truth.forEach((t, k) => {
    const where = `${id}: truth #${k + 1} (${label(t)})`;
    if (!TYPES.includes(t.type)) throw new Error(`${where}: unknown type`);
    if ('many' in t) throw new Error(`${where}: "many" was replaced by "maxItems" (how many reported items it may explain)`);
    if (t.old === '' || t.new === '') throw new Error(`${where}: empty text; leave that side out instead`);
    if (t.maxItems !== undefined && !(Number.isInteger(t.maxItems) && t.maxItems >= 1)) throw new Error(`${where}: maxItems must be a positive integer`);
    if (t.type === 'insert' && (t.new === undefined || t.old !== undefined)) throw new Error(`${where}: an insert has new text only`);
    if (t.type === 'delete' && (t.old === undefined || t.new !== undefined)) throw new Error(`${where}: a delete has old text only`);
    if (['replace', 'number', 'furniture'].includes(t.type) && (t.old === undefined || t.new === undefined)) throw new Error(`${where}: needs old and new text`);
    if (t.old === undefined && t.new === undefined && !t.oldRect && !t.newRect) throw new Error(`${where}: an item without text needs a region (oldRect/newRect)`);
    for (const side of ['old', 'new'] as const) {
      const rect = t[`${side}Rect`];
      if (rect && (rect.length !== 4 || asList(t[`${side}Page`]).length !== 1)) throw new Error(`${where}: ${side}Rect needs [x, y, w, h] and a single ${side}Page`);
    }
  });
}

export function pagesWith(doc: DocModel, snippet: string): number[] {
  const out: number[] = [];
  for (const pg of doc.pages) {
    const text = norm(joinTokens(doc.tokens.filter((t) => t.page === pg.index && !t.furniture)));
    if (text.includes(norm(snippet))) out.push(pg.index + 1);
  }
  return out;
}

/** Expected 1-based pages per side; derived only when the snippet sits on exactly one page. */
export function expectedPages(id: string, t: Truth, a: DocModel, b: DocModel) {
  const side = (s: 'old' | 'new', doc: DocModel): number[] => {
    const explicit = t[`${s}Page`];
    if (explicit !== undefined) return asList(explicit);
    // Running headers and footers sit on every page.
    if (t.type === 'furniture') return doc.pages.map((p) => p.index + 1);
    const snippet = t[s];
    if (snippet === undefined) return [];
    const found = pagesWith(doc, snippet);
    if (found.length !== 1) throw new Error(`${id}: "${snippet}" is on ${found.length ? `pages ${found.join(', ')}` : 'no page'} of the ${s} file; give ${s}Page explicitly`);
    return found;
  };
  return { old: side('old', a), new: side('new', b) };
}

// ------------------------------------------------------------- ChangeLens --

export function typeOk(t: Truth, c: Change): boolean {
  switch (t.type) {
    case 'number':
      return !!c.numeric;
    case 'move':
    case 'insert':
    case 'delete':
    case 'replace':
      return c.kind === t.type;
    case 'format':
      return c.kind === 'format' || (c.kind === 'graphic' && !!c.format);
    case 'graphic':
      return c.kind === 'graphic';
    case 'position':
      return c.kind === 'position';
    case 'overflow':
      return c.kind === 'overflow';
    case 'furniture':
      // Reported as a change; otherwise it may still be disclosed (see evalCase).
      return c.category === 'text' && c.kind !== 'move';
  }
}

export function changeItem(c: Change): Item {
  const pages = (s: Change['old']) => (s.pages.length ? s.pages : s.caret ? [s.caret.page] : []).map((p) => p + 1);
  return { oldText: c.old.text, newText: c.new.text, oldPages: pages(c.old), newPages: pages(c.new), change: c };
}

const overlaps = (r: Rect, [x, y, w, h]: Box) => r.x < x + w && x < r.x + r.w && r.y < y + h && y < r.y + r.h;

/** The change touches the truth item's region(s), when given. */
export function regionOk(t: Truth, c: Change): boolean {
  for (const side of ['old', 'new'] as const) {
    const rect = t[`${side}Rect`];
    const page = asList(t[`${side}Page`])[0] - 1;
    if (rect && !c[side].rects.some((r) => r.page === page && overlaps(r.rect, rect))) return false;
  }
  return true;
}

/** A truth item without text is matched by place: its page(s), where the change has that side, and its region. */
export function placeOk(t: Truth, it: Item): boolean {
  for (const side of ['old', 'new'] as const) {
    const want = asList(t[`${side}Page`]);
    const pages = side === 'old' ? it.oldPages : it.newPages;
    if (want.length && pages.length && !pages.some((p) => want.includes(p))) return false;
  }
  return regionOk(t, it.change!);
}

// ---------------------------------------------------------------- scoring --

/**
 * Largest assignment of items to truth items (augmenting paths): truth item t
 * takes at most cap[t] items, each item goes to at most one truth item.
 * Returns the owner of each item (-1: unassigned).
 */
export function assign(edges: boolean[][], cap: number[], nItems: number): number[] {
  const owner: number[] = new Array(nItems).fill(-1);
  const augment = (u: number, seen: Uint8Array): boolean => {
    for (let i = 0; i < nItems; i++) {
      if (!edges[u][i] || seen[i]) continue;
      seen[i] = 1;
      if (owner[i] === -1 || augment(owner[i], seen)) {
        owner[i] = u;
        return true;
      }
    }
    return false;
  };
  edges.forEach((_, t) => {
    for (let k = 0; k < cap[t] && augment(t, new Uint8Array(nItems)); k++);
  });
  return owner;
}

export interface Scored extends Omit<Score, 'ms'> {
  misses: Miss[];
}

export function score(id: string, truth: Truth[], items: Item[], a: DocModel, b: DocModel, match: (t: Truth, it: Item) => boolean, disclosed: (t: Truth) => boolean = () => false): Scored {
  const exp = truth.map((t) => expectedPages(id, t, a, b));
  const edges = truth.map((t) => items.map((it) => match(t, it)));
  // A side without pages (e.g. the old side of an added graphic) is not checked.
  const pageOk = (k: number, it: Item) =>
    (exp[k].new.length === 0 || it.newPages.length === 0 || it.newPages.some((p) => exp[k].new.includes(p))) &&
    (exp[k].old.length === 0 || it.oldPages.length === 0 || it.oldPages.some((p) => exp[k].old.includes(p))) &&
    (it.newPages.length > 0 || it.oldPages.length > 0);
  // Not reported, but disclosed as an ignored difference (headers/footers).
  const isDisclosed = truth.map((t, k) => !edges[k].some(Boolean) && disclosed(t));
  // One-to-one: each truth item needs an item of its own.
  const own = assign(edges, truth.map(() => 1), items.length);
  // Items explained by the truth (up to maxItems each); the rest is noise.
  const explained = assign(edges, truth.map((t) => t.maxItems ?? 1), items.length).filter((o) => o >= 0).length;
  let found = 0;
  let located = 0;
  let separate = 0;
  const misses: Miss[] = [];
  truth.forEach((t, k) => {
    const miss = (why: Miss['why']) => misses.push({ truth: k + 1, text: label(t), why });
    if (isDisclosed[k]) {
      found++;
      located++;
      separate++;
      return;
    }
    if (!edges[k].some(Boolean)) return miss('not found');
    found++;
    if (items.some((it, i) => edges[k][i] && pageOk(k, it))) located++;
    else miss('wrong page');
    if (own.includes(k)) separate++;
    else miss('not a separate item');
  });
  return { found, located, separate, total: truth.length, extra: items.length - explained, items: items.length, misses };
}

export const textMatch = (t: Truth, it: Item) =>
  (t.old === undefined || norm(it.oldText).includes(norm(t.old))) && (t.new === undefined || norm(it.newText).includes(norm(t.new))) && (t.old !== undefined || t.new !== undefined);

/** ChangeLens: compatible type, then text (and region, if given) or, without text, page and region. */
export function changeLensMatch(t: Truth, it: Item): boolean {
  if (!typeOk(t, it.change!)) return false;
  if (t.old === undefined && t.new === undefined) return placeOk(t, it);
  return textMatch(t, it) && regionOk(t, it.change!);
}

/**
 * A header/footer truth item that is not reported as a change still counts
 * when it is disclosed: the result says header/footer differences were
 * ignored, and comparing with headers and footers included shows this very
 * difference (not just, say, a changed page count in the footer).
 */
export function furnitureDisclosure(r: CompareResult, a: DocModel, b: DocModel): (t: Truth) => boolean {
  let withFurniture: Change[] | null = null;
  return (t) => {
    if (t.type !== 'furniture' || r.ignored.furniture === 0) return false;
    withFurniture ??= compareDocs(a, b, { ...r.options, ignoreFurniture: false }).changes;
    return withFurniture.some((c) => c.category === 'text' && textMatch(t, changeItem(c)));
  };
}
