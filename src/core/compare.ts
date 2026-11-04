import type {
  Anchor,
  Coverage,
  Change,
  CompareResult,
  DiffOptions,
  DocModel,
  FormatDetail,
  Line,
  PageLink,
  Rect,
  Side,
  Token,
} from './types.ts';
import { defaultOptions } from './types.ts';
import { baseKey, joinTokens, syncHyphenation } from './tokenize.ts';
import { cleanupSemantic, intern, matchSequences, opsFromMatches, type DiffOp, type MatchInfo, type Span } from './diff.ts';
import { mergeLineRects } from './geometry.ts';
import { SUFFIX, decimalMark, isNumericPhrase, parseNumber } from './numbers.ts';
import { findOverflow } from './overflow.ts';
import { syncFurniture } from './furniture.ts';


function weight(t: Token): number {
  if (t.kind === 'cjk') return 2;
  if (t.kind === 'punct') return 0.5;
  return t.text.length;
}

interface Hunk {
  a0: number;
  a1: number;
  b0: number;
  b1: number;
}

interface Ctx {
  oldDoc: DocModel;
  newDoc: DocModel;
  A: Token[];
  B: Token[];
  /** Interned comparison keys of A and B. */
  ka: Int32Array;
  kb: Int32Array;
  blocksA: Map<number, [number, number]>;
  blocksB: Map<number, [number, number]>;
}

/** How often each interned key occurs in a sequence. */
function keyCounts(keys: Int32Array, n: number): Int32Array {
  const c = new Int32Array(n);
  for (const k of keys) c[k]++;
  return c;
}

/**
 * Which unchanged runs between two edits the semantic clean-up may fold into
 * one rewrite: coincidental matches inside prose. Structure a reader uses to
 * locate edits is never folded away, so a fully revised table still yields
 * one change per figure or row instead of one "rewrote N words".
 */
function foldRule(ctx: Ctx, initial?: DiffOp[]): (eq: Span, before: Span, after: Span) => boolean {
  const { A, B, ka, kb } = ctx;
  // Words of each block that the first alignment matched (main diff only:
  // inside a moved passage every word is "unmatched" in the main diff).
  const matchedA = new Map<number, number>();
  const matchedB = new Map<number, number>();
  for (const op of initial ?? []) {
    if (op.type !== 'equal') continue;
    for (let i = op.a0; i < op.a1; i++) if (A[i].kind !== 'punct') matchedA.set(A[i].block, (matchedA.get(A[i].block) ?? 0) + 1);
    for (let i = op.b0; i < op.b1; i++) if (B[i].kind !== 'punct') matchedB.set(B[i].block, (matchedB.get(B[i].block) ?? 0) + 1);
  }
  let n = 0;
  for (const k of ka) if (k >= n) n = k + 1;
  for (const k of kb) if (k >= n) n = k + 1;
  const countA = keyCounts(ka, n);
  const countB = keyCounts(kb, n);
  // The equality touches or crosses a block boundary (it starts or ends a
  // paragraph, heading or table row, or spans two of them).
  const crosses = (T: Token[], s: number, e: number) => s === 0 || e >= T.length || T[s - 1].block !== T[e].block;
  const numeric = (T: Token[], s: number, e: number) => e === s || isNumericPhrase(T.slice(s, e).map((t) => t.text));
  const numericEdit = (g: Span) => numeric(A, g.a0, g.a1) && numeric(B, g.b0, g.b1);
  const direction = (g: Span) => (g.a1 > g.a0 && g.b1 > g.b0 ? 'mixed' : g.a1 > g.a0 ? 'delete' : 'insert');
  const lineStart = (T: Token[], s: number) => s === 0 || T[s - 1].line !== T[s].line;
  const big = (g: Span) => g.orig > 8;
  // The equality lies in a long block of which the first alignment matched
  // almost nothing: it is (nearly) all new or all gone.
  const engulfed = (blocks: Map<number, [number, number]>, matched: Map<number, number>, T: Token[], s: number, e: number) => {
    if (!initial || e <= s || T[e - 1].block !== T[s].block) return false;
    const r = blocks.get(T[s].block);
    if (!r) return false;
    let words = 0;
    for (let k = r[0]; k < r[1]; k++) if (T[k].kind !== 'punct') words++;
    return words >= 12 && (matched.get(T[s].block) ?? 0) <= 0.25 * words;
  };
  return (eq, before, after) => {
    const db = direction(before);
    const da = direction(after);
    if (db !== 'mixed' && da !== 'mixed') {
      // A deleted passage next to an inserted one is not one rewrite (it may
      // be a move), unless both are a word or two ("Testing Launch" →
      // "Launch Testing"). Two deletions (or insertions) only when the
      // equality is a few coincidental words inside a large block, such as
      // a moved paragraph.
      if (db !== da && (before.orig > 2 || after.orig > 2)) return false;
      if (db === da && (!big(before) || !big(after))) return false;
    }
    // Structure on both sides (a heading, the end of a paragraph, a row that
    // is its own block) stays visible and keeps the edits around it apart.
    if (crosses(A, eq.a0, eq.a1) && crosses(B, eq.b0, eq.b1)) return false;
    // A row label: starts a line in both versions.
    const label = lineStart(A, eq.a0) && lineStart(B, eq.b0);
    let words = 0;
    let latin = false;
    for (let i = eq.a0; i < eq.a1; i++) {
      if (A[i].kind === 'punct') continue;
      words++;
      if (A[i].kind === 'word') latin = true;
      // A row label found exactly once in each version is a real anchor,
      // not a coincidence; so is one that is not a lower-case word and is
      // found equally often (at most a few times) in both versions, such as
      // the region names of two tables with the same rows.
      const ca = countA[ka[i]];
      if (label && ca === countB[kb[eq.b0 + (i - eq.a0)]] && (ca === 1 || (ca <= 4 && !/^\p{Ll}/u.test(A[i].text)))) return false;
    }
    // Revised figures separated by a label ("Q1 -120 Q2 340", "between 10
    // and 20") stay separate changes; the parts of a date ("11 月 30 日")
    // are folded into one.
    if ((label || latin) && numericEdit(before) && numericEdit(after)) return false;
    // A word or two that happens to match inside a paragraph that is
    // otherwise wholly new (or wholly gone) is a coincidence, e.g. "every"
    // shared by a deleted sentence and a paragraph moved next to it.
    // Folding it lets the paragraph be recognised as inserted (or moved).
    if (words <= 2 && (engulfed(ctx.blocksA, matchedA, A, eq.a0, eq.a1) || engulfed(ctx.blocksB, matchedB, B, eq.b0, eq.b1)))
      return true;
    // Sizes of the original edits (orig), not of groups merged earlier:
    // merging must not snowball across a document.
    // Keep a small edit apart from a large block (which may be a moved
    // paragraph): only fold equalities between changes of similar scale.
    if (big(before) !== big(after)) return false;
    // A few coincidentally matching words inside a large rewrite or block.
    if (big(before)) return words <= 5 && eq.a1 - eq.a0 <= 0.2 * Math.min(before.orig, after.orig);
    return words <= 2 && eq.a1 - eq.a0 <= 4;
  };
}

/** Clean-up shared by the main diff and the diff inside a moved passage. */
function refine(ctx: Ctx, ops: DiffOp[], fold: (eq: Span, before: Span, after: Span) => boolean): DiffOp[] {
  const { A, B } = ctx;
  ops = cleanupSemantic(ops, (i) => weight(A[i]), (i) => weight(B[i]), fold);
  ops = normalizeReplaces(ops, A, B);
  slideToBoundaries(ops, A, B);
  return ops;
}

/** Runs of consecutive non-equal ops. */
function hunksOf(ops: DiffOp[]): Hunk[] {
  const hunks: Hunk[] = [];
  let cur: Hunk | null = null;
  for (const op of ops) {
    if (op.type === 'equal') {
      if (cur) hunks.push(cur);
      cur = null;
      continue;
    }
    if (!cur) cur = { a0: op.a0, a1: op.a0, b0: op.b0, b1: op.b0 };
    if (op.type === 'delete') cur.a1 = op.a1;
    else cur.b1 = op.b1;
  }
  if (cur) hunks.push(cur);
  return hunks;
}

/**
 * Split a hunk whose deleted and inserted text lie in blocks that do not
 * correspond, e.g. a figure appended to one paragraph next to a number
 * removed from the start of the next one: two edits, not "2 → 1,500".
 * Each side is cut into the part that belongs to the block before the hunk,
 * whole blocks in between, and the part that belongs to the block after it;
 * the parts are paired in that order.
 */
function splitAtBlocks(ctx: Ctx, h: Hunk): Hunk[] {
  const { A, B } = ctx;
  if (h.a1 === h.a0 || h.b1 === h.b0) return [h];
  const pa = A[h.a0 - 1];
  const na = A[h.a1];
  const pb = B[h.b0 - 1];
  const nb = B[h.b1];
  if (!pa || !na || !pb || !nb) return [h];
  // Nothing to split when neither side reaches from one block into another.
  const crossA = pa.block !== na.block;
  const crossB = pb.block !== nb.block;
  if (!crossA && !crossB) return [h];
  // Only one side reaches into another block, and the other side's paragraph
  // carries on with words on both sides of the hunk, in step with the two
  // blocks: the paragraph was only broken somewhere else (a page break, a
  // wider line spacing), so "100" → "200" stays one change. When the other
  // side's paragraph ends right after the hunk (only its full stop is left),
  // the blocks are really different paragraphs, e.g. a paragraph moved next
  // to a sentence deleted from the end of the one before it.
  if (crossA !== crossB && carriesOn(ctx, h, crossA ? 'b' : 'a')) return [h];
  const cut = (T: Token[], s: number, e: number, prev: Token, next: Token): [number, number] => {
    let i = s;
    while (i < e && T[i].block === prev.block) i++;
    let j = e;
    while (j > i && T[j - 1].block === next.block) j--;
    return [i, j];
  };
  const [ai, aj] = cut(A, h.a0, h.a1, pa, na);
  const [bi, bj] = cut(B, h.b0, h.b1, pb, nb);
  return [
    { a0: h.a0, a1: ai, b0: h.b0, b1: bi },
    { a0: ai, a1: aj, b0: bi, b1: bj },
    { a0: aj, a1: h.a1, b0: bj, b1: h.b1 },
  ].filter((p) => p.a1 > p.a0 || p.b1 > p.b0);
}

/**
 * Whether the paragraph around hunk `h` on side `whole` (which stays in one
 * block) continues with matched words (two or more, not one coincidental
 * word) right before and right after the hunk, while the other side's
 * matched words lie in the block before and the block after its own
 * boundary, and that side's changed tokens all lie in those two blocks (no
 * whole paragraph in between).
 */
function carriesOn(ctx: Ctx, h: Hunk, whole: 'a' | 'b'): boolean {
  const [W, O] = whole === 'a' ? [ctx.A, ctx.B] : [ctx.B, ctx.A];
  const [w0, w1, o0, o1] = whole === 'a' ? [h.a0, h.a1, h.b0, h.b1] : [h.b0, h.b1, h.a0, h.a1];
  const block = W[w0 - 1].block;
  const before = O[o0 - 1].block;
  const after = O[o1].block;
  for (let k = o0; k < o1; k++) if (O[k].block !== before && O[k].block !== after) return false;
  const words = (dir: 1 | -1) => {
    let n = 0;
    for (let i = dir < 0 ? w0 - 1 : w1, j = dir < 0 ? o0 - 1 : o1; W[i] && O[j] && W[i].key === O[j].key; i += dir, j += dir) {
      if (W[i].block !== block || O[j].block !== (dir < 0 ? before : after)) return false;
      if (W[i].kind !== 'punct' && ++n === 2) return true;
    }
    return false;
  };
  return words(-1) && words(1);
}

// Any decimal digit, full-width ones included ("１２，０００").
const hasDigit = (t: Token) => /\p{Nd}/u.test(t.text);

/**
 * Several revised figures in a row ("10 500" → "50 100") become one change
 * per figure when both sides hold the same number of figures, so each gets
 * its own percentage and sign check.
 */
function splitNumbers(ctx: Ctx, h: Hunk): Hunk[] {
  const { A, B } = ctx;
  const da = A.slice(h.a0, h.a1);
  const db = B.slice(h.b0, h.b1);
  if (!da.length || !db.length || !isNumericPhrase(da.map((t) => t.text)) || !isNumericPhrase(db.map((t) => t.text))) return [h];
  // Where each figure starts, including a currency sign written onto it.
  const starts = (T: Token[], s: number, e: number) => {
    const out: number[] = [];
    for (let k = s; k < e; k++) {
      if (!hasDigit(T[k])) continue;
      let at = k;
      const floor = out.length ? out[out.length - 1] + 1 : s;
      while (at > floor && !T[at].spaceBefore && !hasDigit(T[at - 1])) at--;
      out.push(out.length ? at : s);
    }
    return out;
  };
  const sa = starts(A, h.a0, h.a1);
  const sb = starts(B, h.b0, h.b1);
  if (sa.length < 2 || sa.length !== sb.length) return [h];
  const out: Hunk[] = [];
  for (let k = 0; k < sa.length; k++) {
    const p = { a0: sa[k], a1: sa[k + 1] ?? h.a1, b0: sb[k], b1: sb[k + 1] ?? h.b1 };
    // The separator after a figure ("10, 20") is unchanged text, not part of it.
    while (p.a1 - 1 > p.a0 && p.b1 - 1 > p.b0 && A[p.a1 - 1].kind === 'punct' && !UNIT.test(A[p.a1 - 1].text) && A[p.a1 - 1].key === B[p.b1 - 1].key) {
      p.a1--;
      p.b1--;
    }
    const same = p.a1 - p.a0 === p.b1 - p.b0 && A.slice(p.a0, p.a1).every((t, j) => t.key === B[p.b0 + j].key);
    if (!same) out.push(p);
  }
  return out;
}

function splitHunk(ctx: Ctx, h: Hunk): Hunk[] {
  return splitAtBlocks(ctx, h)
    .flatMap((p) => splitNumbers(ctx, p))
    .filter((p) => !sameText(ctx, p));
}

/**
 * Both sides read the same and only their tokens are cut differently: a
 * superscript or subscript set as a raised run of its own ("m" + "2", "H" +
 * "2" + "O") against the Unicode character or plain text ("m²", "H2O").
 * Comparison keys already treat "²" as "2"; the script position is
 * formatting, so this is not a text change.
 */
function sameText(ctx: Ctx, h: Hunk): boolean {
  if (h.a1 === h.a0 || h.b1 === h.b0) return false;
  const text = (T: Token[], s: number, e: number) => T.slice(s, e).map((t, k) => (k > 0 && t.spaceBefore ? ' ' : '') + t.key).join('');
  return text(ctx.A, h.a0, h.a1) === text(ctx.B, h.b0, h.b1);
}

function blockRanges(toks: Token[]): Map<number, [number, number]> {
  const m = new Map<number, [number, number]>();
  toks.forEach((t, k) => {
    const r = m.get(t.block);
    if (r) r[1] = k + 1;
    else m.set(t.block, [k, k + 1]);
  });
  return m;
}

function rectsOf(tokens: Token[]): { page: number; rect: Rect }[] {
  const byPage = new Map<number, Rect[]>();
  for (const t of tokens) {
    let arr = byPage.get(t.page);
    if (!arr) byPage.set(t.page, (arr = []));
    arr.push(...t.rects);
  }
  const out: { page: number; rect: Rect }[] = [];
  for (const [page, rects] of [...byPage.entries()].sort((a, b) => a[0] - b[0])) {
    for (const rect of mergeLineRects(rects)) out.push({ page, rect });
  }
  return out;
}

function makeSide(toks: Token[], s: number, e: number, preferNext: boolean): Side {
  const tokens = toks.slice(s, e);
  if (tokens.length > 0) {
    const rects = rectsOf(tokens);
    return {
      pages: [...new Set(rects.map((r) => r.page))],
      rects,
      text: joinTokens(tokens),
      start: tokens[0].i,
      end: tokens[tokens.length - 1].i + 1,
    };
  }
  const prev = toks[s - 1];
  const next = toks[s];
  let caret: Side['caret'];
  if (next && (preferNext || !prev)) {
    const r = next.rects[0];
    caret = { page: next.page, x: r.x, y: r.y, h: r.h };
  } else if (prev) {
    const r = prev.rects[prev.rects.length - 1];
    caret = { page: prev.page, x: r.x + r.w, y: r.y, h: r.h };
  } else {
    caret = { page: 0, x: 0, y: 0, h: 12 };
  }
  return { pages: [caret.page], rects: [], text: '', caret };
}

function wholeBlocks(blocks: Map<number, [number, number]>, toks: Token[], s: number, e: number): number {
  if (e <= s) return 0;
  const seen = new Set<number>();
  let n = 0;
  for (let k = s; k < e; k++) {
    const b = toks[k].block;
    if (seen.has(b)) continue;
    seen.add(b);
    const r = blocks.get(b)!;
    if (r[0] >= s && r[1] <= e) n++;
  }
  return n;
}

