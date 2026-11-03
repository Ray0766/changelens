/**
 * Sequence diff tuned for documents.
 *
 *  1. Common prefix/suffix are stripped.
 *  2. Patience anchoring: tokens that occur exactly once on both sides are
 *     matched and their longest increasing subsequence splits the problem
 *     into independent sub-problems. This keeps the diff fast on long
 *     documents and avoids the "shredded" results plain LCS produces when
 *     paragraphs are reordered.
 *  3. Remaining small segments are solved with Myers' O(ND) algorithm.
 *     Where that would need too many edits (long tables in which every
 *     figure changed), unconfirmed unique tokens and then tokens occurring
 *     equally often on both sides are used as anchors; a segment that shares
 *     words but still has nothing to anchor on is counted in
 *     MatchInfo.unaligned.
 *  4. A semantic clean-up pass removes tiny coincidental equalities inside
 *     rewritten passages so the reader sees one coherent change.
 */

export type OpType = 'equal' | 'delete' | 'insert';

export interface DiffOp {
  type: OpType;
  a0: number;
  a1: number;
  b0: number;
  b1: number;
}

const MAX_D = 1200;
/** Segments up to this many tokens are diffed exactly with Myers. */
const SMALL = 600;

/** Map strings to small integers so comparisons are cheap. */
export function intern(aKeys: string[], bKeys: string[]): [Int32Array, Int32Array] {
  const ids = new Map<string, number>();
  const conv = (keys: string[]) => {
    const out = new Int32Array(keys.length);
    for (let i = 0; i < keys.length; i++) {
      let id = ids.get(keys[i]);
      if (id === undefined) ids.set(keys[i], (id = ids.size));
      out[i] = id;
    }
    return out;
  };
  return [conv(aKeys), conv(bKeys)];
}

/** Longest strictly increasing subsequence of `vals` (returns indices into vals). */
function lis(vals: number[]): number[] {
  const tails: number[] = [];
  const prev = new Int32Array(vals.length).fill(-1);
  for (let i = 0; i < vals.length; i++) {
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (vals[tails[mid]] < vals[i]) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0) prev[i] = tails[lo - 1];
    tails[lo] = i;
  }
  const out: number[] = [];
  let k = tails.length ? tails[tails.length - 1] : -1;
  while (k >= 0) {
    out.push(k);
    k = prev[k];
  }
  return out.reverse();
}

/** Exact (minimal) diff. Returns false, adding nothing, when it would need more than MAX_D edits. */
function myers(a: Int32Array, aLo: number, aHi: number, b: Int32Array, bLo: number, bHi: number, out: number[]): boolean {
  const n = aHi - aLo;
  const m = bHi - bLo;
  const limit = Math.min(n + m, MAX_D);
  const o = limit + 1;
  const v = new Int32Array(2 * limit + 3);
  const trace: Int32Array[] = [];
  for (let d = 0; d <= limit; d++) {
    trace.push(v.slice(o - d - 1, o + d + 2));
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[o + k - 1] < v[o + k + 1]) ? v[o + k + 1] : v[o + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[aLo + x] === b[bLo + y]) {
        x++;
        y++;
      }
      v[o + k] = x;
      if (x >= n && y >= m) {
        // Backtrack.
        const pairs: number[] = [];
        let cx = n;
        let cy = m;
        for (let dd = d; dd > 0; dd--) {
          const t = trace[dd];
          // t holds v[o-dd-1 .. o+dd+1]; index of k is k + dd + 1.
          const at = (kk: number) => t[kk + dd + 1];
          const kk = cx - cy;
          const prevK = kk === -dd || (kk !== dd && at(kk - 1) < at(kk + 1)) ? kk + 1 : kk - 1;
          const px = at(prevK);
          const py = px - prevK;
          while (cx > px && cy > py) {
            pairs.push(aLo + cx - 1, bLo + cy - 1);
            cx--;
            cy--;
          }
          cx = px;
          cy = py;
        }
        while (cx > 0 && cy > 0) {
          pairs.push(aLo + cx - 1, bLo + cy - 1);
          cx--;
          cy--;
        }
        for (let p = pairs.length - 2; p >= 0; p -= 2) out.push(pairs[p], pairs[p + 1]);
        return true;
      }
    }
  }
  return false;
}

