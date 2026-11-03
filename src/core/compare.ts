import type {
  Anchor,
  Coverage,
  Change,
  CompareResult,
  DiffOptions,
  DocModel,
  FormatDetail,
  PageLink,
  Rect,
  Side,
  Token,
} from './types.ts';
import { defaultOptions } from './types.ts';
import { baseKey, joinTokens, syncHyphenation } from './tokenize.ts';
import { cleanupSemantic, intern, matchSequences, opsFromMatches, type DiffOp, type MatchInfo, type Span } from './diff.ts';
import { mergeLineRects } from './geometry.ts';
import { isNumericPhrase, parseNumber } from './numbers.ts';
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
function foldRule(ctx: Ctx): (eq: Span, before: Span, after: Span) => boolean {
  const { A, B, ka, kb } = ctx;
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
      // not a coincidence.
      if (label && countA[ka[i]] === 1 && countB[kb[eq.b0 + (i - eq.a0)]] === 1) return false;
    }
    // Revised figures separated by a label ("Q1 -120 Q2 340", "between 10
    // and 20") stay separate changes; the parts of a date ("11 月 30 日")
    // are folded into one.
    if ((label || latin) && numericEdit(before) && numericEdit(after)) return false;
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
  if (!pa || !na || !pb || !nb || pa.block === na.block || pb.block === nb.block) return [h];
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
    const same = p.a1 - p.a0 === p.b1 - p.b0 && A.slice(p.a0, p.a1).every((t, j) => t.key === B[p.b0 + j].key);
    if (!same) out.push(p);
  }
  return out;
}

function splitHunk(ctx: Ctx, h: Hunk): Hunk[] {
  return splitAtBlocks(ctx, h).flatMap((p) => splitNumbers(ctx, p));
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
  if (kind === 'replace' && isNumericPhrase(delToks.map((t) => t.text)) && isNumericPhrase(insToks.map((t) => t.text))) {
    // Show the unchanged unit or currency sign that is written onto the
    // number ("4%" → "8%", "€62.40"), so the description keeps its meaning.
    const before = A[h.a0 - 1];
    const after = A[h.a1];
    const pre = before && UNIT.test(before.text) && !delToks[0].spaceBefore && !insToks[0].spaceBefore && before.line === delToks[0].line ? before.text : '';
    const post = after && UNIT.test(after.text) && !after.spaceBefore && B[h.b1]?.text === after.text && !B[h.b1].spaceBefore ? after.text : '';
    const from = pre + oldSide.text + post;
    const to = pre + newSide.text + post;
    oldSide.text = from;
    newSide.text = to;
    // A value (for the percentage and sign check) only when each side is one
    // figure: several figures run together would give a meaningless number.
    const single = delToks.filter(hasDigit).length === 1 && insToks.filter(hasDigit).length === 1;
    const value = single && !isListLabel(A, h.a0, from) && !isListLabel(B, h.b0, to);
    change.numeric = { from, to, fromValue: value ? parseNumber(from) : null, toValue: value ? parseNumber(to) : null };
  }
  return change;
}

/**
 * "(1)" → "1)" or "(3)" → "(4)" at the start of a line are list labels, not
 * negative amounts: no sign change or percentage is computed for them.
 */