function context(toks: Token[], s: number, e: number): [string, string] {
  const before: Token[] = [];
  const anchorB = toks[s - 1];
  for (let k = s - 1; k >= 0 && before.length < 6; k--) {
    if (anchorB && toks[k].block !== anchorB.block) break;
    before.unshift(toks[k]);
  }
  const after: Token[] = [];
  const anchorA = toks[e];
  for (let k = e; k < toks.length && after.length < 6; k++) {
    if (anchorA && toks[k].block !== anchorA.block) break;
    after.push(toks[k]);
  }
  return [joinTokens(before), joinTokens(after)];
}

function sideOrder(side: Side, doc: DocModel): number {
  const p = side.rects[0]?.page ?? side.caret?.page ?? 0;
  const y = side.rects[0]?.rect.y ?? side.caret?.y ?? 0;
  return p * 100000 + Math.min(99999, Math.max(0, y) * (842 / (doc.pages[p]?.height || 842)));
}

function textChange(ctx: Ctx, h: Hunk): Change {
  const { A, B } = ctx;
  const delToks = A.slice(h.a0, h.a1);
  const insToks = B.slice(h.b0, h.b1);
  const wholeA = wholeBlocks(ctx.blocksA, A, h.a0, h.a1);
  const wholeB = wholeBlocks(ctx.blocksB, B, h.b0, h.b1);
  const whole = Math.max(wholeA, wholeB);
  const oldSide = makeSide(A, h.a0, h.a1, wholeB > 0);
  const newSide = makeSide(B, h.b0, h.b1, wholeA > 0);
  const kind = delToks.length && insToks.length ? 'replace' : delToks.length ? 'delete' : 'insert';
  const words = (ts: Token[]) => ts.filter((t) => t.kind !== 'punct');
  const all = [...words(delToks), ...words(insToks)];
  const cjk = all.length > 0 && all.filter((t) => t.kind === 'cjk').length / all.length > 0.5;
  const [cb, ca] = context(B.length ? B : A, B.length ? h.b0 : h.a0, B.length ? h.b1 : h.a1);
  const change: Change = {
    id: '',
    kind,
    category: 'text',
    old: oldSide,
    new: newSide,
    size: Math.max(words(delToks).length, words(insToks).length),
    cjk,
    contextBefore: cb,
    contextAfter: ca,
    order: sideOrder(newSide, ctx.newDoc),
  };
  if (whole > 0 && kind !== 'replace') change.wholeParagraphs = whole;
  // A form field's value (see TextRun.field): said so in the description.
  const changed = [...delToks, ...insToks].filter((t) => t.kind !== 'punct');
  if (changed.length && changed.every((t) => t.field)) change.field = true;
  if (kind === 'replace' && isNumericPhrase(delToks.map((t) => t.text)) && isNumericPhrase(insToks.map((t) => t.text))) {
    // Show the unchanged unit or currency sign that is written onto the
    // number ("4%" → "8%", "€62.40"), so the description keeps its meaning.
    // Likewise a magnitude ("−£7.4m"), and a percent sign set after a space
    // ("12,5 %", the German and French style).
    const before = A[h.a0 - 1];
    const after = A[h.a1];
    const afterB = B[h.b1];
    const pre = before && UNIT.test(before.text) && !delToks[0].spaceBefore && !insToks[0].spaceBefore && before.line === delToks[0].line ? before.text : '';
    const sameAfter = !!after && afterB?.text === after.text && after.line === A[h.a1 - 1].line && afterB.line === B[h.b1 - 1].line;
    let post = '';
    if (sameAfter && !after.spaceBefore && !afterB.spaceBefore && (UNIT.test(after.text) || SUFFIX.test(after.text))) post = after.text;
    else if (sameAfter && after.spaceBefore && afterB.spaceBefore && /^[%‰]$/.test(after.text)) post = ' ' + after.text;
    const from = pre + oldSide.text + post;
    const to = pre + newSide.text + post;
    oldSide.text = from;
    newSide.text = to;
    // The unit is now shown as part of the figure, so the context around it
    // starts after it: "1.50% → 1.05%" then "of the …", not "% of the …".
    if (pre || post) {
      const b0 = h.b0 - (pre && B[h.b0 - 1]?.text === before.text ? 1 : 0);
      [change.contextBefore, change.contextAfter] = context(B, b0, h.b1 + (post ? 1 : 0));
    }
    // A value (for the percentage and sign check) only when each side is one
    // figure: several figures run together would give a meaningless number.
    // Two list labels ("(3)" → "(4)", "3." → "4." at the start of a line)
    // and amounts in different currencies or magnitudes ("300 EUR" → "350
    // USD") get none either. The two sides are read with the same decimal
    // separator ("1.234" → "1.234,50").
    const single = delToks.filter(hasDigit).length === 1 && insToks.filter(hasDigit).length === 1;
    const value =
      single &&
      balanced(from) &&
      balanced(to) &&
      !(isListLabel(A, h.a0, h.a1, from) && isListLabel(B, h.b0, h.b1, to)) &&
      !(h.a1 - h.a0 === 1 && h.b1 - h.b0 === 1 && labelAt(ctx.oldDoc, A[h.a0].i)?.style === 'list' && labelAt(ctx.newDoc, B[h.b0].i)?.style === 'list') &&
      !referenceNumber(A, h.a0, h.a1) &&
      !referenceNumber(B, h.b0, h.b1) &&
      sameUnit(from, to) &&
      !halfOfGroupedNumber(ctx, h);
    const decimal = decimalMark(from) ?? decimalMark(to) ?? undefined;
    change.numeric = {
      from,
      to,
      fromValue: value ? parseNumber(from, decimalMark(from) ?? decimal) : null,
      toValue: value ? parseNumber(to, decimalMark(to) ?? decimal) : null,
    };
  } else if (kind === 'replace' && numberedIdentifier(delToks, insToks)) {
    // "V2.3" → "V2.4", "R-15" → "R-16": a version or reference number. A
    // number change, without a percentage (the value is a label, not an amount).
    change.numeric = { from: oldSide.text, to: newSide.text, fromValue: null, toValue: null };
  }
  return change;
}

/**
 * One word on each side, written alike except for its digits: a version,
 * revision or reference number ("V2.3" → "V2.4", "R-15" → "R-16", "AL.150"
 * → "AL.151"). The letters around the digits are the same, so only the
 * number changed. A different word ("2a" → "2b", "V2" → "W2") is not.
 */
function numberedIdentifier(a: Token[], b: Token[]): boolean {
  if (a.length !== 1 || b.length !== 1 || a[0].kind !== 'word' || b[0].kind !== 'word') return false;
  const skeleton = (s: string) => s.normalize('NFKC').replace(/\p{Nd}+/gu, '#');
  const sa = skeleton(a[0].text);
  return sa.includes('#') && /\p{L}/u.test(sa) && sa === skeleton(b[0].text) && a[0].text !== b[0].text;
}

/**
 * The changed figure is one half of a pair standing on its own, a 1–3 digit
 * figure, a single space and a 3-digit figure, whose other half is
 * unchanged ("4 500" → "4 800", "4 500" → "6 500"). PDF producers write the
 * no-break space that groups thousands as a plain space, so this may be one
 * number (+6.7%, +44%) or two (+60%, +50%). No percentage is given rather
 * than a wrong one. A run of three or more such figures ("120 135 150") is
 * read as separate figures, as the tokeniser does.
 */
function halfOfGroupedNumber(ctx: Ctx, h: Hunk): boolean {
  if (h.a1 - h.a0 !== 1 || h.b1 - h.b0 !== 1) return false;
  const adjacent = (p: Token | undefined, t: Token | undefined) => {
    if (!p || !t || p.line !== t.line || !t.spaceBefore || !/^\d{1,3}$/.test(p.text) || !/^\d{3}$/.test(t.text)) return false;
    const r = p.rects[p.rects.length - 1];
    return t.rects[0].x - (r.x + r.w) < 0.6 * t.size;
  };
  /** Tokens k and k + 1 form such a pair. */
  const pair = (T: Token[], k: number) => adjacent(T[k], T[k + 1]) && !adjacent(T[k - 1], T[k]) && !adjacent(T[k + 1], T[k + 2]);
  const { A, B } = ctx;
  const lead = pair(A, h.a0 - 1) && pair(B, h.b0 - 1) && A[h.a0 - 1].key === B[h.b0 - 1].key;
  const group = pair(A, h.a0) && pair(B, h.b0) && A[h.a1].key === B[h.b1].key;
  return lead || group;
}

const balanced = (s: string) => (s.match(/\(/g) ?? []).length === (s.match(/\)/g) ?? []).length;

/** Currency signs, codes and magnitudes of an amount ("−£7.4m" → "£m"). */
const unitOf = (s: string) => s.normalize('NFKC').replace(/[\d.,\s+\-−–()'’]/g, '').toLowerCase();
/** Both amounts are in the same unit, or one of them has none. */
const sameUnit = (a: string, b: string) => !unitOf(a) || !unitOf(b) || unitOf(a) === unitOf(b);

/**
 * "(3)", "3)" or a bare "3" followed by "." or ")" at the start of a line
 * look like list labels. When both sides do ("(1)" → "(2)"), no sign change
 * or percentage is computed; a plain figure at the start of a line (a
 * table's first column) keeps them. Clause numbers set apart at the start
 * of a line ("8.4" → "8.5", see labelAt) get none either.
 */
function isListLabel(T: Token[], s: number, e: number, label: string): boolean {
  if (s > 0 && T[s - 1].line === T[s].line) return false;
  const text = label.normalize('NFKC');
  if (/^\(\d{1,2}\)?$|^\d{1,2}\)$/.test(text)) return true;
  const next = T[e];
  return /^\d{1,2}$/.test(text) && !!next && next.line === T[e - 1].line && !next.spaceBefore && /^[.)]$/.test(next.text.normalize('NFKC'));
}

/** Words that a clause, step or page number follows in a cross-reference ("under clause 4.4", "see step 3", "§ 12", "第 4.4 条"). */
const REFERENCE_WORD =
  /^(?:clauses?|sections?|§§?|art|arts|articles?|paragraphs?|paras?|item|step|page|pp?|figure|fig|table|tab|footnote|annex|appendix|schedule|exhibit|chapter|no|nos|nr|ziffern?|abschnitte?|artikel|absatz|seite|第)\.?$/i;

/**
 * T[s, e) is a number that names something rather than measuring it: a
 * cross-reference ("clause 4.4", "[12]", "第 4.4 条"), an annex clause label
 * ("A.3" at the start of a line), a page number after the leader of a
 * contents line, a figure written with a leading zero
 * ("09.00", "007") or the digits typed into a comb field. Such a change
 * gets no percentage.
 */
function referenceNumber(T: Token[], s: number, e: number): boolean {
  if (e - s !== 1) return false;
  const t = T[s];
  if (/^0\d/.test(t.text)) return true;
  // A comb field's digits (a postcode, an account number, a date written 03112026).
  if (t.comb && /^\d+$/.test(t.text)) return true;
  const before = T[s - 1];
  const after = T[e];
  const sameLine = (x: Token | undefined) => !!x && x.line === t.line;
  // The word, also when abbreviated with a full stop ("No. 12", "Art. 5").
  const word = before?.text === '.' && !before.spaceBefore ? T[s - 2] : before;
  if (sameLine(word) && REFERENCE_WORD.test(word!.text)) return true;
  // An annex clause label written together at the start of a line ("A.3").
  if (word !== before && sameLine(word) && /^\p{Lu}$/u.test(word!.text) && !t.spaceBefore && (s - 2 === 0 || T[s - 3].line !== t.line)) return true;
  if (sameLine(after) && /^[条款项章节]$/.test(after!.text)) return true;
  // A page number at the end of a contents line, after a leader ("Change control ........ 2").
  const dot = (k: number) => k >= 0 && T[k].text === '.' && sameLine(T[k]);
  const leader = sameLine(before) && (/^([.·…_])\1{2,}$|^…$/.test(before!.text) || (dot(s - 1) && dot(s - 2) && dot(s - 3)));
  if (!sameLine(after) && leader) return true;
  return sameLine(before) && sameLine(after) && before!.text === '[' && after!.text === ']' && !t.spaceBefore && !after!.spaceBefore;
}

/** Unit and currency symbols that are written directly onto numbers. */
const UNIT = /^[%‰$€£¥₹₩¢₽₺°]$/;

/**
 * "delete X, insert Y…X" is really "insert Y…, keep X" (and likewise for a
 * prefix, or with the roles swapped). Clean-up can create such pairs when it
 * dissolves a coincidental match; turning them back into pure insertions or
 * deletions keeps moved and whole paragraphs recognisable.
 */
function normalizeReplaces(ops: DiffOp[], A: Token[], B: Token[]): DiffOp[] {
  const out: DiffOp[] = [];
  const push = (op: DiffOp) => {
    if (op.a1 === op.a0 && op.b1 === op.b0) return;
    const last = out[out.length - 1];
    if (last && last.type === 'equal' && op.type === 'equal' && last.a1 === op.a0 && last.b1 === op.b0) {
      last.a1 = op.a1;
      last.b1 = op.b1;
    } else out.push({ ...op });
  };
  for (let i = 0; i < ops.length; i++) {
    const del = ops[i];
    const ins = ops[i + 1];
    if (del.type !== 'delete' || !ins || ins.type !== 'insert') {
      push(del);
      continue;
    }
    const k = del.a1 - del.a0;
    const n = ins.b1 - ins.b0;
    const same = (ai: number, bi: number) => A[ai].key === B[bi].key;
    let done = false;
    if (k < n && k <= 3) {
      if ([...Array(k).keys()].every((j) => same(del.a0 + j, ins.b1 - k + j))) {
        push({ type: 'insert', a0: del.a0, a1: del.a0, b0: ins.b0, b1: ins.b1 - k });
        push({ type: 'equal', a0: del.a0, a1: del.a1, b0: ins.b1 - k, b1: ins.b1 });
        done = true;
      } else if ([...Array(k).keys()].every((j) => same(del.a0 + j, ins.b0 + j))) {
        push({ type: 'equal', a0: del.a0, a1: del.a1, b0: ins.b0, b1: ins.b0 + k });
        push({ type: 'insert', a0: del.a1, a1: del.a1, b0: ins.b0 + k, b1: ins.b1 });
        done = true;
      }
    } else if (n < k && n <= 3) {
      if ([...Array(n).keys()].every((j) => same(del.a1 - n + j, ins.b0 + j))) {
        push({ type: 'delete', a0: del.a0, a1: del.a1 - n, b0: ins.b0, b1: ins.b0 });
        push({ type: 'equal', a0: del.a1 - n, a1: del.a1, b0: ins.b0, b1: ins.b1 });
        done = true;
      } else if ([...Array(n).keys()].every((j) => same(del.a0 + j, ins.b0 + j))) {
        push({ type: 'equal', a0: del.a0, a1: del.a0 + n, b0: ins.b0, b1: ins.b1 });
        push({ type: 'delete', a0: del.a0 + n, a1: del.a1, b0: ins.b1, b1: ins.b1 });
        done = true;
      }
    }
    if (done) i++;
    else push(del);
  }
  return out;
}

// ------------------------------------------------------------- sliding ---

/**
 * A pure insertion or deletion can often be shifted by a few tokens without
 * changing the result ("a b [b c]" vs "a [b b] c"). Choose the position that
 * lines up best with paragraph and line boundaries, so that a deleted
 * paragraph is reported as exactly that paragraph.
 */
function slideToBoundaries(ops: DiffOp[], A: Token[], B: Token[]): void {
  // Inside a line, a sentence boundary: the text starts with a word after a
  // full stop and ends with its own final mark (". The lenders … 2026" →
  // "The lenders … 2026."). It only breaks ties within a line.
  const stop = (t: Token | undefined) => !!t && t.kind === 'punct' && /^[.!?。！？]$/.test(t.text);
  const score = (seq: Token[], lo: number, hi: number) => {
    const first = seq[lo];
    const last = seq[hi - 1];
    let s = 0;
    if (lo === 0 || seq[lo - 1].block !== first.block) s += 2;
    else if (seq[lo - 1].line !== first.line) s += 1;
    else if (stop(seq[lo - 1]) && first.kind !== 'punct') s += 0.5;
    if (hi === seq.length || seq[hi].block !== last.block) s += 2;
    else if (seq[hi].line !== last.line) s += 1;
    else if (stop(last)) s += 0.5;
    return s;
  };
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    if (op.type === 'equal') continue;
    const prev = ops[i - 1];
    const next = ops[i + 1];
    if ((prev && prev.type !== 'equal') || (next && next.type !== 'equal')) continue;
    const del = op.type === 'delete';
    const seq = del ? A : B;
    const lo = del ? op.a0 : op.b0;
    const hi = del ? op.a1 : op.b1;
    const prevLen = prev ? prev.a1 - prev.a0 : 0;
    const nextLen = next ? next.a1 - next.a0 : 0;
    let left = 0;
    while (left < prevLen && seq[lo - 1 - left].key === seq[hi - 1 - left].key) left++;
    let right = 0;
    while (right < nextLen && seq[lo + right].key === seq[hi + right].key) right++;
    if (left === 0 && right === 0) continue;
    let best = 0;
    let bestScore = score(seq, lo, hi);
    for (let sh = -left; sh <= right; sh++) {
      const sc = score(seq, lo + sh, hi + sh);
      if (sc > bestScore || (sc === bestScore && Math.abs(sh) < Math.abs(best))) {
        best = sh;
        bestScore = sc;
      }
    }
    if (best === 0) continue;
    op.a0 += best;
    op.a1 += best;
    op.b0 += best;
    op.b1 += best;
    if (prev) {
      prev.a1 += best;
      prev.b1 += best;
    }
    if (next) {
      next.a0 += best;
      next.b0 += best;
    }
  }
  // Drop equalities that became empty.
  for (let i = ops.length - 1; i >= 0; i--) if (ops[i].type === 'equal' && ops[i].a1 === ops[i].a0) ops.splice(i, 1);
}