/** What the alignment had to give up on (for coverage notices). */
export interface MatchInfo {
  /** Tokens (both sides) in segments that could not be aligned at all. */
  unaligned: number;
  /**
   * Keys (by interned id) that make weak anchors, e.g. figures and
   * punctuation: in a revised table a coincidentally repeated figure must
   * not anchor the alignment in place of a row label.
   */
  weak?: Uint8Array;
}

function matchRange(a: Int32Array, aLo: number, aHi: number, b: Int32Array, bLo: number, bHi: number, out: number[], info?: MatchInfo): void {
  while (aLo < aHi && bLo < bHi && a[aLo] === b[bLo]) {
    out.push(aLo++, bLo++);
  }
  const suffix: number[] = [];
  while (aLo < aHi && bLo < bHi && a[aHi - 1] === b[bHi - 1]) {
    aHi--;
    bHi--;
    suffix.push(aHi, bHi);
  }
  if (aLo < aHi && bLo < bHi) {
    const small = aHi - aLo + (bHi - bLo) <= SMALL;
    const { unique, confirmed } = uniqueAnchors(a, aLo, aHi, b, bLo, bHi, info?.weak);
    if (small || !chain(a, aLo, aHi, b, bLo, bHi, confirmed, out, info)) {
      // Compare the exact (minimal) diff with anchored ones and keep the one
      // whose matches form the longest unbroken runs. The minimal diff often
      // wins extra matches by pairing up common words scattered across a
      // deleted or moved paragraph, which reads badly; in a table whose
      // figures all changed it may pair coincidentally equal figures where
      // the row labels (unique, but without a matching neighbour) belong.
      type Candidate = { pairs: number[]; info: MatchInfo };
      const run = (f: (pairs: number[], info: MatchInfo) => boolean): Candidate | null => {
        const c: Candidate = { pairs: [], info: { unaligned: 0, weak: info?.weak } };
        return f(c.pairs, c.info) ? c : null;
      };
      // On a tie the later candidate wins: anchored before exact, and all
      // unique tokens (e.g. row labels) before only the confirmed ones.
      const candidates = [
        run((p) => myers(a, aLo, aHi, b, bLo, bHi, p)),
        small && !sameAnchors(confirmed, unique) ? run((p, i) => chain(a, aLo, aHi, b, bLo, bHi, confirmed, p, i)) : null,
        run((p, i) => chain(a, aLo, aHi, b, bLo, bHi, unique, p, i)),
      ];
      let pick: Candidate | null = null;
      let best = -1;
      for (const c of candidates) {
        if (!c) continue;
        const score = runScore(c.pairs);
        if (score >= best) {
          pick = c;
          best = score;
        }
      }
      // Too many differences for an exact diff and nothing unique (e.g. a
      // long table with repeated labels): pair tokens that occur equally
      // often on both sides, in order.
      pick ??= run((p, i) => chain(a, aLo, aHi, b, bLo, bHi, countedAnchors(a, aLo, aHi, b, bLo, bHi), p, i));
      if (pick) {
        for (const v of pick.pairs) out.push(v);
        if (info) info.unaligned += pick.info.unaligned;
      } else if (info && shareKeys(a, aLo, aHi, b, bLo, bHi)) {
        // Words in common, but none could be placed: the alignment gave up.
        info.unaligned += aHi - aLo + (bHi - bLo);
      }
    }
  }
  for (let p = suffix.length - 2; p >= 0; p -= 2) out.push(suffix[p], suffix[p + 1]);
}

function shareKeys(a: Int32Array, aLo: number, aHi: number, b: Int32Array, bLo: number, bHi: number): boolean {
  const keys = new Set(a.subarray(aLo, aHi));
  for (let j = bLo; j < bHi; j++) if (keys.has(b[j])) return true;
  return false;
}

/** Sum of squared lengths of contiguous match runs: rewards coherent alignments. */
function runScore(pairs: number[]): number {
  let score = 0;
  let run = 0;
  for (let p = 0; p < pairs.length; p += 2) {
    const contiguous = p > 0 && pairs[p] === pairs[p - 2] + 1 && pairs[p + 1] === pairs[p - 1] + 1;
    run = contiguous ? run + 1 : 1;
    // (run² − (run−1)²) = 2·run − 1 added incrementally.
    score += 2 * run - 1;
  }
  return score;
}

type Anchors = { a: number[]; b: number[] };