function isListLabel(T: Token[], at: number, text: string): boolean {
  const open = (text.match(/\(/g) ?? []).length;
  const close = (text.match(/\)/g) ?? []).length;
  if (open !== close) return true;
  const lineStart = at === 0 || T[at - 1].line !== T[at].line;
  return lineStart && /^\(?\d{1,2}\)?[.)]?$/.test(text);
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
  const score = (seq: Token[], lo: number, hi: number) => {
    const first = seq[lo];
    const last = seq[hi - 1];
    let s = 0;
    if (lo === 0 || seq[lo - 1].block !== first.block) s += 2;
    else if (seq[lo - 1].line !== first.line) s += 1;
    if (hi === seq.length || seq[hi].block !== last.block) s += 2;
    else if (seq[hi].line !== last.line) s += 1;
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

// ---------------------------------------------------------------- moves ---

interface Moves {
  moves: Change[];
  /** Edits inside moved passages, reported as their own changes. */
  inner: Change[];
  /** Equal ops pairing the unchanged words of each moved passage. */
  innerOps: DiffOp[];
  rest: Hunk[];
}

/**
 * A deleted passage that reappears elsewhere is a move. Pairing uses an
 * order-aware similarity (matched words in sequence, not a bag of words),
 * and the two texts are then diffed, so a figure or a negation changed
 * inside a moved paragraph is reported as its own change, located in both
 * versions, rather than hidden behind "Moved a paragraph".
 */
function detectMoves(ctx: Ctx, hunks: Hunk[], fold: (eq: Span, before: Span, after: Span) => boolean): Moves {
  const MIN = 6;
  const SIM = 0.8;
  const { ka, kb } = ctx;
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
  const dels = hunks
    .map((h, idx) => ({ h, idx, ...content(ka, ctx.A, h.a0, h.a1) }))
    .filter((d) => d.h.b0 === d.h.b1 && d.n >= MIN);
  const inss = hunks
    .map((h, idx) => ({ h, idx, ...content(kb, ctx.B, h.b0, h.b1) }))
    .filter((d) => d.h.a0 === d.h.a1 && d.n >= MIN);
  const candidates: { d: number; i: number; sim: number; matches: Int32Array }[] = [];
  dels.forEach((d, di) =>
    inss.forEach((ins, ii) => {
      if (Math.min(d.n, ins.n) / Math.max(d.n, ins.n) < 0.7) return;
      // The bag of words bounds the in-order similarity from above: a cheap filter.
      let common = 0;
      for (const [k, c] of d.m) common += Math.min(c, ins.m.get(k) ?? 0);
      if ((2 * common) / (d.n + ins.n) < SIM) return;
      const matches = matchSequences(ka.subarray(d.h.a0, d.h.a1), kb.subarray(ins.h.b0, ins.h.b1));
      let inOrder = 0;
      for (let p = 0; p < matches.length; p += 2) if (ctx.A[d.h.a0 + matches[p]].kind !== 'punct') inOrder++;
      const sim = (2 * inOrder) / (d.n + ins.n);
      if (sim >= SIM) candidates.push({ d: di, i: ii, sim, matches });
    }),
  );
  candidates.sort((x, y) => y.sim - x.sim);
  const usedD = new Set<number>();
  const usedI = new Set<number>();
  const consumed = new Set<number>();
  const out: Moves = { moves: [], inner: [], innerOps: [], rest: [] };
  for (const c of candidates) {
    if (usedD.has(c.d) || usedI.has(c.i)) continue;
    usedD.add(c.d);
    usedI.add(c.i);
    const d = dels[c.d];
    const ins = inss[c.i];
    consumed.add(d.idx);
    consumed.add(ins.idx);
    // Diff the moved text against its old wording.
    const local = opsFromMatches(c.matches, d.h.a1 - d.h.a0, ins.h.b1 - ins.h.b0);
    const ops = refine(
      ctx,
      local.map((o) => ({ ...o, a0: o.a0 + d.h.a0, a1: o.a1 + d.h.a0, b0: o.b0 + ins.h.b0, b1: o.b1 + ins.h.b0 })),
      fold,
    );
    const edits = hunksOf(ops)
      .flatMap((h) => splitHunk(ctx, h))
      .map((h) => textChange(ctx, h));
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
  out.rest = hunks.filter((_, idx) => !consumed.has(idx));
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
  const fold = foldRule(ctx);
  const ops = refine(ctx, opsFromMatches(matchSequences(ka, kb, info), A.length, B.length), fold);

  // Final matched pairs after clean-up.
  const pairList: number[] = [];
  for (const op of ops) if (op.type === 'equal') for (let k = 0; k < op.a1 - op.a0; k++) pairList.push(op.a0 + k, op.b0 + k);
  const pairs = Int32Array.from(pairList);

  const moved = detectMoves(ctx, hunksOf(ops), fold);
  const changes: Change[] = [...moved.rest.flatMap((h) => splitHunk(ctx, h)).map((h) => textChange(ctx, h)), ...moved.moves, ...moved.inner];
  mergeNearby(changes, oldDoc, newDoc);
  markDuplicates(changes, B);
  const renumbered = extractRenumbering(changes, oldDoc, newDoc);
  aggregateReplacements(changes);
  if (options.detectFormatting) {
    const formats = [...detectFormatting(ctx, ops), ...detectFormatting(ctx, moved.innerOps)];
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
  changes.push(...findOverflow(oldDoc, newDoc, A, B, pairs));

  sortAndNumber(changes);

  return {
    oldDoc,
    newDoc,
    changes,
    pageLinks: map.links,
    oldToNew: map.oldToNew,
    newToOld: map.newToOld,
    anchors: withManualAnchors(buildAnchors(A, B, pairs), manual, oldDoc, newDoc),
    matches: Int32Array.from(pairs, (v, k) => (k % 2 === 0 ? A[v].i : B[v].i)),
    options,
    coverage: { old: coverageOf(oldDoc), new: { ...coverageOf(newDoc), uncertain: uncertainPages(newDoc, B, pairs, moved.innerOps) } },
    ignored: {
      furniture: options.ignoreFurniture ? furnitureDifferences(oldDoc, newDoc) : 0,
      caseOnly: options.ignoreCase ? caseOnlyDifferences(A, B, pairs) : 0,
      minorShifts: 0,
      renumbered: renumbered.length,
    },
    minor: renumbered,
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
 * set in a wider or narrower font keeps its alignment edge (left, centre or
 * right), so the edge that moved least counts, and lines whose font, size or
 * weight changed are left to the formatting change.
 */
function detectPositions(ctx: Ctx, pairs: Int32Array): Change[] {
  const { A, B, oldDoc, newDoc } = ctx;
  const byOldLine = new Map<number, number[]>();
  const reformatted = new Set<number>();
  for (let p = 0; p < pairs.length; p += 2) {
    const a = A[pairs[p]];
    let arr = byOldLine.get(a.line);
    if (!arr) byOldLine.set(a.line, (arr = []));
    arr.push(p);
    if (formatDiff(a, B[pairs[p + 1]])) reformatted.add(a.line);
  }
  const countNewLine = new Map<number, number>();
  for (const t of B) countNewLine.set(t.line, (countNewLine.get(t.line) ?? 0) + 1);
  const countOldLine = new Map<number, number>();
  for (const t of A) countOldLine.set(t.line, (countOldLine.get(t.line) ?? 0) + 1);
  /** Displacement of the left edge, the centre and the right edge. */
  type Moved = { oldLine: number; newLine: number; edges: [number, number, number]; page: [number, number] };
  const intact: Moved[] = [];
  for (const [ol, ps] of byOldLine) {
    if (reformatted.has(ol)) continue;
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
    intact.push({ oldLine: ol, newLine: nl, edges: [dl, (dl + dr) / 2, dr], page: [op, np] });
  }
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
    for (const m of list) {
      const rel = nearest(m, typical);
      if (Math.abs(rel) <= 12) continue;
      const lo = oldDoc.lines[m.oldLine];
      const ln = newDoc.lines[m.newLine];
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
 * instead of one entry per paragraph. Only document-wide substitutions are
 * aggregated: the places must cover at least half of the text that had the
 * old style. Three unrelated words set in bold stay three changes.
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
  const out: Change[] = [];
  for (const list of groups.values()) {
    const words = list.reduce((n, c) => n + c.size, 0);
    if (list.length < 3 || words < 0.5 * withOldStyle(list[0].format ?? {})) {
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

/**
 * List numbers that changed only because an item was added or removed above
 * them ("4." → "5.", "5." → "6.", …). They are consequences, not edits:
 * taken out of the change list (shown on request) and counted.
 */
function extractRenumbering(changes: Change[], oldDoc: DocModel, newDoc: DocModel): Change[] {
  const label = (doc: DocModel, start: number | undefined, end: number | undefined) => {
    if (start === undefined || end !== start + 1) return null;
    const t = doc.tokens[start];
    const line = doc.lines[t.line];
    const next = doc.tokens[start + 1];
    // A bare integer at the start of a line, followed by "." ")" or "、".
    if (!/^\d{1,3}$/.test(t.text) || line.start !== start || !next || next.line !== t.line || !/^[.)、．]$/.test(next.text)) return null;
    return { value: Number(t.text), line: t.line };
  };
  type Cand = { c: Change; delta: number; line: number };
  const cands: Cand[] = [];
  for (const c of changes) {
    if (c.kind !== 'replace' || !c.numeric) continue;
    const a = label(oldDoc, c.old.start, c.old.end);
    const b = label(newDoc, c.new.start, c.new.end);
    if (!a || !b || a.value === b.value || Math.abs(b.value - a.value) > 3) continue;
    cands.push({ c, delta: b.value - a.value, line: a.line });
  }
  cands.sort((x, y) => x.line - y.line);
  // Lines (old document) where something was inserted or deleted.
  const structural = changes
    .filter((c) => c.kind === 'insert' || c.kind === 'delete')
    .map((c) => (c.old.start !== undefined ? oldDoc.tokens[c.old.start].line : c.old.caret ? lineAt(oldDoc, c.old.caret.page, c.old.caret.y) : -1));
  const out: Change[] = [];
  let k = 0;
  while (k < cands.length) {
    let j = k + 1;
    while (j < cands.length && cands[j].delta === cands[k].delta && cands[j].line - cands[j - 1].line <= 6) j++;
    const group = cands.slice(k, j);
    const first = group[0].line;
    const follows = structural.some((l) => l >= 0 && l <= first && first - l <= 8);
    if (group.length >= 2 || follows) {
      for (const g of group) {
        g.c.minor = true;
        g.c.consequence = 'renumber';
        out.push(g.c);
      }
    }
    k = j;
  }
  for (const c of out) changes.splice(changes.indexOf(c), 1);
  return out;
}

function lineAt(doc: DocModel, page: number, y: number): number {
  let best = -1;
  for (const l of doc.lines) if (l.page === page && l.rect.y <= y + 1) best = l.id;
  return best;
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
 * signature rule, dot leaders) does not count.
 */
function uncertainPages(doc: DocModel, B: Token[], pairs: Int32Array, moved: DiffOp[]): { page: number; matched: number }[] {
  const total = new Map<number, number>();
  const matched = new Map<number, number>();
  for (const t of B) if (t.kind !== 'punct') total.set(t.page, (total.get(t.page) ?? 0) + 1);
  const hit = (t: Token) => {
    if (t.kind !== 'punct') matched.set(t.page, (matched.get(t.page) ?? 0) + 1);
  };
  for (let p = 1; p < pairs.length; p += 2) hit(B[pairs[p]]);
  for (const op of moved) for (let j = op.b0; j < op.b1; j++) hit(B[j]);
  const out: { page: number; matched: number }[] = [];
  for (const pg of doc.pages) {
    const n = total.get(pg.index) ?? 0;
    const m = matched.get(pg.index) ?? 0;
    if (n >= 20 && m / n < 0.5) out.push({ page: pg.index, matched: Math.round((m / n) * 100) / 100 });
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
  for (const pg of doc.pages) {
    const toks = byPage.get(pg.index) ?? [];
    if (toks.length === 0) textless.push(pg.index);
    // Private-use code points come from glyphs without a proper Unicode mapping.
    let count = pg.unmapped;
    for (const t of toks) for (const ch of t.text) if (/[\ue000-\uf8ff\ufffd]/.test(ch)) count++;
    if (count > 0) unreadable.push({ page: pg.index, count });
  }
  return { textless, unreadable };
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