// ------------------------------------------------------------ relabel ---

/** The line-start labels in T[s, e) of the kind and role of label `like` (document token k). */
function itemsIn(doc: DocModel, T: Token[], s: number, e: number, like: Label, k: number): number {
  const box = labelBox(doc, k, like);
  const parent = like.parts.slice(0, -1).join('.');
  let n = 0;
  for (let j = s; j < e; j++) {
    if (doc.lines[T[j].line].start !== T[j].i) continue;
    const l = labelAt(doc, T[j].i);
    if (l && l.style === like.style && l.parts.length === like.parts.length && l.parts.slice(0, -1).join('.') === parent && sameRole(labelBox(doc, T[j].i, l), box)) n++;
  }
  return n;
}

/**
 * A clause inserted into a numbered list ("4.3 New clause." before the old
 * 4.3, which becomes 4.4) is often aligned so that the old label "4.3"
 * matches the inserted clause's label, and the old clause's new label
 * "4.4" ends the insertion: "Added “… new clause. 4.4”" and no trace of the
 * renumbering. When an insertion lies between two line-start labels of the
 * same kind, the first matched to the old label just before it, the last
 * followed by the old clause's own text, the old label is paired with the
 * last one instead ("4.3" → "4.4", a renumbering for extractRenumbering) and
 * the insertion starts at the inserted clause's label. Deletions likewise.
 * The tokens on its line that both items start with after the number (up
 * to 8) move with it: the mark of a label "4." ("4" + "."), an opening
 * quote ("1.3 “Change”"), the words of a CJK item ("２． 従業員は、"). The
 * old label and the last one must be in the same column at the same size
 * (see sameColumn; their weight may differ, as the label of one item can be
 * made bold), so a step inserted at the end of a step list does not take the
 * label of a larger heading after it. The pairing of the other words is
 * unchanged.
 */
function relabel(ctx: Ctx, hunks: Hunk[], pairs: Int32Array): { hunks: Hunk[]; pairs: Int32Array; labels: Set<Hunk> } {
  const { A, B, oldDoc, newDoc } = ctx;
  const toB = new Int32Array(A.length).fill(-1);
  const toA = new Int32Array(B.length).fill(-1);
  for (let p = 0; p < pairs.length; p += 2) {
    toB[pairs[p]] = pairs[p + 1];
    toA[pairs[p + 1]] = pairs[p];
  }
  let moved = false;
  const out: Hunk[] = [];
  const labels = new Set<Hunk>();
  const same = (x: Label | null, y: Label | null) => !!x && !!y && x.style === y.style && x.parts.length === y.parts.length;
  for (const h of hunks) {
    const ins = h.a0 === h.a1 && h.b1 - h.b0 >= 2;
    const del = h.b0 === h.b1 && h.a1 - h.a0 >= 2;
    if (!ins && !del) {
      out.push(h);
      continue;
    }
    // T: the side with the inserted (or deleted) text; U: the other one.
    const [T, U, tDoc, uDoc, toU, s, e] = ins ? [B, A, newDoc, oldDoc, toA, h.b0, h.b1] : [A, B, oldDoc, newDoc, toB, h.a0, h.a1];
    const x = s > 0 ? toU[s - 1] : -1;
    if (x < 0 || e >= T.length || toU[e] !== x + 1) {
      out.push(h);
      continue;
    }
    /**
     * The labels are T[s-1-m] (matched to U[x-m]) and T[e-1-m], each followed
     * by m tokens that read the same on its line; m = 0 for "4.3".
     */
    const fits = (m: number) => {
      if (s - 1 - m < 0 || x - m < 0 || e - s <= m + 1) return false;
      for (let j = 0; j <= m; j++) if (toU[s - 1 - m + j] !== x - m + j) return false;
      const [p, q] = [T[s - 1 - m], T[e - 1 - m]];
      if (p.line === q.line || T[s - 1].line !== p.line || T[e - 1].line !== q.line) return false;
      const first = labelAt(tDoc, p.i);
      const last = labelAt(tDoc, q.i);
      const before = labelAt(uDoc, U[x - m].i);
      if (!same(first, last) || !before || !last) return false;
      const shift = ins ? labelShift(before, last, Infinity) : labelShift(last, before, Infinity);
      if (!shift || !sameColumn(labelBox(uDoc, U[x - m].i, before), labelBox(tDoc, q.i, last))) return false;
      // A shift of more than 3: as many items of the label's kind are inserted.
      return Math.abs(shift.delta) <= 3 || itemsIn(tDoc, T, s - 1 - m, e - 1 - m, last, q.i) === Math.abs(shift.delta);
    };
    let m = 0;
    while (m <= 8 && !fits(m)) {
      m++;
      if (s - m < 0 || T[s - m].key !== T[e - m].key) m = 9;
    }
    if (m > 8) {
      out.push(h);
      continue;
    }
    const [n, k] = [x - m, e - 1 - m];
    const label: Hunk = ins ? { a0: n, a1: n + 1, b0: k, b1: k + 1 } : { a0: k, a1: k + 1, b0: n, b1: n + 1 };
    out.push(ins ? { a0: n, a1: n, b0: s - 1 - m, b1: k } : { a0: s - 1 - m, a1: k, b0: n, b1: n }, label);
    labels.add(label);
    // The label's own tokens leave the inserted item's label; those after the number join the last one.
    const toT = ins ? toB : toA;
    for (let j = 0; j <= m; j++) {
      toU[s - 1 - m + j] = -1;
      toT[n + j] = -1;
    }
    for (let j = 1; j <= m; j++) {
      toU[k + j] = n + j;
      toT[n + j] = k + j;
    }
    moved = true;
  }
  if (!moved) return { hunks, pairs, labels };
  const kept: number[] = [];
  for (let a = 0; a < toB.length; a++) if (toB[a] >= 0) kept.push(a, toB[a]);
  return { hunks: out, pairs: Int32Array.from(kept), labels };
}

/**
 * A line at the foot of a page that flowed to the top of the next page,
 * where the next page starts with a repeated line (a table's header row):
 * the old version reads "… heading | header row | rows …", the new one
 * "… | header row | heading | rows …". The alignment keeps the header row
 * and gives the heading up on both sides ("Deleted “Motors”" + "Added
 * “Motors”"). Only text that reads the same, of at most a few lines, right
 * before the repeated line in one version and right after it in the other
 * is paired again (matched text; nothing changed but the page break). A
 * line-start label renumbered on the way (a table row "25." that became
 * "26.") is left as a change of its own, for extractRenumbering. The
 * repeated line must stand at the top of its page in both versions and
 * also as whole lines on an earlier page, like the header rows of
 * repeatedAtPageTop.
 */
function crossedPageBreak(ctx: Ctx, hunks: Hunk[], pairs: Int32Array): { hunks: Hunk[]; pairs: number[]; labels: Set<Hunk> } {
  const { A, B, oldDoc, newDoc } = ctx;
  /** A[a] and B[b] are line-start labels of one kind, one renumbered from the other ("25." → "26."). */
  const renumbered = (a: number, b: number) => {
    const x = labelAt(oldDoc, A[a].i) ?? rowNumberAt(oldDoc, A[a].i);
    const y = labelAt(newDoc, B[b].i) ?? rowNumberAt(newDoc, B[b].i);
    return !!x && !!y && x.len === y.len && !!labelShift(x, y, Infinity);
  };
  const toB = new Int32Array(A.length).fill(-1);
  for (let p = 0; p < pairs.length; p += 2) toB[pairs[p]] = pairs[p + 1];
  const lineStart = (T: Token[], k: number) => k === 0 || T[k - 1].line !== T[k].line;
  const lineEnd = (T: Token[], k: number) => k === T.length || T[k].line !== T[k - 1].line;
  const pageTop = (T: Token[], k: number) => {
    for (let j = k - 1; j >= 0 && T[j].page === T[k].page; j--) if (!T[j].furniture) return false;
    return true;
  };
  /** T[s, e) also stands as whole lines on an earlier page. */
  const repeatedEarlier = (T: Token[], s: number, e: number) => {
    for (let q = 0; q + (e - s) <= s && T[q].page < T[s].page; q++) {
      if (T[q].key !== T[s].key || !lineStart(T, q) || T[q + e - s - 1].page >= T[s].page || !lineEnd(T, q + e - s)) continue;
      let k = 1;
      while (k < e - s && T[q + k].key === T[s + k].key) k++;
      if (k === e - s) return true;
    }
    return false;
  };
  const dels = hunks.filter((h) => h.b0 === h.b1 && h.a1 > h.a0 && h.a1 - h.a0 <= 40);
  const out: number[] = [];
  const gone = new Set<Hunk>();
  const crossing = (d: Hunk, ins: Hunk) => {
    // Between them, the repeated line: matched word for word, nothing else.
    const n = ins.a0 - d.a1;
    if (n < 1 || n > 60 || ins.b0 - d.b0 !== n || ins.b1 - ins.b0 !== d.a1 - d.a0) return false;
    for (let k = 0; k < n; k++) if (toB[d.a1 + k] !== d.b0 + k) return false;
    for (let k = 0; k < d.a1 - d.a0; k++) if (A[d.a0 + k].key !== B[ins.b0 + k].key && !(k === 0 && renumbered(d.a0, ins.b0))) return false;
    const [x0, x1, y0, y1] = [d.a1, ins.a0, d.b0, ins.b0];
    if (A[x0].page === A[d.a1 - 1].page || !pageTop(A, x0) || !pageTop(B, y0) || B[y1 - 1].page !== B[ins.b0].page) return false;
    if (!lineStart(A, d.a0) || !lineEnd(A, d.a1) || !lineStart(B, ins.b0) || !lineEnd(B, ins.b1) || !lineStart(A, x0) || !lineEnd(A, x1)) return false;
    return repeatedEarlier(A, x0, x1) && repeatedEarlier(B, y0, y1);
  };
  // A row's label renumbered on the way ("25." → "26."): the two numbers
  // are left as a change of their own, for extractRenumbering.
  const labels = new Map<Hunk, Hunk>();
  for (const d of dels) {
    const ins = hunks.find((h) => h.a0 === h.a1 && h.a0 > d.a1 && h.a0 - d.a1 <= 60 && !gone.has(h) && crossing(d, h));
    if (!ins) continue;
    for (let k = 0; k < d.a1 - d.a0; k++) {
      if (A[d.a0 + k].key === B[ins.b0 + k].key) out.push(d.a0 + k, ins.b0 + k);
      else labels.set(d, { a0: d.a0, a1: d.a0 + 1, b0: ins.b0, b1: ins.b0 + 1 });
    }
    gone.add(d);
    gone.add(ins);
  }
  if (!gone.size) return { hunks, pairs: out, labels: new Set() };
  return { hunks: hunks.flatMap((h) => labels.get(h) ?? (gone.has(h) ? [] : [h])), pairs: out, labels: new Set(labels.values()) };
}

/**
 * A deleted passage of whole lines that reappears word for word inside an
 * inserted passage (or the other way round) is cut out of it, so it can be
 * paired with its other copy: a move, or, at the same place on the page,
 * no change at all (see detectMoves). This is what happens to a footnote
 * the alignment passed over when body text flowed onto the next page past
 * it: it came out as "deleted" and was part of the insertion around it.
 * Whole lines of at least three words are required, so a phrase that
 * merely recurs inside a new paragraph is left alone.
 */
function splitEmbedded(ctx: Ctx, hunks: Hunk[]): Hunk[] {
  const { A, B, ka, kb } = ctx;
  const words = (T: Token[], s: number, e: number) => {
    let n = 0;
    for (let k = s; k < e; k++) if (T[k].kind !== 'punct') n++;
    return n;
  };
  const whole = (T: Token[], s: number, e: number) => e > s && (s === 0 || T[s - 1].line !== T[s].line) && (e === T.length || T[e].line !== T[e - 1].line);
  let list = hunks;
  // Bounds the search on documents with very many edits.
  let budget = 20_000_000;
  for (const side of ['a', 'b'] as const) {
    // Needles: pure hunks on one side; haystacks: pure hunks on the other.
    const [N, H, kn, kh] = side === 'a' ? [A, B, ka, kb] : [B, A, kb, ka];
    const range = (h: Hunk, onN: boolean): [number, number] => ((side === 'a') === onN ? [h.a0, h.a1] : [h.b0, h.b1]);
    const isNeedle = (h: Hunk) => (side === 'a' ? h.b0 === h.b1 && h.a1 > h.a0 : h.a0 === h.a1 && h.b1 > h.b0);
    const isHay = (h: Hunk) => (side === 'a' ? h.a0 === h.a1 && h.b1 > h.b0 : h.b0 === h.b1 && h.a1 > h.a0);
    const cuts = new Map<Hunk, [number, number][]>();
    const hay = list.filter(isHay);
    for (const d of list) {
      if (!isNeedle(d)) continue;
      const [s, e] = range(d, true);
      const len = e - s;
      if (len > 400 || words(N, s, e) < 3 || !whole(N, s, e)) continue;
      found: for (const h of hay) {
        const [hs, he] = range(h, false);
        if (he - hs <= len) continue;
        budget -= he - hs;
        if (budget < 0) break found;
        for (let j = hs; j + len <= he; j++) {
          if (kh[j] !== kn[s]) continue;
          let k = 1;
          while (k < len && kh[j + k] === kn[s + k]) k++;
          if (k < len || !whole(H, j, j + len)) continue;
          const taken = cuts.get(h) ?? [];
          if (taken.some(([u, v]) => j < v && u < j + len)) continue;
          taken.push([j, j + len]);
          cuts.set(h, taken);
          break found;
        }
      }
    }
    if (!cuts.size) continue;
    list = list.flatMap((h) => {
      const c = cuts.get(h);
      if (!c) return [h];
      const [hs, he] = range(h, false);
      const bounds = [hs, ...c.sort((x, y) => x[0] - y[0]).flat(), he];
      const parts: Hunk[] = [];
      for (let k = 0; k + 1 < bounds.length; k++) {
        if (bounds[k + 1] <= bounds[k]) continue;
        parts.push(side === 'a' ? { a0: h.a0, a1: h.a1, b0: bounds[k], b1: bounds[k + 1] } : { a0: bounds[k], a1: bounds[k + 1], b0: h.b0, b1: h.b1 });
      }
      return parts;
    });
  }
  return list;
}

// ---------------------------------------------------------------- moves ---

interface Moves {
  moves: Change[];
  /** Edits inside moved passages, reported as their own changes. */
  inner: Change[];
  /** Equal ops pairing the unchanged words of each moved passage. */
  innerOps: DiffOp[];
  /** Pairs [a, b, a, b, …] of text that did not move on the page, only in the reading order. */
  inPlace: number[];
  rest: Hunk[];
}

/**
 * A deleted passage that reappears elsewhere is a move. Pairing uses an
 * order-aware similarity (matched words in sequence, not a bag of words),
 * and the two texts are then diffed, so a figure or a negation changed
 * inside a moved paragraph is reported as its own change, located in both
 * versions, rather than hidden behind "Moved a paragraph".
 *
 * Both sides of a rewrite are offered too: two paragraphs swapped around a
 * third ("X Y Z" → "Z Y X") align as "X → Z" and "Z → X", which are two
 * moves, not two rewrites. A short passage (a table row, a line of fewer
 * than six words) is a move only when it is whole lines in both versions
 * and matches nearly word for word.
 */