/**
 * Anchor candidates for the patience step:
 *  - unique: tokens occurring exactly once on both sides, except weak ones;
 *  - confirmed: unique tokens (weak ones included) with a matching neighbour
 *    (or a segment boundary) on at least one side, since a lone
 *    coincidental match is a poor anchor;
 *  - counted: tokens occurring equally often on both sides, the k-th
 *    occurrence paired with the k-th.
 */
function uniqueAnchors(a: Int32Array, aLo: number, aHi: number, b: Int32Array, bLo: number, bHi: number, weak?: Uint8Array): { unique: Anchors; confirmed: Anchors } {
  const unique: Anchors = { a: [], b: [] };
  const confirmed: Anchors = { a: [], b: [] };
  const ca = new Map<number, number>();
  for (let i = aLo; i < aHi; i++) ca.set(a[i], ca.has(a[i]) ? -1 : i);
  const cb = new Map<number, number>();
  for (let j = bLo; j < bHi; j++) {
    const ai = ca.get(b[j]);
    if (ai === undefined || ai < 0) continue;
    cb.set(b[j], cb.has(b[j]) ? -1 : j);
  }
  for (let i = aLo; i < aHi; i++) {
    if (ca.get(a[i]) !== i) continue;
    const bj = cb.get(a[i]);
    if (bj === undefined || bj < 0) continue;
    if (!weak?.[a[i]]) {
      unique.a.push(i);
      unique.b.push(bj);
    }
    const before = i === aLo || bj === bLo || a[i - 1] === b[bj - 1];
    const after = i === aHi - 1 || bj === bHi - 1 || a[i + 1] === b[bj + 1];
    if (!before && !after) continue;
    confirmed.a.push(i);
    confirmed.b.push(bj);
  }
  return { unique, confirmed };
}

const sameAnchors = (x: Anchors, y: Anchors) => x.a.length === y.a.length && x.a.every((v, k) => v === y.a[k]);

function countedAnchors(a: Int32Array, aLo: number, aHi: number, b: Int32Array, bLo: number, bHi: number): Anchors {
  const out: Anchors = { a: [], b: [] };
  const posA = new Map<number, number[]>();
  for (let i = aLo; i < aHi; i++) {
    let l = posA.get(a[i]);
    if (!l) posA.set(a[i], (l = []));
    l.push(i);
  }
  const posB = new Map<number, number[]>();
  for (let j = bLo; j < bHi; j++) {
    if (!posA.has(b[j])) continue;
    let l = posB.get(b[j]);
    if (!l) posB.set(b[j], (l = []));
    l.push(j);
  }
  const seen = new Map<number, number>();
  for (let i = aLo; i < aHi; i++) {
    const lb = posB.get(a[i]);
    if (!lb || lb.length !== posA.get(a[i])!.length) continue;
    const k = seen.get(a[i]) ?? 0;
    seen.set(a[i], k + 1);
    out.a.push(i);
    out.b.push(lb[k]);
  }
  return out;
}

/**
 * Patience step: keep the longest increasing chain of anchors and diff the
 * gaps between them. Returns false if there are no anchors.
 */
function chain(a: Int32Array, aLo: number, aHi: number, b: Int32Array, bLo: number, bHi: number, anchors: Anchors, out: number[], info?: MatchInfo): boolean {
  if (anchors.a.length === 0) return false;
  let pa = aLo;
  let pb = bLo;
  for (const c of lis(anchors.b)) {
    const ai = anchors.a[c];
    const bj = anchors.b[c];
    matchRange(a, pa, ai, b, pb, bj, out, info);
    out.push(ai, bj);
    pa = ai + 1;
    pb = bj + 1;
  }
  matchRange(a, pa, aHi, b, pb, bHi, out, info);
  return true;
}

/** Matched index pairs [a0, b0, a1, b1, ...] in increasing order. */
export function matchSequences(a: Int32Array, b: Int32Array, info?: MatchInfo): Int32Array {
  const out: number[] = [];
  matchRange(a, 0, a.length, b, 0, b.length, out, info);
  return Int32Array.from(out);
}

