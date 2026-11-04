// Scoring rules of the evaluation (see eval/run.ts for the rules in words).
// Kept apart from run.ts so that the rules can be tested on their own
// (test/eval.test.ts).
import { joinTokens } from '../src/core/tokenize.ts';
import { compareDocs } from '../src/core/compare.ts';
import { intern, matchSequences, opsFromMatches } from '../src/core/diff.ts';
import { kindLabel } from '../src/core/describe.ts';
import { t as msg } from '../src/core/i18n.ts';
import { shownExcerpt } from '../src/core/report.ts';
import type { Change, CompareResult, DocModel, Rect, Side } from '../src/core/types.ts';

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
  /**
   * What the reader sees with the reported text: the context before and
   * after it, and the text itself as shown (ChangeLens: the excerpt in the
   * report and the web list; text line diff: the lines next to the hunk).
   */
  shown?: { before: string; old: string; new: string; after: string };
}
/**
 * How a truth snippet is matched against a reported text.
 *  - strict:  the reported text contains the snippet (the rule of the
 *             recorded blind runs, rounds 1–3).
 *  - context: or the reported text lies inside the snippet, and the snippet
 *             lies inside what the reader sees (context before + reported
 *             text + context after) at a place that covers the reported text.
 */
export type SnippetRule = 'strict' | 'context';
/**
 * The rules a run is scored with. Each was added after a blind round had
 * been run and recorded, and the earlier rules stay available: a recorded
 * run is reproduced only with the rules it was scored under.
 */
export interface Rules {
  snippets: SnippetRule;
  /** Whether a caret at a page boundary also counts for the page across the boundary (see caretPages). */
  boundaryCarets: boolean;
  /**
   * The rules decided after blind round 4 (none was registered for that
   * round; see eval/results-holdout4-analysis.md for the cases behind them):
   *  - one-sided regions (regionOk): a side where the change has no region
   *    (the old side of an addition, the new side of a deletion: no rect,
   *    at most a caret) is not checked against the truth's rect on that
   *    side; the side it has must overlap its rect;
   *  - part of a replace (partReplaced): a replace truth whose new text is
   *    its old text with something inserted (每年 → 每半年) is met by an
   *    insertion of that something at that place; a deletion likewise. It
   *    reads the context, so it needs the context snippet rule;
   *  - overflow by region (changeLensMatch): an overflow truth that gives a
   *    region is matched by page and region, not by its text;
   *  - header/footer lines (furnitureLinesDisclosed): a header/footer truth
   *    that is not reported counts as disclosed when its texts lie in
   *    header/footer lines that differ, as the notice counts them, not only
   *    when one hunk of a comparison with headers and footers holds them.
   */
  afterRound4: boolean;
}
/** The default rules. */
export const CURRENT_RULES: Rules = { snippets: 'context', boundaryCarets: true, afterRound4: true };
/** As registered for blind round 4 before its run (b5cee6f; engine frozen at 6cd041b): run.ts --registered-rules. */
export const REGISTERED_ROUND4_RULES: Rules = { snippets: 'context', boundaryCarets: true, afterRound4: false };
/** The rules of the recorded blind runs of rounds 1–3: run.ts --strict-snippets --strict-carets. */
export const STRICT_RULES: Rules = { snippets: 'strict', boundaryCarets: false, afterRound4: false };
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
      // Whatever is labelled Format in the UI: text formatting, and colour,
      // weight, strikethrough or underline found visually (kind 'graphic').
      return kindLabel('en', c) === msg('en', 'kind_format');
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

/**
 * A reported change as an item to score. With the documents, a caret at a
 * page boundary also stands for the page on the other side of the boundary
 * (see caretPages); without them, a caret counts only on its own page.
 */