function detectMoves(ctx: Ctx, hunks: Hunk[], fold: (eq: Span, before: Span, after: Span) => boolean, oldToNew: number[]): Moves {
  const MIN = 6;
  const SIM = 0.8;
  const SHORT_SIM = 0.7;
  const MAX_SWAP = 300;
  const { ka, kb } = ctx;
  const wholeLines = (T: Token[], s: number, e: number) =>
    e > s && (s === 0 || T[s - 1].line !== T[s].line) && (e === T.length || T[e].line !== T[e - 1].line);
  const content = (keys: Int32Array, toks: Token[], s: number, e: number) => {
    const m = new Map<number, number>();
    let n = 0;
    for (let k = s; k < e; k++) {
      if (toks[k].kind === 'punct') continue;
      m.set(keys[k], (m.get(keys[k]) ?? 0) + 1);
      n++;
    }
    return { m, n };
  };
  // A side of a rewrite only when both its sides are (nearly) whole lines
  // (whole paragraphs, or sentences set one to a line): a rewrite of part of
  // a line is an edit in place. Short passages: pure deletions and
  // insertions of whole lines only.
  const most = (T: Token[], s: number, e: number) => {
    const words = (from: number, to: number) => T.slice(from, to).filter((t) => t.kind !== 'punct').length;
    let from = s;
    while (from > 0 && T[from - 1].line === T[s].line) from--;
    let to = e;
    while (to < T.length && T[to].line === T[e - 1].line) to++;
    return words(s, e) >= 0.8 * words(from, to);
  };
  // (Up to MAX_SWAP tokens a side, which bounds the work on long rewrites.)
  const paragraphs = (h: Hunk) => h.a1 - h.a0 <= MAX_SWAP && h.b1 - h.b0 <= MAX_SWAP && most(ctx.A, h.a0, h.a1) && most(ctx.B, h.b0, h.b1);
  const dels = hunks
    .map((h, idx) => ({ h, idx, short: false, ...content(ka, ctx.A, h.a0, h.a1) }))
    .filter(
      (d) =>
        d.h.a1 > d.h.a0 &&
        (d.h.b0 === d.h.b1 ? d.n >= MIN || (d.n >= 2 && (d.short = wholeLines(ctx.A, d.h.a0, d.h.a1))) : d.n >= MIN && paragraphs(d.h)),
    );
  const inss = hunks
    .map((h, idx) => ({ h, idx, short: false, ...content(kb, ctx.B, h.b0, h.b1) }))
    .filter(
      (d) =>
        d.h.b1 > d.h.b0 &&
        (d.h.a0 === d.h.a1 ? d.n >= MIN || (d.n >= 2 && (d.short = wholeLines(ctx.B, d.h.b0, d.h.b1))) : d.n >= MIN && paragraphs(d.h)),
    );
  const candidates: { d: number; i: number; sim: number; matches: Int32Array }[] = [];
  dels.forEach((d, di) =>
    inss.forEach((ins, ii) => {
      // The two sides of one rewrite are not a move.
      if (d.idx === ins.idx) return;
      const short = d.short || ins.short;
      if (short && !(d.short && ins.short)) return;
      const need = short ? SHORT_SIM : SIM;
      if (Math.min(d.n, ins.n) / Math.max(d.n, ins.n) < 0.7) return;
      // The bag of words bounds the in-order similarity from above: a cheap filter.
      let common = 0;
      for (const [k, c] of d.m) common += Math.min(c, ins.m.get(k) ?? 0);
      if ((2 * common) / (d.n + ins.n) < need) return;
      const matches = matchSequences(ka.subarray(d.h.a0, d.h.a1), kb.subarray(ins.h.b0, ins.h.b1));
      let inOrder = 0;
      for (let p = 0; p < matches.length; p += 2) if (ctx.A[d.h.a0 + matches[p]].kind !== 'punct') inOrder++;
      const sim = (2 * inOrder) / (d.n + ins.n);
      if (sim >= need) candidates.push({ d: di, i: ii, sim, matches });
    }),
  );
  candidates.sort((x, y) => y.sim - x.sim);
  const usedD = new Set<number>();
  const usedI = new Set<number>();
  /** Hunks whose old side (A) or new side (B) became part of a move. */
  const movedA = new Set<number>();
  const movedB = new Set<number>();
  const out: Moves = { moves: [], inner: [], innerOps: [], inPlace: [], rest: [] };
  /**
   * The passage stands at the same place on the page in both versions (each
   * word within 2 pt, on pages the page map pairs) and reads the same: it
   * only comes at another point of the content stream, e.g. a repeated
   * table header row written after the rows of the page before, or a
   * footnote that the alignment passed over. Nothing moved, so nothing is
   * reported: it is matched text.
   */
  const inPlace = (d: Hunk, ins: Hunk) => {
    if (d.a1 - d.a0 !== ins.b1 - ins.b0) return false;
    for (let k = 0; k < d.a1 - d.a0; k++) {
      const a = ctx.A[d.a0 + k];
      const b = ctx.B[ins.b0 + k];
      if (a.key !== b.key || oldToNew[a.page] !== b.page || a.rects.length !== b.rects.length) return false;
      for (let r = 0; r < a.rects.length; r++)
        if (Math.abs(a.rects[r].x - b.rects[r].x) > 2 || Math.abs(a.rects[r].y - b.rects[r].y) > 2) return false;
    }
    return true;
  };
  for (const c of candidates) {
    if (usedD.has(c.d) || usedI.has(c.i)) continue;
    const d = dels[c.d];
    const ins = inss[c.i];
    if (movedA.has(d.idx) || movedB.has(ins.idx)) continue;
    usedD.add(c.d);
    usedI.add(c.i);
    movedA.add(d.idx);
    movedB.add(ins.idx);
    // Diff the moved text against its old wording.
    const local = opsFromMatches(c.matches, d.h.a1 - d.h.a0, ins.h.b1 - ins.h.b0);
    const ops = refine(
      ctx,
      local.map((o) => ({ ...o, a0: o.a0 + d.h.a0, a1: o.a1 + d.h.a0, b0: o.b0 + ins.h.b0, b1: o.b1 + ins.h.b0 })),
      fold,
    );
    // A full stop at the edge of the moved text that the alignment gave to
    // the paragraph next to it ("…asked." | "…report.") is not an edit: the
    // same mark sits right beside the moved text in the other version.
    const sameMarks = (T: Token[], s: number, e: number, U: Token[], u: number) =>
      e > s && T.slice(s, e).every((t, j) => t.kind === 'punct' && U[u + j]?.key === t.key);
    const edgeMark = (h: Hunk) =>
      (h.b0 === h.b1 && h.a1 === d.h.a1 && sameMarks(ctx.A, h.a0, h.a1, ctx.B, ins.h.b1)) ||
      (h.a0 === h.a1 && h.b1 === ins.h.b1 && sameMarks(ctx.B, h.b0, h.b1, ctx.A, d.h.a1)) ||
      (h.b0 === h.b1 && h.a0 === d.h.a0 && sameMarks(ctx.A, h.a0, h.a1, ctx.B, ins.h.b0 - (h.a1 - h.a0))) ||
      (h.a0 === h.a1 && h.b0 === ins.h.b0 && sameMarks(ctx.B, h.b0, h.b1, ctx.A, d.h.a0 - (h.b1 - h.b0)));
    const edits = hunksOf(ops)
      .filter((h) => !edgeMark(h))
      .flatMap((h) => splitHunk(ctx, h))
      .map((h) => textChange(ctx, h));
    if (inPlace(d.h, ins.h)) {
      for (let k = 0; k < d.h.a1 - d.h.a0; k++) out.inPlace.push(d.h.a0 + k, ins.h.b0 + k);
      out.innerOps.push({ type: 'equal', a0: d.h.a0, a1: d.h.a1, b0: ins.h.b0, b1: ins.h.b1 });
      continue;
    }
    for (const e of edits) e.inMove = '';
    out.inner.push(...edits);
    out.innerOps.push(...ops.filter((o) => o.type === 'equal'));
    const oldSide = makeSide(ctx.A, d.h.a0, d.h.a1, false);
    const newSide = makeSide(ctx.B, ins.h.b0, ins.h.b1, false);
    const toks = ctx.B.slice(ins.h.b0, ins.h.b1).filter((t) => t.kind !== 'punct');
    const [cb, ca] = context(ctx.B, ins.h.b0, ins.h.b1);
    const move: Change = {
      id: '',
      kind: 'move',
      category: 'text',
      old: oldSide,
      new: newSide,
      size: toks.length,
      cjk: toks.filter((t) => t.kind === 'cjk').length / Math.max(1, toks.length) > 0.5,
      contextBefore: cb,
      contextAfter: ca,
      wholeParagraphs: wholeBlocks(ctx.blocksB, ctx.B, ins.h.b0, ins.h.b1) || undefined,
      order: sideOrder(newSide, ctx.newDoc),
    };
    if (edits.length) move.moveEdits = edits.length;
    out.moves.push(move);
  }
  // What is left of a rewrite whose other side moved is a plain insertion
  // or deletion.
  hunks.forEach((h, idx) => {
    const a = movedA.has(idx);
    const b = movedB.has(idx);
    if (!a && !b) out.rest.push(h);
    else if (a && !b && h.b1 > h.b0) out.rest.push({ a0: h.a0, a1: h.a0, b0: h.b0, b1: h.b1 });
    else if (b && !a && h.a1 > h.a0) out.rest.push({ a0: h.a0, a1: h.a1, b0: h.b0, b1: h.b0 });
  });
  return out;
}

// ----------------------------------------------------------- formatting ---

interface Style {
  family: string;
  bold: boolean;
  italic: boolean;
}

const styles = new Map<string, Style>();

function styleOf(font: string): Style {
  let s = styles.get(font);
  if (!s) styles.set(font, (s = parseStyle(font)));
  return s;
}

function parseStyle(font: string): Style {
  const f = font.toLowerCase();
  const bold = /bold|black|heavy|semibold|demi|w[6-9]\b/.test(f);
  const italic = /italic|oblique|-it\b|kursiv/.test(f);
  const family = f
    .replace(/^[a-z]{6}\+/, '')
    .split(/[-,]/)[0]
    .replace(/(ps|mt|psmt|std|pro|regular|roman|bold|italic|oblique|light|medium)+$/g, '')
    .replace(/[^a-z0-9]/g, '');
  return { family, bold, italic };
}

function formatDiff(a: Token, b: Token): FormatDetail | null {
  const sa = styleOf(a.font);
  const sb = styleOf(b.font);
  const d: FormatDetail = {};
  if (sa.bold !== sb.bold) sa.bold ? (d.boldRemoved = true) : (d.boldAdded = true);
  if (sa.italic !== sb.italic) sa.italic ? (d.italicRemoved = true) : (d.italicAdded = true);
  if (Math.abs(a.size - b.size) > Math.max(0.3, 0.08 * Math.max(a.size, b.size))) {
    d.sizeFrom = Math.round(a.size * 10) / 10;
    d.sizeTo = Math.round(b.size * 10) / 10;
  }
  if (sa.family && sb.family && sa.family !== sb.family) {
    d.fontFrom = a.font;
    d.fontTo = b.font;
  }
  return Object.keys(d).length ? d : null;
}

/**
 * The runs of matched text of a pairing as equal ops, with an unequal op
 * between runs that are not contiguous (where the formatting groups of
 * detectFormatting end).
 */
function opsOfPairs(pairs: Int32Array): DiffOp[] {
  const ops: DiffOp[] = [];
  for (let p = 0; p < pairs.length; p += 2) {
    const [a, b] = [pairs[p], pairs[p + 1]];
    const last = ops[ops.length - 1];
    if (last && last.a1 === a && last.b1 === b) {
      last.a1++;
      last.b1++;
      continue;
    }
    if (last) ops.push({ type: 'delete', a0: last.a1, a1: a, b0: last.b1, b1: b });
    ops.push({ type: 'equal', a0: a, a1: a + 1, b0: b, b1: b + 1 });
  }
  return ops;
}

/** Formatting changes of matched words. */
function detectFormatting(ctx: Ctx, ops: DiffOp[]): Change[] {
  const out: Change[] = [];
  let group: { a: number[]; b: number[]; sig: string; detail: FormatDetail } | null = null;
  const flush = () => {
    if (!group) return;
    const ta = group.a.map((k) => ctx.A[k]);
    const tb = group.b.map((k) => ctx.B[k]);
    if (ta.some((t) => t.kind !== 'punct')) {
      const oldRects = rectsOf(ta);
      const newRects = rectsOf(tb);
      const newSide: Side = { pages: [...new Set(newRects.map((r) => r.page))], rects: newRects, text: joinTokens(tb), start: tb[0].i, end: tb[tb.length - 1].i + 1 };
      const words = tb.filter((t) => t.kind !== 'punct');
      out.push({
        id: '',
        kind: 'format',
        category: 'visual',
        old: { pages: [...new Set(oldRects.map((r) => r.page))], rects: oldRects, text: joinTokens(ta), start: ta[0].i, end: ta[ta.length - 1].i + 1 },
        new: newSide,
        format: group.detail,
        size: words.length,
        cjk: words.filter((t) => t.kind === 'cjk').length / Math.max(1, words.length) > 0.5,
        contextBefore: '',
        contextAfter: '',
        order: sideOrder(newSide, ctx.newDoc),
      });
    }
    group = null;
  };
  for (const op of ops) {
    if (op.type !== 'equal') {
      flush();
      continue;
    }
    for (let k = 0; k < op.a1 - op.a0; k++) {
      const ia = op.a0 + k;
      const ib = op.b0 + k;
      const a = ctx.A[ia];
      const b = ctx.B[ib];
      const d = formatDiff(a, b);
      if (!d) {
        // Punctuation inside a re-formatted phrase does not break the group.
        if (group && a.kind === 'punct') continue;
        flush();
        continue;
      }
      const sig = JSON.stringify(d);
      const lastA: Token | undefined = group ? ctx.A[group.a[group.a.length - 1]] : undefined;
      if (group && group.sig === sig && lastA && lastA.page === a.page && lastA.block === a.block) {
        group.a.push(ia);
        group.b.push(ib);
      } else {
        flush();
        group = { a: [ia], b: [ib], sig, detail: d };
      }
    }
  }
  flush();
  return out;
}

// ------------------------------------------------------------- page map ---

function pageMap(oldDoc: DocModel, newDoc: DocModel, A: Token[], B: Token[], pairs: Int32Array) {
  const weights = new Map<string, PageLink>();
  for (let p = 0; p < pairs.length; p += 2) {
    const op = A[pairs[p]].page;
    const np = B[pairs[p + 1]].page;
    const key = op + ':' + np;
    const l = weights.get(key);
    if (l) l.weight++;
    else weights.set(key, { oldPage: op, newPage: np, weight: 1 });
  }
  const links = [...weights.values()].sort((a, b) => a.oldPage - b.oldPage || a.newPage - b.newPage);
  /** For each page on one side, the page on the other side sharing most text. */
  const best = (n: number, otherCount: number, from: (l: PageLink) => number, to: (l: PageLink) => number) => {
    const arr = new Array<number>(n).fill(-1);
    const w = new Array<number>(n).fill(0);
    for (const l of links) {
      const i = from(l);
      if (l.weight > w[i]) {
        w[i] = l.weight;
        arr[i] = to(l);
      }
    }
    // Pages without text (e.g. a full-page image): interpolate from neighbours.
    const known = arr.slice();
    for (let i = 0; i < n; i++) {
      if (known[i] !== -1) continue;
      let p = i - 1;
      while (p >= 0 && known[p] === -1) p--;
      let q = i + 1;
      while (q < n && known[q] === -1) q++;
      let guess = -1;
      if (p >= 0 && q < n) guess = known[q] - known[p] === q - p ? known[p] + (i - p) : -1;
      else if (p >= 0) guess = known[p] + (i - p);
      else if (q < n) guess = known[q] - (q - i);
      arr[i] = guess >= 0 && guess < otherCount ? guess : -1;
    }
    return arr;
  };
  return {
    links,
    oldToNew: best(oldDoc.pages.length, newDoc.pages.length, (l) => l.oldPage, (l) => l.newPage),
    newToOld: best(newDoc.pages.length, oldDoc.pages.length, (l) => l.newPage, (l) => l.oldPage),
  };
}

function validPairs(pairs: [number, number][], nOld: number, nNew: number): [number, number][] {
  const seen = new Set<string>();
  return pairs.filter(([o, n]) => {
    const ok = Number.isInteger(o) && Number.isInteger(n) && o >= 0 && n >= 0 && o < nOld && n < nNew && !seen.has(`${o}:${n}`);
    seen.add(`${o}:${n}`);
    return ok;
  });
}

/**
 * Manual pairs add page-top anchors for synchronised scrolling. Text anchors
 * that contradict a manual pair are dropped, so the reviewer's pairing wins.
 */
