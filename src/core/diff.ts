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

function myers(a: Int32Array, aLo: number, aHi: number, b: Int32Array, bLo: number, bHi: number, out: number[]): void {
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
        return;
      }
    }
  }
  // Too different: treat the whole segment as replaced.
}

function matchRange(a: Int32Array, aLo: number, aHi: number, b: Int32Array, bLo: number, bHi: number, out: number[]): void {
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
    if (aHi - aLo + (bHi - bLo) <= SMALL) {
      // Small segment: compare the anchored diff with the exact (minimal)
      // one and keep the one whose matches form longer unbroken runs. The
      // minimal diff often wins extra matches by pairing up common words
      // scattered across a deleted or moved paragraph, which reads badly.
      const anchored: number[] = [];
      const exact: number[] = [];
      const ok = patience(a, aLo, aHi, b, bLo, bHi, anchored);
      myers(a, aLo, aHi, b, bLo, bHi, exact);
      const pick = ok && runScore(anchored) >= runScore(exact) ? anchored : exact;
      for (const v of pick) out.push(v);
    } else if (!patience(a, aLo, aHi, b, bLo, bHi, out)) {
      myers(a, aLo, aHi, b, bLo, bHi, out);
    }
  }
  for (let p = suffix.length - 2; p >= 0; p -= 2) out.push(suffix[p], suffix[p + 1]);
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

/** Patience step: match on unique common tokens. Returns false if there are none. */
function patience(a: Int32Array, aLo: number, aHi: number, b: Int32Array, bLo: number, bHi: number, out: number[]): boolean {
  const ca = new Map<number, number>();
  for (let i = aLo; i < aHi; i++) ca.set(a[i], ca.has(a[i]) ? -1 : i);
  const cb = new Map<number, number>();
  for (let j = bLo; j < bHi; j++) {
    const ai = ca.get(b[j]);
    if (ai === undefined || ai < 0) continue;
    cb.set(b[j], cb.has(b[j]) ? -1 : j);
  }
  const anchorsA: number[] = [];
  const anchorsB: number[] = [];
  for (let i = aLo; i < aHi; i++) {
    if (ca.get(a[i]) !== i) continue;
    const bj = cb.get(a[i]);
    if (bj === undefined || bj < 0) continue;
    // A lone coincidental match is a poor anchor: require a matching
    // neighbour (or a segment boundary) on at least one side.
    const before = i === aLo || bj === bLo || a[i - 1] === b[bj - 1];
    const after = i === aHi - 1 || bj === bHi - 1 || a[i + 1] === b[bj + 1];
    if (!before && !after) continue;
    anchorsA.push(i);
    anchorsB.push(bj);
  }
  if (anchorsA.length === 0) return false;
  const chain = lis(anchorsB);
  let pa = aLo;
  let pb = bLo;
  for (const c of chain) {
    const ai = anchorsA[c];
    const bj = anchorsB[c];
    matchRange(a, pa, ai, b, pb, bj, out);
    out.push(ai, bj);
    pa = ai + 1;
    pb = bj + 1;
  }
  matchRange(a, pa, aHi, b, pb, bHi, out);
  return true;
}

/** Matched index pairs [a0, b0, a1, b1, ...] in increasing order. */
export function matchSequences(a: Int32Array, b: Int32Array): Int32Array {
  const out: number[] = [];
  matchRange(a, 0, a.length, b, 0, b.length, out);
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
}

/**
 * Remove short equalities that sit between larger changes ("semantic
 * clean-up", after diff-match-patch). `weightA/B(i)` give the visual weight
 * (e.g. character count) of token i; `canDissolve(eq, before, after)` decides
 * whether an equality between two change groups may be folded into them.
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
  let changed = true;
  let cur = ops;
  while (changed) {
    changed = false;
    // Group into [equal | changeGroup] sequence.
    type Group = { eq: boolean; a0: number; a1: number; b0: number; b1: number };
    const groups: Group[] = [];
    for (const op of cur) {
      const eq = op.type === 'equal';
      const last = groups[groups.length - 1];
      if (last && !last.eq && !eq) {
        last.a1 = Math.max(last.a1, op.a1);
        last.b1 = Math.max(last.b1, op.b1);
        last.a0 = Math.min(last.a0, op.a0);
        last.b0 = Math.min(last.b0, op.b0);
      } else groups.push({ eq, a0: op.a0, a1: op.a1, b0: op.b0, b1: op.b1 });
    }
    const out: Group[] = [];
    for (let g = 0; g < groups.length; g++) {
      const grp = groups[g];
      if (grp.eq && g > 0 && g < groups.length - 1 && !groups[g - 1].eq && !groups[g + 1].eq) {
        const before = groups[g - 1];
        const after = groups[g + 1];
        const len = wA(grp.a0, grp.a1);
        const lb = Math.max(wA(before.a0, before.a1), wB(before.b0, before.b1));
        const la = Math.max(wA(after.a0, after.a1), wB(after.b0, after.b1));
        if (len <= lb && len <= la && canDissolve(grp, before, after)) {
          // Merge before + this + after into one change group.
          const prev = out.pop()!;
          out.push({ eq: false, a0: prev.a0, a1: after.a1, b0: prev.b0, b1: after.b1 });
          g++;
          changed = true;
          continue;
        }
      }
      const last = out[out.length - 1];
      if (last && !last.eq && !grp.eq) {
        last.a1 = grp.a1;
        last.b1 = grp.b1;
      } else out.push({ ...grp });
    }
    cur = [];
    for (const grp of out) {
      if (grp.eq) cur.push({ type: 'equal', a0: grp.a0, a1: grp.a1, b0: grp.b0, b1: grp.b1 });
      else {
        if (grp.a1 > grp.a0) cur.push({ type: 'delete', a0: grp.a0, a1: grp.a1, b0: grp.b0, b1: grp.b0 });
        if (grp.b1 > grp.b0) cur.push({ type: 'insert', a0: grp.a1, a1: grp.a1, b0: grp.b0, b1: grp.b1 });
      }
    }
  }
  return cur;
}