export function changeItem(c: Change, a?: DocModel, b?: DocModel): Item {
  // A side without text has a caret (its `pages` holds the caret's page).
  const pages = (s: Side, doc?: DocModel) => (s.caret && !s.text ? (doc ? caretPages(s.caret, doc) : [s.caret.page]) : s.pages).map((p) => p + 1);
  return { oldText: c.old.text, newText: c.new.text, oldPages: pages(c.old, a), newPages: pages(c.new, b), change: c, shown: shownExcerpt(c) };
}

/**
 * Pages (0-based) an insertion point stands for. A caret is a position in
 * the reading order: one right before the first body text of page p is also
 * right after the last body text of page p − 1, and one right after the last
 * body text of page p is also right before the first body text of page p + 1.
 * Which of the two pages it is drawn on is a display choice (the engine puts
 * it on the next page when whole paragraphs are inserted). A caret anywhere
 * else on a page stands for that page only.
 */
export function caretPages(caret: NonNullable<Side['caret']>, doc: DocModel): number[] {
  const p = caret.page;
  const body = doc.tokens.filter((t) => t.page === p && !t.furniture);
  const at = (x: number, y: number) => Math.abs(x - caret.x) < 0.5 && Math.abs(y - caret.y) < 0.5;
  const first = body[0]?.rects[0];
  const last = body[body.length - 1]?.rects.at(-1);
  const out = [p];
  if (p > 0 && first && at(first.x, first.y)) out.unshift(p - 1);
  if (p + 1 < doc.pages.length && last && at(last.x + last.w, last.y)) out.push(p + 1);
  return out;
}

const overlaps = (r: Rect, [x, y, w, h]: Box) => r.x < x + w && x < r.x + r.w && r.y < y + h && y < r.y + r.h;

/**
 * The change touches the truth item's region(s), when given.
 *
 * oneSided (a rule decided after round 4): a side where the change has no
 * region — the old side of an added stamp, signature or tick, the new side
 * of a deletion (no rect, at most a caret) — is not checked against the
 * truth's rect on that side, as pageOk and placeOk already skip a side
 * without pages. Truth authors give the same rect on both sides for "added
 * here" or "removed from here", and the side that exists must still
 * overlap its rect: a change with no rect on any side the truth gives a
 * rect for matches nothing. What it lets through: a one-sided report for a
 * truth that meant a change on both sides (an image added where one was
 * changed) — at the right place, but described as added or removed.
 */
export function regionOk(t: Truth, c: Change, oneSided = false): boolean {
  let given = 0;
  let checked = 0;
  for (const side of ['old', 'new'] as const) {
    const rect = t[`${side}Rect`];
    if (!rect) continue;
    given++;
    if (oneSided && c[side].rects.length === 0) continue;
    checked++;
    const page = asList(t[`${side}Page`])[0] - 1;
    if (!c[side].rects.some((r) => r.page === page && overlaps(r.rect, rect))) return false;
  }
  return given === 0 || checked > 0;
}