function withManualAnchors(anchors: Anchor[], manual: [number, number][], oldDoc: DocModel, newDoc: DocModel): Anchor[] {
  if (!manual.length) return anchors;
  const pos = (page: number, y: number, doc: DocModel) => page + y / (doc.pages[page]?.height || 1);
  const marks = manual
    .map(([o, n]) => ({ oldPage: o, oldY: 0, newPage: n, newY: 0 }))
    .sort((a, b) => a.oldPage - b.oldPage);
  const consistent = (a: Anchor) =>
    marks.every((m) => {
      const ao = pos(a.oldPage, a.oldY, oldDoc) - m.oldPage;
      const an = pos(a.newPage, a.newY, newDoc) - m.newPage;
      return (ao >= 0 && an >= 0) || (ao < 0 && an < 0);
    });
  const merged = [...anchors.filter(consistent), ...marks].sort(
    (a, b) => pos(a.oldPage, a.oldY, oldDoc) - pos(b.oldPage, b.oldY, oldDoc) || pos(a.newPage, a.newY, newDoc) - pos(b.newPage, b.newY, newDoc),
  );
  const out: Anchor[] = [];
  for (const a of merged) {
    const last = out[out.length - 1];
    if (last && pos(a.newPage, a.newY, newDoc) < pos(last.newPage, last.newY, newDoc)) continue;
    out.push(a);
  }
  return out;
}

function buildAnchors(A: Token[], B: Token[], pairs: Int32Array): Anchor[] {
  const anchors: Anchor[] = [];
  let lastLine = -1;
  let last: Anchor | null = null;
  for (let p = 0; p < pairs.length; p += 2) {
    const a = A[pairs[p]];
    const b = B[pairs[p + 1]];
    if (a.line === lastLine) continue;
    lastLine = a.line;
    const anc: Anchor = { oldPage: a.page, oldY: a.rects[0].y, newPage: b.page, newY: b.rects[0].y };
    if (last) {
      const oldAfter = anc.oldPage > last.oldPage || (anc.oldPage === last.oldPage && anc.oldY >= last.oldY);
      const newAfter = anc.newPage > last.newPage || (anc.newPage === last.newPage && anc.newY >= last.newY);
      if (!oldAfter || !newAfter) continue;
    }
    anchors.push(anc);
    last = anc;
  }
  return anchors;
}

// ------------------------------------------------------------------ main ---

export function compareDocs(oldDoc: DocModel, newDoc: DocModel, opts: Partial<DiffOptions> = {}): CompareResult {
  const options: DiffOptions = { ...defaultOptions, ...opts };
  syncFurniture(oldDoc, newDoc);
  syncHyphenation(oldDoc, newDoc);
  const include = (t: Token) =>
    !(options.ignoreFurniture && t.furniture) && !(options.ignorePunctuation && t.kind === 'punct');
  const keyOf = (t: Token) => {
    const k = baseKey(t.text);
    return options.ignoreCase ? k.toLowerCase() : k;
  };
  const A = oldDoc.tokens.filter(include);
  const B = newDoc.tokens.filter(include);
  for (const t of A) t.key = keyOf(t);
  for (const t of B) t.key = keyOf(t);
  const [ka, kb] = intern(
    A.map((t) => t.key),
    B.map((t) => t.key),
  );
  const ctx: Ctx = { oldDoc, newDoc, A, B, ka, kb, blocksA: blockRanges(A), blocksB: blockRanges(B) };
  const weak = new Uint8Array(ka.length + kb.length);
  for (let i = 0; i < A.length; i++) if (A[i].kind === 'number' || A[i].kind === 'punct') weak[ka[i]] = 1;
  for (let j = 0; j < B.length; j++) if (B[j].kind === 'number' || B[j].kind === 'punct') weak[kb[j]] = 1;
  const info: MatchInfo = { unaligned: 0, weak };
  const initial = opsFromMatches(matchSequences(ka, kb, info), A.length, B.length);
  const ops = refine(ctx, initial, foldRule(ctx, initial));
  const fold = foldRule(ctx);

  // Final matched pairs after clean-up.
  const pairList: number[] = [];
  for (const op of ops) if (op.type === 'equal') for (let k = 0; k < op.a1 - op.a0; k++) pairList.push(op.a0 + k, op.b0 + k);
  const pairs0 = Int32Array.from(pairList);
  let pairs: Int32Array = pairs0;

  // Split at paragraph boundaries first, so a paragraph moved next to an
  // edit of the paragraph before it is still a pure insertion.
  // A header row repeated at a page top that came or went with a page
  // break is set aside first, so it is not paired with another copy as a
  // move either.
  const relabelled = relabel(ctx, hunksOf(ops).flatMap((h) => splitAtBlocks(ctx, h)), pairs);
  pairs = relabelled.pairs;
  const crossed = crossedPageBreak(ctx, splitEmbedded(ctx, relabelled.hunks), pairs);
  const hunks = crossed.hunks;
  const repeated = repeatedAtPageTop(ctx, hunks, pairs);
  const moved = detectMoves(ctx, hunks.filter((h) => !repeated.has(h)), fold, pageMap(oldDoc, newDoc, A, B, pairs).oldToNew);
  moved.inPlace.push(...crossed.pairs);
  // A label paired by relabel stays one change even across a block or page boundary.
  const changes: Change[] = [
    ...moved.rest.flatMap((h) => (relabelled.labels.has(h) || crossed.labels.has(h) ? [h] : splitHunk(ctx, h))).map((h) => textChange(ctx, h)),
    ...moved.moves,
    ...moved.inner,
  ];
  const repeatedLines = [...repeated].map((h) => {
    const c = textChange(ctx, h);
    c.minor = true;
    c.consequence = 'repeatedLine';
    return c;
  });
  mergeNearby(changes, oldDoc, newDoc);
  markDuplicates(changes, B);
  // Matched text, by document token: the new token facing each old one (or -1).
  const newOfOld = new Int32Array(oldDoc.tokens.length).fill(-1);
  for (const list of [pairs, moved.inPlace]) for (let p = 0; p < list.length; p += 2) newOfOld[A[list[p]].i] = B[list[p + 1]].i;
  const renumbered = extractRenumbering(changes, oldDoc, newDoc, newOfOld);
  aggregateReplacements(changes);
  if (options.detectFormatting) {
    // The final pairing: relabel may have paired a label and the words after it anew.
    const formats = [...detectFormatting(ctx, relabelled.pairs === pairs0 ? ops : opsOfPairs(relabelled.pairs)), ...detectFormatting(ctx, moved.innerOps)];
    changes.push(...aggregateFormatting(formats, ctx, pairs));
    changes.push(...detectPositions(ctx, pairs));
  }
  const map = pageMap(oldDoc, newDoc, A, B, pairs);
  const manual = validPairs(options.manualPairs ?? [], oldDoc.pages.length, newDoc.pages.length);
  for (const [o, n] of manual) {
    map.oldToNew[o] = n;
    map.newToOld[n] = o;
    map.links.push({ oldPage: o, newPage: n, weight: 0, manual: true });
  }
  const overflow = findOverflow(oldDoc, newDoc, A, B, pairs);
  foldClipped(changes, overflow, oldDoc, newDoc, newOfOld);
  changes.push(...overflow);

  sortAndNumber(changes);
  // Consequences kept apart (shown on request), numbered like the visual stage numbers them.
  const minor = [...renumbered, ...repeatedLines].sort((x, y) => x.order - y.order);
  minor.forEach((c, k) => (c.id = 'm' + (k + 1)));

  return {
    oldDoc,
    newDoc,
    changes,
    pageLinks: map.links,
    oldToNew: map.oldToNew,
    newToOld: map.newToOld,
    anchors: withManualAnchors(buildAnchors(A, B, pairs), manual, oldDoc, newDoc),
    // Text that only stands elsewhere in the reading order, at the same
    // place on the page (see detectMoves), is matched text too.
    matches: Int32Array.from([...pairs, ...moved.inPlace], (v, k) => (k % 2 === 0 ? A[v].i : B[v].i)),
    options,
    coverage: {
      old: coverageOf(oldDoc),
      new: { ...coverageOf(newDoc), uncertain: uncertainPages(newDoc, B, pairs, moved.innerOps, [...moved.rest, ...repeated].filter((h) => h.a0 === h.a1)) },
    },
    ignored: {
      furniture: options.ignoreFurniture ? furnitureDifferences(oldDoc, newDoc) : 0,
      caseOnly: options.ignoreCase ? caseOnlyDifferences(A, B, pairs) : 0,
      minorShifts: 0,
      renumbered: renumbered.length,
      repeatedLines: repeatedLines.length,
    },
    minor,
    stats: {
      oldTokens: A.length,
      newTokens: B.length,
      matchedTokens: pairs.length / 2,
      similarity: A.length + B.length ? pairs.length / (A.length + B.length) : 1,
      unalignedTokens: info.unaligned,
    },
  };
}

/**
 * Unchanged lines that moved sideways on the page (e.g. a stamp moved from
 * left to right, a heading re-aligned). Only lines that are intact in both
 * versions are considered, so ordinary re-flow never triggers this; the
 * displacement is measured against the page's typical displacement. A line
 * set in a wider or narrower font (also one whose font was substituted)
 * keeps its alignment edge (left, centre or right), so the edge that moved
 * least counts. A line that re-flowed into the other column or another part
 * of the page (its vertical position jumped far more than the page's lines
 * did, and it now runs in a column with the line before or after it) did
 * not move sideways.
 */
function detectPositions(ctx: Ctx, pairs: Int32Array): Change[] {
  const { A, oldDoc, newDoc } = ctx;
  const byOldLine = new Map<number, number[]>();
  for (let p = 0; p < pairs.length; p += 2) {
    const a = A[pairs[p]];
    let arr = byOldLine.get(a.line);
    if (!arr) byOldLine.set(a.line, (arr = []));
    arr.push(p);
  }
  const B = ctx.B;
  const countNewLine = new Map<number, number>();
  for (const t of B) countNewLine.set(t.line, (countNewLine.get(t.line) ?? 0) + 1);
  const countOldLine = new Map<number, number>();
  for (const t of A) countOldLine.set(t.line, (countOldLine.get(t.line) ?? 0) + 1);
  /** Displacement of the left edge, the centre and the right edge, and of the top. */
  type Moved = { oldLine: number; newLine: number; edges: [number, number, number]; dy: number; page: [number, number] };
  const intact: Moved[] = [];
  for (const [ol, ps] of byOldLine) {
    const newLines = new Set(ps.map((p) => B[pairs[p + 1]].line));
    if (newLines.size !== 1) continue;
    const nl = [...newLines][0];
    // Every comparable token of both lines is matched to the other line.
    if (ps.length !== countOldLine.get(ol) || ps.length !== countNewLine.get(nl)) continue;
    const op = oldDoc.lines[ol].page;
    const np = newDoc.lines[nl].page;
    // Positions are not comparable when the page's text runs in another direction (e.g. /Rotate changed).
    if ((oldDoc.pages[op].textAngle ?? 0) !== (newDoc.pages[np].textAngle ?? 0)) continue;
    const lo = oldDoc.lines[ol].rect;
    const ln = newDoc.lines[nl].rect;
    const dl = ln.x - lo.x;
    const dr = ln.x + ln.w - (lo.x + lo.w);
    intact.push({ oldLine: ol, newLine: nl, edges: [dl, (dl + dr) / 2, dr], dy: ln.y - lo.y, page: [op, np] });
  }
  /** The line runs in a column with the line before or after it in the new version (same left edge, next line down or up). */
  const inColumn = (nl: number) => {
    const l = newDoc.lines[nl];
    return [newDoc.lines[nl - 1], newDoc.lines[nl + 1]].some(
      (o) => !!o && !o.furniture && o.page === l.page && Math.abs(o.rect.x - l.rect.x) < 2 && Math.abs(o.rect.y - l.rect.y) < 2.5 * l.rect.h,
    );
  };
  /** Displacement relative to `t` of the edge that moved closest to `t`. */
  const nearest = (m: Moved, t: number) => m.edges.reduce((best, e) => (Math.abs(e - t) < Math.abs(best - t) ? e : best)) - t;
  const out: Change[] = [];
  const byPair = new Map<string, Moved[]>();
  for (const m of intact) {
    const k = m.page.join(':');
    let list = byPair.get(k);
    if (!list) byPair.set(k, (list = []));
    list.push(m);
  }
  for (const list of byPair.values()) {
    if (list.length < 3) continue;
    // The page's own displacement (e.g. new margins).
    const typical = list.map((m) => nearest(m, 0)).sort((u, v) => u - v)[list.length >> 1];
    const typicalDy = list.map((m) => m.dy).sort((u, v) => u - v)[list.length >> 1];
    // The page's displacement of each edge on its own: with new margins on
    // justified text the left edges all move by -14 pt and the right edges by
    // +14 pt, so the last (ragged) line of a paragraph, which keeps only its
    // left edge, moved with the page and not by itself.
    const median = (k: 0 | 1 | 2) => list.map((m) => m.edges[k]).sort((u, v) => u - v)[list.length >> 1];
    const typicalEdge = [median(0), median(1), median(2)];
    for (const m of list) {
      const rel = nearest(m, typical);
      if (Math.abs(rel) <= 12) continue;
      if (m.edges.some((e, k) => Math.abs(e - typicalEdge[k]) <= 12)) continue;
      const lo = oldDoc.lines[m.oldLine];
      const ln = newDoc.lines[m.newLine];
      if (Math.abs(m.dy - typicalDy) > Math.max(36, 3 * lo.rect.h) && inColumn(m.newLine)) continue;
      const words = newDoc.tokens.slice(ln.start, ln.end).filter((t) => t.kind !== 'punct');
      const newSide: Side = { pages: [ln.page], rects: [{ page: ln.page, rect: ln.rect }], text: ln.text, start: ln.start, end: ln.end };
      out.push({
        id: '',
        kind: 'position',
        category: 'visual',
        old: { pages: [lo.page], rects: [{ page: lo.page, rect: lo.rect }], text: lo.text, start: lo.start, end: lo.end },
        new: newSide,
        shift: { dx: rel, dy: 0 },
        size: words.length,
        cjk: words.filter((t) => t.kind === 'cjk').length / Math.max(1, words.length) > 0.5,
        contextBefore: '',
        contextAfter: '',
        order: sideOrder(newSide, newDoc),
      });
    }
  }
  return out;
}

/**
 * A formatting change applied throughout the document (a font replaced, a
 * heading size changed everywhere) becomes one change listing every place,
 * instead of one entry per paragraph. Only systematic changes are
 * aggregated: the places cover at least half of the text that had the old
 * style, or each place is whole lines (every heading made bold, every table
 * set in another font while the body keeps its font). Three unrelated words
 * set in bold inside paragraphs stay three changes.
 * The aggregated change's `old.rects` / `new.rects` cover every place, and
 * `parts` keeps each place's own text and location.
 */
function aggregateFormatting(changes: Change[], ctx: Ctx, pairs: Int32Array): Change[] {
  const fam = (n?: string) => (n ? styleOf(n).family : '');
  const key = (c: Change) => {
    const f = c.format ?? {};
    return JSON.stringify([!!f.boldAdded, !!f.boldRemoved, !!f.italicAdded, !!f.italicRemoved, f.sizeFrom, f.sizeTo, fam(f.fontFrom), fam(f.fontTo)]);
  };
  const groups = new Map<string, Change[]>();
  for (const c of changes) {
    const k = key(c);
    let list = groups.get(k);
    if (!list) groups.set(k, (list = []));
    list.push(c);
  }
  /** Matched words of the old version that have the style the change starts from. */
  const withOldStyle = (f: FormatDetail) => {
    let n = 0;
    for (let p = 0; p < pairs.length; p += 2) {
      const a = ctx.A[pairs[p]];
      if (a.kind === 'punct') continue;
      const s = styleOf(a.font);
      if (f.boldAdded && s.bold) continue;
      if (f.boldRemoved && !s.bold) continue;
      if (f.italicAdded && s.italic) continue;
      if (f.italicRemoved && !s.italic) continue;
      if (f.sizeFrom !== undefined && Math.round(a.size * 10) / 10 !== f.sizeFrom) continue;
      if (f.fontFrom && s.family !== fam(f.fontFrom)) continue;
      n++;
    }
    return n;
  };
  /** The place covers whole lines of the old version. */
  const wholeLines = (c: Change) => {
    const { start, end } = c.old;
    if (start === undefined || end === undefined) return false;
    const doc = ctx.oldDoc;
    return doc.lines[doc.tokens[start].line].start === start && doc.lines[doc.tokens[end - 1].line].end === end;
  };
  const out: Change[] = [];
  for (const list of groups.values()) {
    const words = list.reduce((n, c) => n + c.size, 0);
    if (list.length < 3 || (words < 0.5 * withOldStyle(list[0].format ?? {}) && !list.every(wholeLines))) {
      out.push(...list);
      continue;
    }
    const first = list[0];
    const merged: Change = {
      ...first,
      old: { ...first.old, rects: list.flatMap((c) => c.old.rects), pages: [...new Set(list.flatMap((c) => c.old.pages))].sort((a, b) => a - b) },
      new: { ...first.new, rects: list.flatMap((c) => c.new.rects), pages: [...new Set(list.flatMap((c) => c.new.pages))].sort((a, b) => a - b) },
      size: words,
      places: list.length,
      parts: list.map((c) => ({ old: c.old, new: c.new })),
    };
    out.push(merged);
  }
  return out;
}