export function opsFromMatches(matches: Int32Array, n: number, m: number): DiffOp[] {
  const ops: DiffOp[] = [];
  let ia = 0;
  let ib = 0;
  const push = (type: OpType, a0: number, a1: number, b0: number, b1: number) => {
    const last = ops[ops.length - 1];
    if (last && last.type === type && last.a1 === a0 && last.b1 === b0) {
      last.a1 = a1;
      last.b1 = b1;
    } else ops.push({ type, a0, a1, b0, b1 });
  };
  for (let p = 0; p < matches.length; p += 2) {
    const ai = matches[p];
    const bi = matches[p + 1];
    if (ai > ia) push('delete', ia, ai, ib, ib);
    if (bi > ib) push('insert', ai, ai, ib, bi);
    push('equal', ai, ai + 1, bi, bi + 1);
    ia = ai + 1;
    ib = bi + 1;
  }
  if (n > ia) push('delete', ia, n, ib, ib);
  if (m > ib) push('insert', n, n, ib, m);
  return ops;
}

/** A run of changes (or one equality) in the edit script. */
export interface Span {
  a0: number;
  a1: number;
  b0: number;
  b1: number;
  /**
   * For a change group: the size (tokens on both sides) of the largest
   * change it was built from before any clean-up merged it with others.
   */
  orig: number;
}

/**
 * Remove short equalities that sit between larger changes ("semantic
 * clean-up", after diff-match-patch). `weightA/B(i)` give the visual weight
 * (e.g. character count) of token i; `canDissolve(eq, before, after)` decides
 * whether an equality between two change groups may be folded into them.
 * Groups that were merged keep the size of their largest original change in
 * `orig`, so a decision can be based on the edits themselves rather than on
 * what earlier merges produced (which would let merging snowball).
 */
export function cleanupSemantic(
  ops: DiffOp[],
  weightA: (i: number) => number,
  weightB: (i: number) => number,
  canDissolve: (eq: Span, before: Span, after: Span) => boolean,
): DiffOp[] {
  const wA = (a0: number, a1: number) => {
    let s = 0;
    for (let i = a0; i < a1; i++) s += weightA(i);
    return s;
  };
  const wB = (b0: number, b1: number) => {
    let s = 0;
    for (let i = b0; i < b1; i++) s += weightB(i);
    return s;
  };
  // Group into an [equal | changeGroup] sequence.
  type Group = Span & { eq: boolean };
  let groups: Group[] = [];
  for (const op of ops) {
    const eq = op.type === 'equal';
    const last = groups[groups.length - 1];
    if (last && !last.eq && !eq) {
      last.a1 = Math.max(last.a1, op.a1);
      last.b1 = Math.max(last.b1, op.b1);
      last.a0 = Math.min(last.a0, op.a0);
      last.b0 = Math.min(last.b0, op.b0);
      last.orig = last.a1 - last.a0 + (last.b1 - last.b0);
    } else groups.push({ eq, a0: op.a0, a1: op.a1, b0: op.b0, b1: op.b1, orig: eq ? 0 : op.a1 - op.a0 + (op.b1 - op.b0) });
  }
  let changed = true;
  while (changed) {
    changed = false;
    const out: Group[] = [];
    for (let g = 0; g < groups.length; g++) {
      const grp = groups[g];
      const before = out[out.length - 1];
      const after = groups[g + 1];
      if (grp.eq && before && !before.eq && after && !after.eq) {
        const len = wA(grp.a0, grp.a1);
        const lb = Math.max(wA(before.a0, before.a1), wB(before.b0, before.b1));
        const la = Math.max(wA(after.a0, after.a1), wB(after.b0, after.b1));
        if (len <= lb && len <= la && canDissolve(grp, before, after)) {
          // Merge before + this + after into one change group.
          out[out.length - 1] = { eq: false, a0: before.a0, a1: after.a1, b0: before.b0, b1: after.b1, orig: Math.max(before.orig, after.orig) };
          g++;
          changed = true;
          continue;
        }
      }
      out.push({ ...grp });
    }
    groups = out;
  }
  const cur: DiffOp[] = [];
  for (const grp of groups) {
    if (grp.eq) cur.push({ type: 'equal', a0: grp.a0, a1: grp.a1, b0: grp.b0, b1: grp.b1 });
    else {
      if (grp.a1 > grp.a0) cur.push({ type: 'delete', a0: grp.a0, a1: grp.a1, b0: grp.b0, b1: grp.b0 });
      if (grp.b1 > grp.b0) cur.push({ type: 'insert', a0: grp.a1, a1: grp.a1, b0: grp.b0, b1: grp.b1 });
    }
  }
  return cur;
}