/** A truth item without text is matched by place: its page(s), where the change has that side, and its region. */
export function placeOk(t: Truth, it: Item, oneSided = false): boolean {
  for (const side of ['old', 'new'] as const) {
    const want = asList(t[`${side}Page`]);
    const pages = side === 'old' ? it.oldPages : it.newPages;
    if (want.length && pages.length && !pages.some((p) => want.includes(p))) return false;
  }
  return regionOk(t, it.change!, oneSided);
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

export type Pages = { old: number[]; new: number[] };
/** Whether a truth item that no reported item matches is disclosed (headers/footers), given its expected pages. */
export type Disclosed = (t: Truth, exp: Pages) => boolean;

export function score(id: string, truth: Truth[], items: Item[], a: DocModel, b: DocModel, match: (t: Truth, it: Item) => boolean, disclosed: Disclosed = () => false): Scored {
  return scoreAgainst(truth, items, truth.map((t) => expectedPages(id, t, a, b)), match, disclosed);
}

/** score() with the expected pages of each truth item given (e.g. from a recorded run). */
export function scoreAgainst(truth: Truth[], items: Item[], exp: Pages[], match: (t: Truth, it: Item) => boolean, disclosed: Disclosed = () => false): Scored {
  const edges = truth.map((t) => items.map((it) => match(t, it)));
  // A side without pages (e.g. the old side of an added graphic) is not checked.
  const pageOk = (k: number, it: Item) =>
    (exp[k].new.length === 0 || it.newPages.length === 0 || it.newPages.some((p) => exp[k].new.includes(p))) &&
    (exp[k].old.length === 0 || it.oldPages.length === 0 || it.oldPages.some((p) => exp[k].old.includes(p))) &&
    (it.newPages.length > 0 || it.oldPages.length > 0);
  // Not reported, but disclosed as an ignored difference (headers/footers).
  const isDisclosed = truth.map((t, k) => !edges[k].some(Boolean) && disclosed(t, exp[k]));
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

/**
 * The snippet lies inside before + text + after, at a place that covers the
 * whole of text. Between the context and the text a space may or may not be
 * shown (the excerpt always puts one; Chinese text and a closing bracket
 * have none). A snippet found only in the context, e.g. the same words next
 * to a neighbouring change, does not count.
 */
export function coversInContext(snippet: string, before: string, text: string, after: string): boolean {
  const [s, b, x, a] = [snippet, before, text, after].map(norm);
  if (!x || !s) return false;
  for (const gapB of b ? ['', ' '] : [''])
    for (const gapA of a ? ['', ' '] : ['']) {
      const v = b + gapB + x + gapA + a;
      const x0 = b.length + gapB.length;
      const x1 = x0 + x.length;
      for (let i = v.indexOf(s); i >= 0 && i <= x0; i = v.indexOf(s, i + 1)) if (i + s.length >= x1) return true;
    }
  return false;
}

/** One side of a truth item against the same side of a reported item (see SnippetRule). */
export function sideMatch(snippet: string, text: string, shown: { before: string; text: string; after: string } | undefined, rule: SnippetRule): boolean {
  if (norm(text).includes(norm(snippet))) return true;
  if (rule === 'strict' || !shown || !norm(text) || !norm(snippet).includes(norm(text))) return false;
  return coversInContext(snippet, shown.before, shown.text, shown.after);
}

export const textMatch = (t: Truth, it: Item, rule: SnippetRule = 'strict') => {
  const side = (s: 'old' | 'new') => {
    const snippet = t[s];
    if (snippet === undefined) return true;
    const shown = it.shown && { before: it.shown.before, text: it.shown[s], after: it.shown.after };
    return sideMatch(snippet, s === 'old' ? it.oldText : it.newText, shown, rule);
  };
  return (t.old !== undefined || t.new !== undefined) && side('old') && side('new');
};

/**
 * The snippet lies inside before + after at a place that covers the point
 * between them, where a reported insertion or deletion is (with or without
 * a space there, as in coversInContext).
 */
export function spansGap(snippet: string, before: string, after: string): boolean {
  const [s, b, a] = [snippet, before, after].map(norm);
  if (!s || (!b && !a)) return false;
  for (const gap of b && a ? ['', ' '] : ['']) {
    const v = b + gap + a;
    for (let i = v.indexOf(s); i >= 0 && i <= b.length; i = v.indexOf(s, i + 1)) if (i + s.length >= b.length + gap.length) return true;
  }
  return false;
}

/** `long` is `short` with one piece added somewhere (at the start, inside or at the end): 每年 → 每半年. */
export function oneInsertion(short: string, long: string): boolean {
  const [s, l] = [norm(short), norm(long)];
  if (!s || l.length <= s.length) return false;
  for (let k = 0; k <= s.length; k++) if (l.startsWith(s.slice(0, k)) && l.endsWith(s.slice(k))) return true;
  return false;
}

/**
 * Part of a replace (a rule decided after round 4). A replace truth whose
 * new text is its old text with something inserted (每年 → 每半年) is met
 * by an insertion of that something at that place: the inserted text with
 * the context around it shows the truth's new text, at a place that covers
 * the insertion, and the context alone (with the insertion point between
 * its two parts) shows the truth's old text. A deletion meets a replace
 * whose old text is its new text with something inserted, the same way.
 * Character-level comparison of Chinese and Japanese reports 每年 → 每半年
 * as "Added 半", and in English "every year" → "every half year" is "Added
 * half"; truth authors write such edits as a replace of the word. Both
 * texts must be shown around the reported point, so it cannot be met by
 * the same insertion elsewhere, or by one that also removed some of the
 * old text.
 */
export function partReplaced(t: Truth, it: Item): boolean {
  const c = it.change;
  const sh = it.shown;
  if (t.type !== 'replace' || t.old === undefined || t.new === undefined || !c || !sh) return false;
  if (c.kind === 'insert') return oneInsertion(t.old, t.new) && coversInContext(t.new, sh.before, sh.new, sh.after) && spansGap(t.old, sh.before, sh.after);
  if (c.kind === 'delete') return oneInsertion(t.new, t.old) && coversInContext(t.old, sh.before, sh.old, sh.after) && spansGap(t.new, sh.before, sh.after);
  return false;
}

export type MatchRules = Pick<Rules, 'snippets' | 'afterRound4'>;

/**
 * ChangeLens: compatible type, then text (and region, if given) or, without
 * text, page and region. With the rules decided after round 4 (see Rules):
 * one-sided regions, part of a replace, and overflow by region.
 */
export function changeLensMatch(t: Truth, it: Item, rules: MatchRules = CURRENT_RULES): boolean {
  const c = it.change!;
  const later = rules.afterRound4;
  if (later && rules.snippets === 'context' && t.type === 'replace' && (c.kind === 'insert' || c.kind === 'delete')) return partReplaced(t, it) && regionOk(t, c, true);
  if (!typeOk(t, c)) return false;
  if (t.old === undefined && t.new === undefined) return placeOk(t, it, later);
  // Overflow by region: content cut off at a page edge is partly missing
  // from the text layer of the cut version (PDF.js extracts only what lies
  // inside the crop box: "Budget (EU" of "Budget (EUR)"), while the truth
  // author writes the whole text, as pdftotext still extracts it. So an
  // overflow truth that gives a region is matched like a graphic, by page
  // and region; the text is not compared. It lets through an overflow item
  // about other text in that same region.
  if (later && t.type === 'overflow' && (t.oldRect || t.newRect)) return placeOk(t, it, true);
  return textMatch(t, it, rules.snippets) && regionOk(t, c, later);
}

/**
 * A header/footer truth item that is not reported as a change still counts
 * when it is disclosed: the result says header/footer differences were
 * ignored, and comparing with headers and footers included shows this very
 * difference (not just, say, a changed page count in the footer). The rule
 * registered for round 4: one change of that comparison holds the whole
 * truth text (strict snippets).
 */
export function furnitureDisclosure(r: CompareResult, a: DocModel, b: DocModel): Disclosed {
  let withFurniture: Change[] | null = null;
  return (t) => {
    if (t.type !== 'furniture' || r.ignored.furniture === 0) return false;
    withFurniture ??= compareDocs(a, b, { ...r.options, ignoreFurniture: false }).changes;
    return withFurniture.some((c) => c.category === 'text' && textMatch(t, changeItem(c)));
  };
}

/** A header/footer line: [page (1-based), text]. */
export type FurnitureLine = [number, string];
/** Header/footer lines that differ: the old and new lines between two unchanged ones. */
export interface FurnitureRun {
  old: FurnitureLine[];
  new: FurnitureLine[];
}

/**
 * The header/footer lines that differ between the versions, as the engine's
 * notice counts them (compare.ts furnitureDifferences: a line diff of the
 * furniture lines of the whole document; a changed line is counted once),
 * grouped into runs between unchanged lines. Empty when nothing was ignored.
 */
export function furnitureRuns(r: CompareResult, a: DocModel, b: DocModel): FurnitureRun[] {
  if (r.ignored.furniture === 0) return [];
  const la = a.lines.filter((l) => l.furniture);
  const lb = b.lines.filter((l) => l.furniture);
  const [ka, kb] = intern(la.map((l) => l.text), lb.map((l) => l.text));
  const runs: FurnitureRun[] = [];
  let cur: FurnitureRun | null = null;
  for (const o of opsFromMatches(matchSequences(ka, kb), la.length, lb.length)) {
    if (o.type === 'equal') {
      cur = null;
      continue;
    }
    if (!cur) runs.push((cur = { old: [], new: [] }));
    for (let i = o.a0; i < o.a1; i++) cur.old.push([la[i].page + 1, la[i].text]);
    for (let j = o.b0; j < o.b1; j++) cur.new.push([lb[j].page + 1, lb[j].text]);
  }
  return runs;
}

/**
 * Header/footer lines (a rule decided after round 4): a header/footer truth
 * item counts as disclosed when an old line on one of its old pages holds
 * its old text, and a new line on one of its new pages, in the same run of
 * differing lines, holds its new text, and the edit is in these lines: the
 * old line does not hold the new text already, or the new line no longer
 * holds the old text. Decided per line, as the notice counts: the
 * comparison with headers and footers included splits one footer edit into
 * hunks at an unchanged word ("3.1 → 3.2" and "Approved 14 May 2025 → Draft
 * …" around "·"), so no one hunk holds the truth text. Still strict: the
 * texts must lie in lines that differ, so neither an unchanged header nor a
 * line where only the page count changed discloses an edit.
 */
export function furnitureLinesDisclosed(t: Truth, exp: Pages, runs: FurnitureRun[]): boolean {
  if (t.type !== 'furniture' || t.old === undefined || t.new === undefined) return false;
  const [o, n] = [norm(t.old), norm(t.new)];
  return runs.some((run) =>
    run.old.some(([p, lo]) => {
      if (!exp.old.includes(p) || !norm(lo).includes(o)) return false;
      return run.new.some(([q, ln]) => exp.new.includes(q) && norm(ln).includes(n) && (!norm(lo).includes(n) || !norm(ln).includes(o)));
    }),
  );
}

/** The disclosure rule of the given rules (see furnitureDisclosure and furnitureLinesDisclosed). */
export function disclosureUnder(rules: Pick<Rules, 'afterRound4'>, r: CompareResult, a: DocModel, b: DocModel): Disclosed {
  if (!rules.afterRound4) return furnitureDisclosure(r, a, b);
  let runs: FurnitureRun[] | null = null;
  return (t, exp) => t.type === 'furniture' && furnitureLinesDisclosed(t, exp, (runs ??= furnitureRuns(r, a, b)));
}

// ---------------------------------------------------------- recorded runs --

/**
 * ChangeLens items of one case as reported in a run, with what the scorer
 * needs and nothing else, so that a recorded run (e.g. the single blind run
 * of a held-out round) can be scored again under other rules without the
 * engine, which has changed since.
 */
export interface RecordedSide {
  text: string;
  /** 1-based; a caret counts on its own page. */
  pages: number[];
  /** The pages when a caret at a page boundary also counts for the page across it (only when they differ). */
  boundary?: number[];
  /** [page (0-based), x, y, w, h], rounded to 0.1 pt. */
  rects: [number, number, number, number, number][];
}
export interface RecordedItem extends Pick<Change, 'kind' | 'category' | 'format' | 'minor' | 'moveEdits' | 'contextBefore' | 'contextAfter'> {
  numeric?: true;
  old: RecordedSide;
  new: RecordedSide;
}
export interface RecordedCase {
  /** Expected 1-based pages of each truth item. */
  exp: Pages[];
  /** Whether each truth item was disclosed (headers/footers) under the rule registered for round 4 (furnitureDisclosure). */
  disclosed: boolean[];
  /**
   * The header/footer lines that differ (furnitureRuns), for the rule
   * decided after round 4 (furnitureLinesDisclosed). Recorded since that
   * rule; added afterwards to the recordings of rounds 3 and 4, computed
   * with the engine of each run (test/fixtures/holdout{3,4}-recorded-items.json).
   */
  furniture?: FurnitureRun[];
  items: RecordedItem[];
}

export function recordCase(id: string, truth: Truth[], changes: Change[], a: DocModel, b: DocModel, disclosed: Disclosed, furniture: FurnitureRun[]): RecordedCase {
  const r1 = (v: number) => Math.round(v * 10) / 10;
  const items = changes.map((c): RecordedItem => {
    const own = changeItem(c);
    const wide = changeItem(c, a, b);
    const side = (s: 'old' | 'new'): RecordedSide => {
      const pages = s === 'old' ? own.oldPages : own.newPages;
      const boundary = s === 'old' ? wide.oldPages : wide.newPages;
      return {
        text: c[s].text,
        pages,
        ...(boundary.join() !== pages.join() ? { boundary } : {}),
        rects: c[s].rects.map(({ page, rect: { x, y, w, h } }) => [page, r1(x), r1(y), r1(w), r1(h)]),
      };
    };
    return {
      kind: c.kind,
      category: c.category,
      ...(c.numeric ? { numeric: true as const } : {}),
      ...(c.format ? { format: c.format } : {}),
      ...(c.minor ? { minor: c.minor } : {}),
      ...(c.moveEdits ? { moveEdits: c.moveEdits } : {}),
      contextBefore: c.contextBefore,
      contextAfter: c.contextAfter,
      old: side('old'),
      new: side('new'),
    };
  });
  const exp = truth.map((t) => expectedPages(id, t, a, b));
  return { exp, disclosed: truth.map((t, k) => disclosed(t, exp[k])), furniture, items };
}

/**
 * Score a recorded case under the given rules (ChangeLens only). The rules
 * decided after round 4 need the recorded header/footer lines when the
 * truth has a header/footer item; a recording without them is refused
 * rather than scored with the earlier disclosure rule.
 */
export function rescoreCase(truth: Truth[], rec: RecordedCase, rules: Rules): Scored {
  if (rec.exp.length !== truth.length) throw new Error(`the recorded case has ${rec.exp.length} truth items, truth.json ${truth.length}`);
  const furniture = rec.furniture;
  if (rules.afterRound4 && !furniture && truth.some((t) => t.type === 'furniture'))
    throw new Error('recorded without its header/footer lines, which the rules decided after round 4 need for a header/footer truth item; score it with the registered rules (--registered-rules), or use a recording that has them');
  const items = rec.items.map((r): Item => {
    const side = (s: RecordedSide) => ({ text: s.text, pages: s.pages.map((p) => p - 1), rects: s.rects.map(([page, x, y, w, h]) => ({ page, rect: { x, y, w, h } })) });
    const c = { ...r, numeric: r.numeric ? {} : undefined, old: side(r.old), new: side(r.new) } as unknown as Change;
    const pages = (s: RecordedSide) => (rules.boundaryCarets && s.boundary ? s.boundary : s.pages);
    return { oldText: r.old.text, newText: r.new.text, oldPages: pages(r.old), newPages: pages(r.new), change: c, shown: shownExcerpt(c) };
  });
  const disclosed: Disclosed = rules.afterRound4 ? (t, exp) => furnitureLinesDisclosed(t, exp, furniture ?? []) : (t) => rec.disclosed[truth.indexOf(t)];
  return scoreAgainst(truth, items, rec.exp, (t, it) => changeLensMatch(t, it, rules), disclosed);
}