/** A clause, list or row label at the start of a line (see labelAt). */
interface Label {
  /** The levels of the number: "8.4.1" → [8, 4, 1]. */
  parts: number[];
  /** 'list': "4." / "4)" / "8.4" set apart from its text; 'cell': a bare row number in a table's first column. */
  style: 'list' | 'cell';
  line: number;
  /** Tokens the label takes: 2 when a mark is written onto the number ("4." → "4" + "."). */
  len: number;
}

/**
 * The levels of a clause number: none is 0, and the first has no leading
 * zero ("09.00", "0.8", "12.00" are a time, a measure and a time). Deeper
 * levels may be padded ("1.01", "2.07": the Section 1.01 style).
 */
const clauseLevels = (levels: string[]) => !levels.some((p) => Number(p) === 0) && !(levels[0].length > 1 && levels[0][0] === '0');

/**
 * The label that token k (a document token index) is, if any: the first
 * token of its line and set apart from the text after it.
 * - "4." "4)" "4、": a bare integer followed by that mark (as before).
 * - "8.4", "8.4.1", "8.4." (the mark is part of the label): a multi-level
 *   clause number followed by a gap (a tab, at least half an em) and either
 *   starting its paragraph, hanging (the paragraph's other lines start
 *   where the text after the label starts), or standing in a column of
 *   such numbers (single-line clauses without paragraph spacing). A
 *   wrapped line that happens to start with a figure ("8.4 percent") is
 *   none of these, so it stays an ordinary number. Clause numbers have no
 *   level 0 and no leading zero in the first level (see clauseLevels):
 *   "09.00", "12.00" and "0.8" in a table's first cell are times and a
 *   measure.
 * - "7": a bare integer that starts a paragraph (a table row) and stands in
 *   a cell of its own (the next text is at least an em away, or there is
 *   none).
 * Full-width digits and marks ("１．") count as their ASCII forms.
 * Whether a label is part of a numbered list is decided by its neighbours
 * (see numberedRun).
 */
function labelAt(doc: DocModel, k: number | undefined): Label | null {
  if (k === undefined) return null;
  const t = doc.tokens[k];
  if (!t || t.kind !== 'number') return null;
  const line = doc.lines[t.line];
  if (!line || line.start !== k) return null;
  // Full-width digits and marks ("１．") read as their ASCII forms.
  const text = t.text.normalize('NFKC');
  const next = k + 1 < line.end ? doc.tokens[k + 1] : undefined;
  const mark = !!next && !next.spaceBefore && /^[.)、]$/.test(next.text.normalize('NFKC'));
  const r = t.rects[t.rects.length - 1];
  const gap = next ? next.rects[0].x - (r.x + r.w) : Infinity;
  const blockStart = k === 0 || doc.tokens[k - 1].block !== t.block;
  if (/^\d{1,3}$/.test(text)) {
    if (mark) return { parts: [Number(text)], style: 'list', line: t.line, len: 2 };
    if (blockStart && gap >= t.size) return { parts: [Number(text)], style: 'cell', line: t.line, len: 1 };
    return null;
  }
  const m = /^(\d{1,3}(?:\.\d{1,3}){1,4})\.?$/.exec(text);
  if (!m) return null;
  // A mark written onto the number ("4.3."): the label ends after it.
  const len = mark ? 2 : 1;
  const last = doc.tokens[k + len - 1];
  const after = k + len < line.end ? doc.tokens[k + len] : undefined;
  const re = last.rects[last.rects.length - 1];
  if (after && after.rects[0].x - (re.x + re.w) < 0.5 * t.size) return null;
  const levels = m[1].split('.');
  if (!clauseLevels(levels)) return null;
  const hanging = () => {
    if (!after) return false;
    const x = after.rects[0].x;
    for (let j = Math.max(0, t.line - 12); j < Math.min(doc.lines.length, t.line + 12); j++) {
      const l = doc.lines[j];
      if (j !== t.line && l.block === t.block && Math.abs(l.rect.x - x) < 1.5) return true;
    }
    return false;
  };
  /**
   * A column of clause numbers: the nearest line above or below in the same
   * block that starts with a number (up to 3 lines away) starts with a
   * clause number of the same depth at the same x, its text where this
   * line's text starts. Single-line clauses set without paragraph spacing
   * share one block and do not hang.
   */
  const column = () => {
    if (!after) return false;
    for (const dir of [-1, 1]) {
      for (let j = t.line + dir; Math.abs(j - t.line) <= 3; j += dir) {
        const l = doc.lines[j];
        if (!l || l.block !== t.block) break;
        const u = doc.tokens[l.start];
        if (l.end <= l.start || u.kind !== 'number') continue;
        const um = /^(\d{1,3}(?:\.\d{1,3}){1,4})\.?$/.exec(u.text.normalize('NFKC'));
        if (!um || um[1].split('.').length !== levels.length || Math.abs(u.rects[0].x - t.rects[0].x) > 1.5) break;
        const v = l.start + 1 < l.end ? doc.tokens[l.start + 1] : undefined;
        const w = v && !v.spaceBefore && /^[.)、]$/.test(v.text.normalize('NFKC')) ? (l.start + 2 < l.end ? doc.tokens[l.start + 2] : undefined) : v;
        if (w && Math.abs(w.rects[0].x - after.rects[0].x) < 1.5) return true;
        break;
      }
    }
    return false;
  };
  if (!blockStart && !hanging() && !column()) return null;
  return { parts: levels.map(Number), style: 'list', line: t.line, len };
}

/**
 * How label a became label b when it was renumbered: exactly one level
 * changed, by at most `max`, and every deeper level is the same ("8.4" →
 * "8.5" and "8.4.1" → "8.5.1" shift the same level of the same parent).
 */
function labelShift(a: Label, b: Label, max = 3): { level: number; delta: number } | null {
  if (a.style !== b.style || a.parts.length !== b.parts.length) return null;
  let level = -1;
  for (let i = 0; i < a.parts.length; i++) {
    if (a.parts[i] === b.parts[i]) continue;
    if (level >= 0) return null;
    level = i;
  }
  if (level < 0) return null;
  const delta = b.parts[level] - a.parts[level];
  if (Math.abs(delta) > max) return null;
  return { level, delta };
}

/** A line-start label in the list of its siblings (see labelSequences). */
interface Sibling {
  /** Document token index of the label. */
  tok: number;
  label: Label;
  box: LabelBox;
  /** The siblings, this one included, in reading order. */
  list: Sibling[];
  index: number;
  /** Position among all labels of the document. */
  pos: number;
}

/**
 * A bare integer that starts a line and stands in a cell of its own (the
 * next text is at least an em away, or there is none): a row number, also
 * where the table's text blocks do not start at the row (labelAt asks for
 * that). Used with labelAt to read a column of row numbers as a whole (see
 * labelSequences); whether it is one is decided by numberedRun.
 */
function rowNumberAt(doc: DocModel, k: number): Label | null {
  const t = doc.tokens[k];
  const text = t?.text.normalize('NFKC');
  if (!t || t.kind !== 'number' || !/^\d{1,3}$/.test(text)) return null;
  const line = doc.lines[t.line];
  const next = k + 1 < line.end ? doc.tokens[k + 1] : undefined;
  const r = t.rects[t.rects.length - 1];
  if (next && next.rects[0].x - (r.x + r.w) < t.size) return null;
  return { parts: [Number(text)], style: 'cell', line: t.line, len: 1 };
}

/** Where a label stands on its page: its left and right edge (the mark included), its font size, and its weight and slant ("b", "i", "bi" or ""). */
interface LabelBox {
  x0: number;
  x1: number;
  size: number;
  face: string;
}

function labelBox(doc: DocModel, k: number, label: Label): LabelBox {
  const t = doc.tokens[k];
  const last = doc.tokens[k + label.len - 1];
  const r = last.rects[last.rects.length - 1];
  const { bold, italic } = styleOf(t.font);
  return { x0: t.rects[0].x, x1: r.x + r.w, size: t.size, face: (bold ? 'b' : '') + (italic ? 'i' : '') };
}

/** Set at the same size and in the same column: the same left edge, right edge or centre, within 2 pt (typed labels, right-aligned markers "9." / "10.", centred row numbers). */
function sameColumn(p: LabelBox, q: LabelBox): boolean {
  if (Math.abs(p.size - q.size) > 0.06 * Math.max(p.size, q.size)) return false;
  return Math.abs(p.x0 - q.x0) <= 2 || Math.abs(p.x1 - q.x1) <= 2 || Math.abs(p.x0 + p.x1 - q.x0 - q.x1) <= 4;
}

/**
 * Two labels of one document in the same role: in the same column (see
 * sameColumn) and in the same weight and slant. Headings and the steps
 * under them (also bold headings at the steps' size in the steps' column),
 * an outer list and the list nested in one of its items, a table's row
 * numbers and the figures in another of its columns, and a figure that a
 * wrapped line starts with in the text column are different lists even
 * when their labels look alike. A list split this way only lists more: a
 * run that breaks no longer numbers on from 1.
 */
function sameRole(p: LabelBox, q: LabelBox): boolean {
  return p.face === q.face && sameColumn(p, q);
}

/**
 * The line-start labels of a document (running headers and footers left
 * out), each in the list of its siblings: labels of the same style with the
 * same number of levels under the same parent ("4.1", "4.2", "4.3" under
 * clause 4; "1.", "2.", "3." at the top level; a table's row numbers), in
 * the same role (see sameRole). A label joins the most recent list whose
 * last label is in its column and whose labels are in its weight. A single
 * label set in another weight (one item's label made bold) joins the list
 * when it numbers on from the list's last label and no list is in its own
 * role.
 */
function labelSequences(doc: DocModel): { at: Map<number, Sibling>; all: Sibling[] } {
  const at = new Map<number, Sibling>();
  const all: Sibling[] = [];
  const lists = new Map<string, Sibling[][]>();
  /** The weight and slant of a list's labels: those of its first label. */
  const faces = new Map<Sibling[], string>();
  for (const line of doc.lines) {
    if (line.furniture || line.end <= line.start) continue;
    const label = labelAt(doc, line.start) ?? rowNumberAt(doc, line.start);
    if (!label) continue;
    const key = `${label.style}|${label.parts.length}|${label.parts.slice(0, -1).join('.')}`;
    const box = labelBox(doc, line.start, label);
    let groups = lists.get(key);
    if (!groups) lists.set(key, (groups = []));
    // The most recent lists; a few are enough.
    let list: Sibling[] | undefined;
    let other: Sibling[] | undefined;
    let best = -1;
    let bestOther = -1;
    for (let g = groups.length - 1; g >= Math.max(0, groups.length - 32); g--) {
      const last = groups[g][groups[g].length - 1];
      if (!sameColumn(last.box, box)) continue;
      if (faces.get(groups[g]) === box.face) {
        if (last.pos > best) [list, best] = [groups[g], last.pos];
      } else if (last.pos > bestOther && lastLevel(last) + 1 === label.parts[label.parts.length - 1]) [other, bestOther] = [groups[g], last.pos];
    }
    list ??= other;
    if (!list) {
      groups.push((list = []));
      faces.set(list, box.face);
    }
    const s: Sibling = { tok: line.start, label, box, list, index: list.length, pos: all.length };
    list.push(s);
    at.set(line.start, s);
    all.push(s);
  }
  return { at, all };
}

const lastLevel = (s: Sibling) => s.label.parts[s.label.parts.length - 1];

/**
 * The siblings before s that number on to it without a gap from 1 ("4.1",
 * "4.2" before "4.3"; a list that starts again at 1 starts a new run). Null
 * when s does not number on from 1: after a gap or a repeated number, or a
 * figure that only looks like a label (a time "10.30", a quantity column
 * "2, 3, 4", a date). With `continued`, a list of "N." items may also start
 * at its first label in the document, at any number (paragraphs 12.–19. of
 * a schedule that continue the agreement's numbering); see runStart.
 */
function numberedRun(s: Sibling, continued = false): Sibling[] | null {
  let i = s.index;
  while (i > 0 && lastLevel(s.list[i - 1]) === lastLevel(s.list[i]) - 1) i--;
  if (lastLevel(s.list[i]) === 1) return s.list.slice(i, s.index);
  return continued && i === 0 && s.label.style === 'list' && s.label.parts.length === 1 ? s.list.slice(0, s.index) : null;
}

/** The label a run (see numberedRun) of s starts at. */
const runStart = (s: Sibling, run: Sibling[]) => lastLevel(run[0] ?? s);

/** Header words of a column of quantities ("Qty", "Menge", "数量"): its figures are amounts, never row numbers. */
const QUANTITY_HEADER = /^(?:qty|qtys|quantity|quantities|menge|anzahl|stk|pcs|units?|qté|quantité|cantidad|cant|quantità|aantal|数量|件数|台数)$/i;

/** The header cell above a run's first row number (the nearest line above that starts in its column) names a column of quantities. */
function quantityColumn(doc: DocModel, first: Sibling): boolean {
  const t = doc.tokens[first.tok];
  const r = t.rects[0];
  for (let j = first.label.line - 1; j >= Math.max(0, first.label.line - 8); j--) {
    const l = doc.lines[j];
    if (l.page !== t.page) break;
    if (l.end <= l.start) continue;
    const q = doc.tokens[l.start].rects[0];
    if (q.x >= r.x + r.w + 2 || r.x >= q.x + q.w + 2) continue;
    // Its first word (CJK characters are tokens of their own: 数|量).
    let k = l.start + 1;
    while (k < l.end && !doc.tokens[k].spaceBefore && doc.tokens[k].kind !== 'punct') k++;
    return QUANTITY_HEADER.test(doc.tokens.slice(l.start, k).map((x) => x.text).join(''));
  }
  return false;
}

/** A redline display of a list label: "4.3[4.4]" (renumbered, old number in brackets) or "[4.3]" (the label of a deleted item). */
const REDLINE_LABEL = /^(?:(\d{1,3}(?:\.\d{1,3})*)\.?)?\[(\d{1,3}(?:\.\d{1,3})*)\.?\]$/;

/**
 * List numbers that changed only because numbered items were added,
 * removed or moved. They are consequences, not edits: taken out of the
 * change list (shown on request) and counted. Each needs positive evidence;
 * a label that changed without it is listed.
 * - List, clause and row labels ("4." → "5.", "8.4" → "8.5", a table's row
 *   number "7" → "8"): one level changed, and
 *   (1) the label numbers on from 1 among its siblings in both versions,
 *       with no gap and no repeated number (see numberedRun): times,
 *       dates, quantities and isolated figures do not. Siblings are the
 *       labels of the same level under the same parent, in the same role
 *       (see sameRole): headings and the steps under them, or an outer and
 *       a nested list, are not siblings. A list of "N." items may also
 *       start at its first label, when it starts at the same number in
 *       both versions (paragraphs 12.–19. that continue another part's
 *       numbering);
 *   (2) the shift equals the number of siblings above it that are in the
 *       new version only (added, or moved there) minus those in the old
 *       version only (removed, or moved away). A sibling counts only when
 *       its label is not matched text: it lies in an insertion, deletion,
 *       move or replacement that is listed.
 *   So a clause inserted as 8.3 explains 8.3 → 8.4 and 8.4 → 8.5, but not
 *   8.4 → 8.6, not a label changed in another section, and not a list
 *   renumbered by hand with nothing added or removed. A column of row
 *   numbers headed "Qty" (or similar) is a column of figures.
 * - Sub-clauses that follow their clause ("8.4.1" → "8.5.1"): the clause
 *   label above it at the level that changed is itself such a consequence.
 *   When the last level changed too ("8.4.1" → "8.5.2"), its shift must
 *   also equal the net number of sub-clauses added under the new clause,
 *   as in (2).
 * - The label at the start of a moved passage (and its sub-clauses), which
 *   takes the number of its new place ("7.2" → "3.4"): both numbers number
 *   on from 1 among their siblings (as in (1)), and the new one fits its
 *   place (see fitsPlace: not "3.1" after "3.3"); the move stays "Moved",
 *   not "Moved and edited". A figure at the start of a moved table row
 *   ("0.8" → "1.5") is an edit inside the move.
 * - A tracked-change display of a renumbered label ("4.3[4.4]", "[4.3]" in a
 *   PDF exported with changes shown): brackets and numbers inserted around
 *   a line-start label, the bracketed number of the same shape as the label
 *   (one level apart by at most 3: "2.5[1]", a footnote marker on a value,
 *   is an edit), with the label kept from the other version as evidence
 *   (see redlineEvidence: "3" → "3[1]", a footnote marker on a row number,
 *   is an edit).
 * A cross-reference in running text is always listed.
 */
function extractRenumbering(changes: Change[], oldDoc: DocModel, newDoc: DocModel, newOfOld: Int32Array): Change[] {
  const out: Change[] = [];
  const take = (c: Change) => {
    c.minor = true;
    c.consequence = 'renumber';
    out.push(c);
  };
  const oldLabels = labelSequences(oldDoc);
  const newLabels = labelSequences(newDoc);
  const single = (c: Change) => c.old.start !== undefined && c.new.start !== undefined && c.old.end === c.old.start + 1 && c.new.end === c.new.start + 1;
  /** A label of s's parent ("3" for "3.1") stands between siblings p and q: q may start again at 1. */
  const newParent = (labels: { all: Sibling[] }, p: Sibling, q: Sibling) => {
    for (let i = p.pos + 1; i < q.pos; i++) {
      const parts = labels.all[i].label.parts;
      if (parts.length < q.label.parts.length && parts.every((v, k) => v === q.label.parts[k])) return true;
    }
    return false;
  };
  /**
   * A clause label that fits where it stands among its siblings: it does
   * not start again at 1 right after siblings of the same parent ("3.1"
   * after "3.3"), and the next sibling numbers on from it or starts again
   * under a new parent. Single-level lists start again at 1 after any text.
   */
  const fitsPlace = (labels: { all: Sibling[] }, s: Sibling) => {
    if (s.label.parts.length < 2) return true;
    const p = s.list[s.index - 1];
    if (p && lastLevel(s) === 1 && !newParent(labels, p, s)) return false;
    const n = s.list[s.index + 1];
    return !n || lastLevel(n) === lastLevel(s) + 1 || (lastLevel(n) === 1 && newParent(labels, s, n));
  };
  const moves = changes.filter((c) => c.kind === 'move');
  const inside = (s: Side, m: Side) => s.start !== undefined && m.start !== undefined && m.start <= s.start && s.start < m.end!;
  const moveOf = (c: Change) => (c.inMove === undefined ? undefined : moves.find((m) => (c.old.start !== undefined ? inside(c.old, m.old) : inside(c.new, m.new))));

  // The label at the head of a moved passage, and labels inside it that
  // keep their tail below the head's number ("7.2.1" → "3.4.1").
  const heads = new Map<Change, { a: number[]; b: number[] }>();
  for (const c of changes) {
    if (c.kind !== 'replace' || !c.numeric || !single(c)) continue;
    const m = moveOf(c);
    if (!m || c.old.start !== m.old.start || c.new.start !== m.new.start) continue;
    const a = oldLabels.at.get(c.old.start!);
    const b = newLabels.at.get(c.new.start!);
    if (!a || !b || a.label.style !== 'list' || b.label.style !== 'list' || a.label.parts.length !== b.label.parts.length) continue;
    if (!numberedRun(a) || !numberedRun(b) || !fitsPlace(newLabels, b)) continue;
    heads.set(m, { a: a.label.parts, b: b.label.parts });
    take(c);
  }
  for (const c of changes) {
    if (c.kind !== 'replace' || !c.numeric || c.consequence || !single(c)) continue;
    const m = moveOf(c);
    const head = m && heads.get(m);
    if (!head) continue;
    const a = labelAt(oldDoc, c.old.start);
    const b = labelAt(newDoc, c.new.start);
    const n = head.a.length;
    if (!a || !b || a.parts.length <= n || a.parts.length !== b.parts.length) continue;
    const same = (x: number[], y: number[]) => x.length === y.length && x.every((v, i) => v === y[i]);
    if (same(a.parts.slice(0, n), head.a) && same(b.parts.slice(0, n), head.b) && same(a.parts.slice(n), b.parts.slice(n))) take(c);
  }
  for (const [m] of heads) {
    const own = out.filter((c) => moveOf(c) === m).length;
    if (m.moveEdits) m.moveEdits = m.moveEdits - own || undefined;
  }

  // Tokens paired across the versions: as matched text, or one label
  // replaced by another.
  const oldOfNew = new Int32Array(newDoc.tokens.length).fill(-1);
  for (let k = 0; k < newOfOld.length; k++) if (newOfOld[k] >= 0) oldOfNew[newOfOld[k]] = k;
  const replacedOld = new Map<number, number>();
  const replacedNew = new Map<number, number>();
  for (const c of changes) {
    if (c.kind !== 'replace' || !single(c)) continue;
    replacedOld.set(c.old.start!, c.new.start!);
    replacedNew.set(c.new.start!, c.old.start!);
  }

  type Cand = { c: Change; a: Sibling; b: Sibling; level: number; delta: number };
  const cands: Cand[] = [];
  /** Labels whose last level and one level above it changed ("4.3.1" → "4.4.2"). */
  const twos: (Cand & { parent: number })[] = [];
  const twoLevelShift = (a: Label, b: Label) => {
    if (a.style !== b.style || a.parts.length !== b.parts.length || a.parts.length < 2) return null;
    const last = a.parts.length - 1;
    const diff = a.parts.map((v, k) => (v !== b.parts[k] ? k : -1)).filter((k) => k >= 0);
    return diff.length === 2 && diff[1] === last ? { parent: diff[0], level: last, delta: b.parts[last] - a.parts[last] } : null;
  };
  for (const c of changes) {
    if (c.kind !== 'replace' || !c.numeric || c.consequence || c.inMove !== undefined || !single(c)) continue;
    const a = oldLabels.at.get(c.old.start!);
    const b = newLabels.at.get(c.new.start!);
    // Any shift: the net number of added siblings must equal it (see net).
    const shift = a && b && labelShift(a.label, b.label, Infinity);
    if (shift) cands.push({ c, a: a!, b: b!, ...shift });
    else if (a && b) {
      const two = twoLevelShift(a.label, b.label);
      if (two) twos.push({ c, a, b, ...two });
    }
  }
  /**
   * The siblings above x's label in one version and not the other (see (2)
   * above): added minus removed. Null when that cannot be known: a
   * sibling's label is matched text that is not a label in the other
   * version (the labels were read differently), or its counterpart is an
   * earlier sibling outside the other run (labels swapped, a list numbered
   * again from 1).
   */
  const net = (x: Cand): number | null => {
    const ra = numberedRun(x.a, true);
    const rb = numberedRun(x.b, true);
    if (!ra || !rb) return null;
    // A list that does not start at 1 starts at the same number in both versions.
    const from = runStart(x.a, ra);
    if ((from !== 1 || runStart(x.b, rb) !== 1) && from !== runStart(x.b, rb)) return null;
    if (x.a.label.style === 'cell' && (quantityColumn(oldDoc, ra[0] ?? x.a) || quantityColumn(newDoc, rb[0] ?? x.b))) return null;
    const count = (run: Sibling[], other: Sibling, matched: Int32Array, replaced: Map<number, number>, labels: { at: Map<number, Sibling> }) => {
      const inOther = new Set((numberedRun(other, true) ?? []).map((s) => s.tok));
      let k = 0;
      for (const s of run) {
        const m = matched[s.tok];
        const o = m >= 0 ? m : replaced.get(s.tok);
        // Not matched: the label is part of a listed insertion, deletion or move.
        if (o === undefined) {
          k++;
          continue;
        }
        if (inOther.has(o)) continue;
        const so = labels.at.get(o);
        if (!so ? m >= 0 : so.list === other.list && so.index < other.index) return null;
        k++;
      }
      return k;
    };
    const added = count(rb, x.a, oldOfNew, replacedNew, oldLabels);
    const removed = count(ra, x.b, newOfOld, replacedOld, newLabels);
    return added === null || removed === null ? null : added - removed;
  };
  // Clause and list items first, then their sub-clauses.
  const accepted = new Map<number, number>();
  for (const x of cands) {
    if (x.level !== x.a.label.parts.length - 1 || net(x) !== x.delta) continue;
    take(x.c);
    accepted.set(x.a.tok, x.b.tok);
  }
  /** The label above s at `level` that s belongs to ("4.4" for "4.4.2" at level 1), if the nearest label at that level or higher is it. */
  const ancestor = (labels: { all: Sibling[] }, s: Sibling, level: number): Sibling | null => {
    for (let i = s.pos - 1; i >= 0; i--) {
      const p = labels.all[i].label.parts;
      if (p.length > level + 1) continue;
      return p.length === level + 1 && p.every((v, k) => v === s.label.parts[k]) ? labels.all[i] : null;
    }
    return null;
  };
  for (const x of cands) {
    if (x.c.consequence || x.level >= x.a.label.parts.length - 1) continue;
    const pa = ancestor(oldLabels, x.a, x.level);
    const pb = ancestor(newLabels, x.b, x.level);
    if (pa && pb && accepted.get(pa.tok) === pb.tok) take(x.c);
  }
  // Both: the clause above it renumbered (accepted), and sub-clauses added
  // or removed above it under that clause explain the last level.
  for (const x of twos) {
    const pa = ancestor(oldLabels, x.a, x.parent);
    const pb = ancestor(newLabels, x.b, x.parent);
    if (pa && pb && accepted.get(pa.tok) === pb.tok && net(x) === x.delta) take(x.c);
  }

  // Tracked-change displays of list labels: insertions (or deletions) of
  // brackets and numbers inside a line-start label cluster such as
  // "4.3[4.4]". One consequence per label.
  /** The cluster is a label and its other number: of one shape, one level apart by at most 3 ("4.3[4.4]"), or a bracketed label like the labels before it ("[4.3]" after "4.2"). */
  const labelShaped = (text: string, doc: DocModel, line: number) => {
    const m = REDLINE_LABEL.exec(text);
    if (!m) return false;
    const parse = (s: string): Label | null => {
      const levels = s.split('.');
      if (!clauseLevels(levels)) return null;
      return { parts: levels.map(Number), style: 'list', line, len: 1 };
    };
    const inner = parse(m[2]);
    if (!inner) return false;
    if (m[1] !== undefined) {
      const outer = parse(m[1]);
      return !!outer && !!labelShift(outer, inner);
    }
    const labels = doc === newDoc ? newLabels : oldLabels;
    let before: Sibling | undefined;
    for (const s of labels.all) if (s.label.line < line) before = s;
    return !!before && before.label.style === 'list' && before.label.parts.length === inner.parts.length;
  };
  /** The numbers of a line's first cluster ("4.3[4.4]" → now 4.3, before 4.4; a label "4.2" → both 4.2), if it is a label or a display of one. */
  const clusterAt = (doc: DocModel, l: Line): { now: number[] | null; before: number[]; tok: number } | null => {
    let end = l.start + 1;
    while (end < l.end && !doc.tokens[end].spaceBefore) end++;
    const m = REDLINE_LABEL.exec(doc.tokens.slice(l.start, end).map((t) => t.text).join('').normalize('NFKC'));
    const parts = (x: string) => x.split('.').map(Number);
    if (m) return { now: m[1] === undefined ? null : parts(m[1]), before: parts(m[2]), tok: l.start };
    const label = labelAt(doc, l.start);
    return label ? { now: label.parts, before: label.parts, tok: l.start } : null;
  };
  const sameParts = (x: number[] | null, y: number[]) => !!x && x.length === y.length && x.every((v, k) => v === y[k]);
  /**
   * Evidence that the line-start cluster of `line` (tokens up to `end`), a
   * label display "A[B]" or "[B]" in one version, shows the label B had
   * before it became A, where `changed` tells the tokens that are not in
   * the other version. The number kept from the other version must be that
   * version's label at the line. Kept B: the other version still numbers
   * the item B (it is the original). Kept A: the other version is the one
   * with the change accepted, and B must number on in this version from
   * the label above it: one more than that label's former number ("[4.3]"
   * or "4.2[4.3]" above "4.3[4.4]"). A display with no label above it is
   * not one.
   */
  const redlineEvidence = (doc: DocModel, line: number, end: number, changed: (i: number) => boolean) => {
    const l = doc.lines[line];
    const toks = doc.tokens.slice(l.start, end);
    const open = toks.findIndex((t) => t.text === '[');
    const outer = toks.slice(0, Math.max(0, open)).filter((t) => t.kind === 'number');
    const inner = toks.slice(open + 1).filter((t) => t.kind === 'number');
    if (open < 0 || inner.length !== 1 || outer.length > 1) return false;
    const [matched, other] = doc === newDoc ? [oldOfNew, oldLabels] : [newOfOld, newLabels];
    const keptAs = (t: Token) => {
      if (changed(t.i)) return false;
      const o = matched[t.i];
      const s = o >= 0 ? other.at.get(o) : undefined;
      return !!s && sameParts(s.label.parts, t.text.normalize('NFKC').split('.').map(Number));
    };
    const b = inner[0].text.normalize('NFKC').split('.').map(Number);
    if (keptAs(inner[0])) return outer.every((t) => changed(t.i));
    if (outer.length !== 1 || !keptAs(outer[0]) || !changed(inner[0].i)) return false;
    for (let j = line - 1; j >= Math.max(0, line - 60); j--) {
      const lj = doc.lines[j];
      if (lj.furniture || lj.end <= lj.start) continue;
      const prev = clusterAt(doc, lj);
      if (!prev || prev.before.length > b.length) continue;
      if (prev.before.length < b.length) return false;
      return prev.before.slice(0, -1).every((v, k) => v === b[k]) && prev.before[b.length - 1] + 1 === b[b.length - 1];
    }
    return false;
  };
  const clusters = new Map<string, Change[]>();
  for (const c of changes) {
    if (c.consequence || (c.kind !== 'insert' && c.kind !== 'delete')) continue;
    const doc = c.kind === 'insert' ? newDoc : oldDoc;
    const side = c.kind === 'insert' ? c.new : c.old;
    if (side.start === undefined) continue;
    const first = doc.tokens[side.start];
    const line = doc.lines[first.line];
    let end = line.start + 1;
    while (end < line.end && !doc.tokens[end].spaceBefore) end++;
    if (side.end! > end || !labelShaped(doc.tokens.slice(line.start, end).map((t) => t.text).join('').normalize('NFKC'), doc, first.line)) continue;
    const k = `${c.kind}:${first.line}`;
    let list = clusters.get(k);
    if (!list) clusters.set(k, (list = []));
    list.push(c);
  }
  const absorbed = new Set<Change>();
  for (const [k, list] of clusters) {
    const c = list[0];
    const doc = c.kind === 'insert' ? newDoc : oldDoc;
    const line = doc.lines[Number(k.split(':')[1])];
    let end = line.start + 1;
    while (end < line.end && !doc.tokens[end].spaceBefore) end++;
    // The label itself is in both versions ("4.4" in "4.3[4.4]"): only its
    // display changed. A bracketed label that is wholly new ("[1]" put in
    // front of a reference) is an edit, and so is a footnote marker put on a
    // row number ("3" → "3[1]"): see redlineEvidence.
    const sideOf = (x: Change) => (x.kind === 'insert' ? x.new : x.old);
    const changed = (i: number) => list.some((x) => sideOf(x).start! <= i && i < sideOf(x).end!);
    if (!redlineEvidence(doc, line.id, end, changed)) continue;
    const toks = doc.tokens.slice(line.start, end);
    const rects = rectsOf(toks);
    const side: Side = { pages: [line.page], rects, text: joinTokens(toks), start: line.start, end };
    if (c.kind === 'insert') c.new = side;
    else c.old = side;
    c.size = 0;
    c.wholeParagraphs = undefined;
    take(c);
    for (const o of list.slice(1)) absorbed.add(o);
  }
  for (const c of [...out, ...absorbed]) {
    const at = changes.indexOf(c);
    if (at >= 0) changes.splice(at, 1);
  }
  return out;
}

/**
 * A table's header row is repeated at the top of each page the table runs
 * onto, so when a page break moves, a copy appears at the top of a page in
 * one version and disappears from a page top in the other. Such a copy is a
 * consequence of re-pagination, not an edit: a pure insertion or deletion of
 * whole lines that are the first body lines of their page, whose text
 * occurs as whole lines on an earlier page of the same version, and where
 * the text that follows it on the page sits below other text of its page
 * in the other version (the page break really moved there). It is taken out
 * of the change list (shown on request) and counted. A line deliberately
 * added or removed at a page top that repeats an earlier line, where the
 * page break also moved, would be hidden the same way, but still counted.
 */
function repeatedAtPageTop(ctx: Ctx, hunks: Hunk[], pairs: Int32Array): Set<Hunk> {
  const { A, B } = ctx;
  const out = new Set<Hunk>();
  const pure = hunks.filter((h) => h.a1 > h.a0 !== h.b1 > h.b0);
  if (!pure.length) return out;
  const toB = new Int32Array(A.length).fill(-1);
  const toA = new Int32Array(B.length).fill(-1);
  for (let p = 0; p < pairs.length; p += 2) {
    toB[pairs[p]] = pairs[p + 1];
    toA[pairs[p + 1]] = pairs[p];
  }
  const lineStart = (T: Token[], k: number) => k === 0 || T[k - 1].line !== T[k].line;
  const lineEnd = (T: Token[], k: number) => k === T.length || T[k].line !== T[k - 1].line;
  /** Body text comes before token k on its page (running headers, when compared, do not count). */
  const below = (T: Token[], k: number) => {
    for (let j = k - 1; j >= 0 && T[j].page === T[k].page; j--) if (!T[j].furniture) return true;
    return false;
  };
  for (const h of pure) {
    const del = h.a1 > h.a0;
    const [T, U, s, e, match] = del ? [A, B, h.a0, h.a1, toB] : [B, A, h.b0, h.b1, toA];
    const page = T[s].page;
    // Whole lines (at most a few: a header row), first on their page.
    if (e - s > 60 || below(T, s) || !lineStart(T, s) || T[e - 1].page !== page || !lineEnd(T, e)) continue;
    let earlier = false;
    for (let q = 0; q + (e - s) <= s && T[q].page < page && !earlier; q++) {
      if (T[q].key !== T[s].key || !lineStart(T, q) || T[q + e - s - 1].page >= page || !lineEnd(T, q + e - s)) continue;
      earlier = true;
      for (let k = 1; k < e - s && earlier; k++) earlier = T[q + k].key === T[s + k].key;
    }
    if (!earlier) continue;
    let k = e;
    while (k < T.length && T[k].page === page && match[k] < 0) k++;
    if (k >= T.length || T[k].page !== page) continue;
    if (below(U, match[k])) out.add(h);
  }
  return out;
}

/**
 * The same replacement in several places (a party renamed throughout, one
 * price changed in every table) becomes one change listing all places.
 */
function aggregateReplacements(changes: Change[]): void {
  const groups = new Map<string, Change[]>();
  for (const c of changes) {
    if (c.kind !== 'replace') continue;
    const k = c.old.text + '\u0000' + c.new.text;
    let list = groups.get(k);
    if (!list) groups.set(k, (list = []));
    list.push(c);
  }
  const absorbed = new Set<Change>();
  for (const list of groups.values()) {
    if (list.length < 3) continue;
    const first = list[0];
    const parts = list.map((c) => ({ old: c.old, new: c.new }));
    first.old = { ...first.old, rects: list.flatMap((c) => c.old.rects), pages: [...new Set(list.flatMap((c) => c.old.pages))].sort((a, b) => a - b) };
    first.new = { ...first.new, rects: list.flatMap((c) => c.new.rects), pages: [...new Set(list.flatMap((c) => c.new.pages))].sort((a, b) => a - b) };
    first.places = list.length;
    first.parts = parts;
    first.size = list.reduce((n, c) => n + c.size, 0);
    for (const c of list.slice(1)) absorbed.add(c);
  }
  if (absorbed.size) {
    const kept = changes.filter((c) => !absorbed.has(c));
    changes.splice(0, changes.length, ...kept);
  }
}

/** Insertions of ≥ 10 words whose exact text also appears elsewhere in the new version. */
function markDuplicates(changes: Change[], B: Token[]): void {
  const sep = '\u0001';
  const keys = B.map((t) => t.key);
  const joined = sep + keys.join(sep) + sep;
  // Offsets of each token in the joined string.
  const offset: number[] = [];
  let pos = 1;
  for (const k of keys) {
    offset.push(pos);
    pos += k.length + 1;
  }
  const indexOfToken = new Map<number, number>(B.map((t, k) => [t.i, k]));
  for (const c of changes) {
    if (c.kind !== 'insert' || c.new.start === undefined || c.size < 10) continue;
    const b0 = indexOfToken.get(c.new.start);
    const b1 = indexOfToken.get(c.new.end! - 1);
    if (b0 === undefined || b1 === undefined) continue;
    const needle = sep + keys.slice(b0, b1 + 1).join(sep) + sep;
    let at = joined.indexOf(needle);
    while (at >= 0) {
      const k = offset.indexOf(at + 1);
      if (k >= 0 && (k + (b1 - b0) < b0 || k > b1)) {
        c.duplicateOf = B[k].page;
        break;
      }
      at = joined.indexOf(needle, at + 1);
    }
  }
}

/**
 * New pages with ≥ 20 words of which less than half are matched to the old
 * version. Words of a moved passage count as matched; punctuation (a
 * signature rule, dot leaders) does not count. A page whose other words are
 * (nearly all) plainly added — an inserted or duplicated page, reported as
 * added text — is not uncertain: less than a quarter of its words may be
 * neither matched nor added.
 */
function uncertainPages(doc: DocModel, B: Token[], pairs: Int32Array, moved: DiffOp[], inserted: Hunk[]): { page: number; matched: number }[] {
  const total = new Map<number, number>();
  const matched = new Map<number, number>();
  const added = new Map<number, number>();
  const count = (m: Map<number, number>, t: Token) => {
    if (t.kind !== 'punct') m.set(t.page, (m.get(t.page) ?? 0) + 1);
  };
  for (const t of B) count(total, t);
  for (let p = 1; p < pairs.length; p += 2) count(matched, B[pairs[p]]);
  for (const op of moved) for (let j = op.b0; j < op.b1; j++) count(matched, B[j]);
  for (const h of inserted) for (let j = h.b0; j < h.b1; j++) count(added, B[j]);
  const out: { page: number; matched: number }[] = [];
  for (const pg of doc.pages) {
    const n = total.get(pg.index) ?? 0;
    const m = matched.get(pg.index) ?? 0;
    const rest = n - m - (added.get(pg.index) ?? 0);
    if (n >= 20 && m / n < 0.5 && rest >= 0.25 * n) out.push({ page: pg.index, matched: Math.round((m / n) * 100) / 100 });
  }
  return out;
}

function coverageOf(doc: DocModel): Coverage {
  const byPage = new Map<number, Token[]>();
  for (const t of doc.tokens) {
    if (t.furniture) continue;
    let list = byPage.get(t.page);
    if (!list) byPage.set(t.page, (list = []));
    list.push(t);
  }
  const textless: number[] = [];
  const unreadable: { page: number; count: number }[] = [];
  const privateUse: { page: number; count: number }[] = [];
  const fieldsUnread: { page: number; count: number }[] = [];
  for (const pg of doc.pages) {
    const toks = byPage.get(pg.index) ?? [];
    if (toks.length === 0) textless.push(pg.index);
    // Glyphs without any mapping, or mapped to U+FFFD (many glyphs to one
    // code), cannot be told apart: a change to them can be missed.
    let count = pg.unmapped ?? 0;
    // Private-use code points (a font's own codes, e.g. for alternate
    // glyphs) still tell glyphs apart, so they are compared, but their text
    // has no standard meaning and may not display.
    let own = 0;
    for (const t of toks)
      for (const ch of t.text) {
        if (ch === '\ufffd') count++;
        else if (/[\ue000-\uf8ff]/.test(ch)) own++;
      }
    if (count > 0) unreadable.push({ page: pg.index, count });
    if (own > 0) privateUse.push({ page: pg.index, count: own });
    if (pg.fieldsUnread) fieldsUnread.push({ page: pg.index, count: pg.fieldsUnread });
  }
  return {
    textless,
    unreadable,
    ...(privateUse.length ? { privateUse } : {}),
    ...(fieldsUnread.length ? { fieldsUnread } : {}),
  };
}

/** Number of differing header/footer lines (shown as "ignored", not hidden silently). */
function furnitureDifferences(a: DocModel, b: DocModel): number {
  const la = a.lines.filter((l) => l.furniture).map((l) => l.text);
  const lb = b.lines.filter((l) => l.furniture).map((l) => l.text);
  const [ka, kb] = intern(la, lb);
  // A changed line is a deletion plus an insertion: count it once.
  let n = 0;
  let del = 0;
  let ins = 0;
  for (const o of [...opsFromMatches(matchSequences(ka, kb), la.length, lb.length), null]) {
    if (o?.type === 'delete') del += o.a1 - o.a0;
    else if (o?.type === 'insert') ins += o.b1 - o.b0;
    else {
      n += Math.max(del, ins);
      del = ins = 0;
    }
  }
  return n;
}

function caseOnlyDifferences(A: Token[], B: Token[], pairs: Int32Array): number {
  let n = 0;
  for (let p = 0; p < pairs.length; p += 2) if (baseKey(A[pairs[p]].text) !== baseKey(B[pairs[p + 1]].text)) n++;
  return n;
}

/**
 * Merge insertions (or deletions) that are separated by only a few unchanged
 * tokens across consecutive lines — typically new table cells row after row —
 * so the reviewer sees one change instead of many fragments. Insertions and
 * deletions are merged in separate passes, each in its own document's order.
 */
function mergeNearby(changes: Change[], oldDoc: DocModel, newDoc: DocModel): void {
  const absorbed = new Set<Change>();
  for (const kind of ['insert', 'delete'] as const) {
    const doc = kind === 'insert' ? newDoc : oldDoc;
    const sideOf = (c: Change) => (kind === 'insert' ? c.new : c.old);
    const list = changes.filter((c) => c.kind === kind && sideOf(c).start !== undefined).sort((x, y) => sideOf(x).start! - sideOf(y).start!);
    for (let k = 0; k < list.length; k++) {
      const a = list[k];
      const sa = sideOf(a);
      let j = k + 1;
      for (; j < list.length; j++) {
        const b = list[j];
        const sb = sideOf(b);
        if (sb.start! < sa.end!) break;
        // An edit inside a moved passage stays apart from edits around it,
        // and whole paragraphs (more than a short table row) stay apart.
        const paragraph = (c: Change) => !!c.wholeParagraphs && c.size > 6;
        if ((a.inMove === undefined) !== (b.inMove === undefined) || paragraph(a) || paragraph(b)) break;
        // Unchanged words in between (CJK: about three characters to a word,
        // so a short row label such as 首席工程师 still counts as a gap of
        // two words, while a clause of 30 characters keeps edits apart).
        let words = 0;
        let cjk = 0;
        for (let t = sa.end!; t < sb.start! && words + cjk / 3 <= 3; t++) {
          const tk = doc.tokens[t].kind;
          if (tk === 'cjk') cjk++;
          else if (tk !== 'punct') words++;
        }
        const lastA = doc.tokens[sa.end! - 1];
        const firstB = doc.tokens[sb.start!];
        if (words + cjk / 3 > 3 || firstB.line === lastA.line || firstB.line - lastA.line > 2 || firstB.page !== lastA.page) break;
        sa.rects.push(...sb.rects);
        sa.pages = [...new Set([...sa.pages, ...sb.pages])].sort((x, y) => x - y);
        sa.text += ' … ' + sb.text;
        sa.end = sb.end;
        a.size += b.size;
        a.contextAfter = b.contextAfter;
        a.wholeParagraphs = undefined;
        absorbed.add(b);
      }
      k = j - 1;
    }
  }
  if (absorbed.size) {
    const kept = changes.filter((c) => !absorbed.has(c));
    changes.splice(0, changes.length, ...kept);
  }
}

/**
 * Text that only lost its end (or start) at the edge of a page that became
 * narrower ("4,800" → "4,", "EUR)" → "EU" after a new CropBox): PDF.js
 * leaves out the glyphs outside the visible page, so the text comparison
 * sees an edit, but the figures did not change; the page was cut. Such a
 * replacement is folded into the overflow change ("Content is cut off at
 * the right edge of the page") for that page and edge, which then also
 * shows the uncut wording as its old side and the visible part on its new
 * side; without one it becomes such an overflow change itself. Required,
 * as geometric evidence that the page was cut there:
 * - the visible part is a prefix (right edge) or suffix (left edge) of the
 *   old text and ends at the page edge (within 0.6 em);
 * - it stands where the same glyphs stood in the old version, after the
 *   shift of the matched text around it (the line's matched words, else the
 *   page's): cut text keeps its glyph positions, a figure re-set or
 *   re-flowed ("1,000,000" → "1,000" right-aligned) does not;
 * - the old text reached past the new page's edge at that side: the
 *   glyphs that are missing lay outside the new page.
 * Any other replacement stays the edit it is ("Number changed: −4,800.00 →
 * 4,800.00" at a new left edge that the amount does not reach).
 */
function foldClipped(changes: Change[], overflow: Change[], oldDoc: DocModel, newDoc: DocModel, newOfOld: Int32Array): void {
  const squash = (x: string) => x.replace(/\s+/g, '');
  const folded = new Set<Change>();
  const median = (v: number[]) => {
    const s = [...v].sort((x, y) => x - y);
    return s.length ? s[s.length >> 1] : null;
  };
  /** How far the matched text around old token k moved sideways (its line's matched words, else its page's). */
  const shiftAt = (k: number, newPage: number, from: number, to: number): number | null => {
    const t = oldDoc.tokens[k];
    const line = oldDoc.lines[t.line];
    const dx = (j: number) => {
      const n = newOfOld[j];
      if ((j >= from && j < to) || n < 0 || newDoc.tokens[n].page !== newPage) return null;
      return newDoc.tokens[n].rects[0].x - oldDoc.tokens[j].rects[0].x;
    };
    const own: number[] = [];
    for (let j = line.start; j < line.end; j++) {
      const d = dx(j);
      if (d !== null) own.push(d);
    }
    if (own.length) return median(own);
    const page: number[] = [];
    for (let j = 0; j < oldDoc.tokens.length; j++) {
      if (oldDoc.tokens[j].page !== t.page || oldDoc.tokens[j].furniture) continue;
      const d = dx(j);
      if (d !== null) page.push(d);
    }
    return median(page);
  };
  for (const c of changes) {
    if (c.kind !== 'replace' || c.category !== 'text' || c.inMove !== undefined || c.places) continue;
    if (c.old.pages.length !== 1 || c.new.pages.length !== 1 || c.old.start === undefined || c.new.start === undefined) continue;
    const op = oldDoc.pages[c.old.pages[0]];
    const np = newDoc.pages[c.new.pages[0]];
    if (!op || !np || (op.textAngle ?? 0) !== 0 || (np.textAngle ?? 0) !== 0) continue;
    const a = squash(c.old.text);
    const b = squash(c.new.text);
    if (!b || b.length >= a.length) continue;
    const first = newDoc.tokens[c.new.start];
    const last = newDoc.tokens[c.new.end! - 1];
    const oldFirst = oldDoc.tokens[c.old.start];
    const oldLast = oldDoc.tokens[c.old.end! - 1];
    if (first.line !== last.line || oldFirst.line !== oldLast.line) continue;
    const lr = last.rects[last.rects.length - 1];
    const or = oldLast.rects[oldLast.rects.length - 1];
    const dx = shiftAt(c.old.start, c.new.pages[0], c.old.start, c.old.end!);
    if (dx === null) continue;
    let edge: 'left' | 'right' | null = null;
    // Right edge: the visible start stays put, the old end lay past the new edge.
    if (a.startsWith(b) && lr.x + lr.w >= np.width - 0.6 * last.size && Math.abs(first.rects[0].x - (oldFirst.rects[0].x + dx)) <= 1 && or.x + or.w + dx > np.width + 0.5)
      edge = 'right';
    // Left edge: the visible end stays put, the old start lay left of the new edge.
    else if (a.endsWith(b) && first.rects[0].x <= 0.6 * first.size && Math.abs(lr.x + lr.w - (or.x + or.w + dx)) <= 1 && oldFirst.rects[0].x + dx < -0.5)
      edge = 'left';
    if (!edge) continue;
    const page = c.new.pages[0];
    const o = overflow.find((x) => x.overflow?.edge === edge && x.new.pages[0] === page);
    if (o) {
      const rects = [...o.old.rects, ...c.old.rects];
      o.old = { pages: [...new Set(rects.map((r) => r.page))].sort((x, y) => x - y), rects, text: o.old.text ? `${o.old.text} ${c.old.text}` : c.old.text };
      const shown = (r: { page: number; rect: Rect }) =>
        o.new.rects.some((q) => q.page === r.page && q.rect.x < r.rect.x + r.rect.w && r.rect.x < q.rect.x + q.rect.w && q.rect.y < r.rect.y + r.rect.h && r.rect.y < q.rect.y + q.rect.h);
      const extra = c.new.rects.filter((r) => !shown(r));
      if (extra.length) {
        const nrects = [...o.new.rects, ...extra];
        o.new = { ...o.new, pages: [...new Set(nrects.map((r) => r.page))].sort((x, y) => x - y), rects: nrects, text: o.new.text ? `${o.new.text} ${c.new.text}` : c.new.text };
      }
      folded.add(c);
      continue;
    }
    c.kind = 'overflow';
    c.category = 'visual';
    c.overflow = { edge };
    delete c.numeric;
    c.contextBefore = '';
    c.contextAfter = '';
  }
  if (folded.size) {
    const kept = changes.filter((c) => !folded.has(c));
    changes.splice(0, changes.length, ...kept);
  }
}

export function sortAndNumber(changes: Change[]): void {
  changes.sort((x, y) => x.order - y.order || (x.category === y.category ? 0 : x.category === 'text' ? -1 : 1));
  changes.forEach((c, k) => (c.id = 'c' + (k + 1)));
  // Link each edit inside a moved passage to its move (ids change on renumbering).
  const moves = changes.filter((c) => c.kind === 'move');
  const inside = (s: Side, m: Side) => s.start !== undefined && m.start !== undefined && m.start <= s.start && s.start < m.end!;
  for (const c of changes) {
    if (c.inMove === undefined) continue;
    const m = moves.find((m) => (c.old.start !== undefined ? inside(c.old, m.old) : inside(c.new, m.new)));
    c.inMove = m?.id ?? '';
  }
}
