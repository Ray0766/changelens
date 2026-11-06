import type { DocModel, DocText, Line, Rect, TextRun, Token, TokenKind } from './types.ts';
import { charWeight, isWide } from './fontwidths.ts';
import { detectFurniture, marginZone } from './furniture.ts';
import { union } from './geometry.ts';

interface Char {
  ch: string;
  /** The character as classified: half-/full-width forms folded ("，" → ","). */
  n: string;
  x0: number;
  x1: number;
  /** The run, in the upright frame of its text direction (see upright()). */
  run: TextRun;
  /** Virtual separator inserted between runs. */
  virtual?: boolean;
}

interface RawLine {
  page: number;
  runs: TextRun[];
  /** Drawn after the page's footer and left at the end of the page (see restoreReadingOrder). */
  late?: true;
}

const WS = /\s|\u00a0|\u3000|\u200b/;
const SHY = '\u00ad';

/**
 * Scripts compared character by character: Han and Japanese kana. Hangul is
 * not included: Korean separates words with spaces, so it is compared word
 * by word like Latin text.
 */
export function isCJK(cp: number): boolean {
  return (
    (cp >= 0x3040 && cp <= 0x30ff) || // Hiragana, Katakana
    (cp >= 0x3400 && cp <= 0x4dbf) || // CJK Ext A
    (cp >= 0x4e00 && cp <= 0x9fff) || // CJK Unified
    (cp >= 0xf900 && cp <= 0xfaff) || // Compatibility ideographs
    (cp >= 0x20000 && cp <= 0x3134f) // Ext B+
  );
}

const LETTER = /[\p{L}\p{M}]/u;
const DIGIT = /\p{N}/u;

function classify(ch: string): 'space' | 'cjk' | 'alnum' | 'other' {
  if (WS.test(ch)) return 'space';
  const cp = ch.codePointAt(0)!;
  if (isCJK(cp)) return 'cjk';
  if (LETTER.test(ch) || DIGIT.test(ch)) return 'alnum';
  return 'other';
}

/** Half-width and full-width forms ("１２，０００", "（", "ｱ") are tokenised like their ordinary counterparts. */
function fold(ch: string): string {
  const cp = ch.codePointAt(0)!;
  return cp >= 0xff01 && cp <= 0xffee ? ch.normalize('NFKC') : ch;
}

// --------------------------------------------------------------- rotation ---

/**
 * Rotated text (angle ≠ 0, e.g. every run on a page with /Rotate 90) is laid
 * out in the upright frame of its direction: the run is turned back by its
 * angle so that it reads left to right, lines and characters are worked out
 * there, and the resulting boxes are turned forward into page space.
 */
export function upright(r: TextRun): TextRun {
  if (r.angle === 0 || !r.rot) return r;
  const a = (r.angle * Math.PI) / 180;
  const u = r.rot.x * Math.cos(a) + r.baseline * Math.sin(a);
  const v = -r.rot.x * Math.sin(a) + r.baseline * Math.cos(a);
  return { ...r, x: u, y: v - r.rot.ascent, w: r.rot.len, h: r.rot.ascent + r.rot.descent, baseline: v };
}

/** Turn a rect from the upright frame of `run` into page space (dir 1) or back (dir -1); returns the bounding box. */
function turn(rect: Rect, run: TextRun, dir: 1 | -1): Rect {
  if (run.angle === 0 || !run.rot) return rect;
  const a = (dir * run.angle * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const xs: number[] = [];
  const ys: number[] = [];
  for (const [x, y] of [
    [rect.x, rect.y],
    [rect.x + rect.w, rect.y],
    [rect.x + rect.w, rect.y + rect.h],
    [rect.x, rect.y + rect.h],
  ]) {
    xs.push(x * cos - y * sin);
    ys.push(x * sin + y * cos);
  }
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/** Split runs into visual lines, using PDF.js EOL hints plus geometry. */
function groupLines(page: number, runs: TextRun[]): RawLine[] {
  const lines: RawLine[] = [];
  let cur: RawLine | null = null;
  let lastEnd = -Infinity;
  let lastBaseline = 0;
  let lastSize = 0;
  let forceBreak = false;
  for (const r of runs) {
    const blank = r.str.trim() === '';
    if (cur && blank && !forceBreak) {
      // Whitespace runs never start a line; they only separate words.
      // (Their width often spans to the next table cell, so they do not
      // advance lastEnd.)
      if (r.angle === cur.runs[0].angle && Math.abs(r.baseline - lastBaseline) < 0.5 * Math.max(lastSize, r.fontSize, 1)) cur.runs.push(r);
      if (r.eol) forceBreak = true;
      continue;
    }
    if (blank) {
      if (r.eol) forceBreak = true;
      continue;
    }
    const size = Math.max(lastSize, r.fontSize, 1);
    // Runs share a line only in the same direction; rotated runs are in the
    // upright frame of their direction (rotated runs without that geometry
    // stay on their own).
    const sameLine =
      cur !== null &&
      !forceBreak &&
      r.angle === cur.runs[0].angle &&
      (r.angle === 0 || r.rot !== undefined) &&
      Math.abs(r.baseline - lastBaseline) < 0.5 * size &&
      r.x > lastEnd - 0.6 * size;
    if (!sameLine) {
      cur = { page, runs: [] };
      lines.push(cur);
      lastEnd = -Infinity;
    }
    cur!.runs.push(r);
    lastEnd = Math.max(lastEnd, r.x + r.w);
    lastBaseline = r.baseline;
    lastSize = r.fontSize;
    forceBreak = r.eol;
  }
  return lines;
}

// ---------------------------------------------------- text out of order ---

/** Geometry of a raw line on an upright page, worked out from its visible runs. */
interface LineBox {
  x0: number;
  x1: number;
  top: number;
  bottom: number;
  baseline: number;
  size: number;
  zone?: 'top' | 'bottom';
  /** The visible runs (blank runs only separate words). */
  inked: TextRun[];
}

function lineBox(line: RawLine, pageBox: Rect): LineBox | null {
  const inked = line.runs.filter((r) => r.str.trim() !== '');
  if (!inked.length) return null;
  const x0 = Math.min(...inked.map((r) => r.x));
  const x1 = Math.max(...inked.map((r) => r.x + r.w));
  const top = Math.min(...inked.map((r) => r.y));
  const bottom = Math.max(...inked.map((r) => r.y + r.h));
  const size = Math.max(1, mostCommon(inked.map((r) => r.fontSize)));
  const zone = marginZone({ x: x0, y: top, w: x1 - x0, h: bottom - top }, pageBox);
  return { x0, x1, top, bottom, baseline: inked[0].baseline, size, ...(zone ? { zone } : {}), inked };
}

const overlapX = (a: { x0: number; x1: number }, b: { x0: number; x1: number }) => Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);

/** Lines of one page put back in reading order (see restoreReadingOrder). */
interface Reordered {
  lines: RawLine[];
  /** Lines drawn after the footer that were placed by their position. */
  placed: number;
}

/**
 * PDF editors that redact text and write the new text in its place
 * (PyMuPDF's insert_text, insert_htmlbox and redaction replacement text)
 * append that text to the end of the page's content, after the footer. In
 * stream order, the new value then follows the footer, and a re-typed amount
 * reads as a deletion in place plus an insertion at the end of the page.
 *
 * Such lines are put back where they stand on the page. The rule applies
 * only to upright lines (turned text, such as a turned page, a margin note
 * or a watermark, is neither moved nor moved into) on a page without form
 * field values, where
 *  - a footer was drawn after the body: a line in the bottom margin, below
 *    every line drawn before it and at least one line height under the
 *    lowest of them, with body text (outside the margins) before it.
 * A line drawn after that footer, outside the bottom margin, is placed
 *  - into a line drawn before the footer whose baseline it shares, at its x,
 *    where it does not overprint that line's glyphs, and either fills a gap
 *    inside the line, or the lines just before and after that line in the
 *    stream reach across its whole width (a cell of the same table or a word
 *    of the same paragraph, not another column); or else
 *  - between two lines drawn one after the other before the footer, one
 *    under the other, that it fits between and overlaps horizontally.
 * Anything else stays where the stream has it: a right column, a sidebar
 * or a margin note drawn last does not share its baseline with a line whose
 * neighbours reach across it, a page number drawn last lies in the bottom
 * margin, and on a page whose footer comes first nothing follows the footer.
 * Late lines left there outside the bottom margin are marked (Token.late),
 * as their place in the reading order is not known. Pages without such a
 * footer, and pages in reading order, are unchanged. Lines left out (blank
 * or turned) keep their place in the stream.
 */
function restoreReadingOrder(lines: RawLine[], width: number, height: number): Reordered {
  const none: Reordered = { lines, placed: 0 };
  if (lines.some((l) => l.runs.some((r) => r.field))) return none;
  const boxes = lines.map((l) => (l.runs.some((r) => r.angle !== 0) ? null : lineBox(l, { x: 0, y: 0, w: width, h: height })));
  let footer = -1;
  let lowest = -Infinity;
  let body = false;
  for (let k = 0; k < lines.length; k++) {
    const b = boxes[k];
    if (!b) continue;
    if (b.zone === 'bottom' && body && b.top >= lowest + b.size) {
      footer = k;
      break;
    }
    if (!b.zone) body = true;
    lowest = Math.max(lowest, b.bottom);
  }
  if (footer < 0) return none;
  // Lines drawn before the footer, in stream order (blank lines skipped).
  const before: number[] = [];
  for (let k = 0; k < footer; k++) if (boxes[k]) before.push(k);
  /** Late lines merged into a line drawn before the footer, by that line. */
  const into = new Map<number, number[]>();
  /** Late lines put after a line drawn before the footer, by that line. */
  const after = new Map<number, number[]>();
  const add = (m: Map<number, number[]>, at: number, k: number) => {
    const list = m.get(at);
    if (list) list.push(k);
    else m.set(at, [k]);
  };
  const moved = new Set<number>();
  const kept = new Set<number>();
  for (let k = footer + 1; k < lines.length; k++) {
    const late = boxes[k];
    if (!late || late.zone === 'bottom') continue;
    const target = sharedBaseline(late, before, boxes);
    const gap = target < 0 ? gapAbove(late, before, boxes) : -1;
    if (target >= 0) add(into, target, k);
    else if (gap >= 0) add(after, gap, k);
    else {
      kept.add(k);
      continue;
    }
    moved.add(k);
  }
  if (!moved.size && !kept.size) return none;
  const out: RawLine[] = [];
  lines.forEach((line, k) => {
    if (moved.has(k)) return;
    const extra = into.get(k);
    out.push(extra ? { page: line.page, runs: mergeRuns(line.runs, extra.flatMap((j) => lines[j].runs)) } : kept.has(k) ? { ...line, late: true } : line);
    for (const j of (after.get(k) ?? []).sort((a, b) => boxes[a]!.top - boxes[b]!.top)) out.push(lines[j]);
  });
  return { lines: out, placed: moved.size };
}

/**
 * The line drawn before the footer that a late line belongs to (-1 if
 * none): the same baseline, no glyphs overprinted, and either inside the
 * line's span or within the width of the lines just before and after it in
 * the stream.
 */
function sharedBaseline(late: LineBox, before: number[], boxes: (LineBox | null)[]): number {
  let best = -1;
  let bestD = Infinity;
  for (let n = 0; n < before.length; n++) {
    const e = boxes[before[n]]!;
    const size = Math.max(e.size, late.size);
    const d = Math.abs(e.baseline - late.baseline);
    if (d > 0.35 * size || d >= bestD) continue;
    if (e.inked.some((r) => overlapX({ x0: r.x, x1: r.x + r.w }, late) > 0.25 * Math.min(e.size, late.size))) continue;
    const inside = late.x0 >= e.x0 && late.x1 <= e.x1;
    if (!inside) {
      const width = late.x1 - late.x0;
      const reaches = (j: number) => {
        const o = j >= 0 && j < before.length ? boxes[before[j]]! : null;
        return !!o && Math.abs(o.baseline - e.baseline) <= 2.5 * size && overlapX(o, late) >= 0.8 * width;
      };
      if (!reaches(n - 1) || !reaches(n + 1)) continue;
    }
    best = before[n];
    bestD = d;
  }
  return best;
}

/**
 * The line after which a late line goes (-1 if none): the first of two
 * lines drawn one after the other, one under the other, that the late line
 * fits between and overlaps horizontally.
 */
function gapAbove(late: LineBox, before: number[], boxes: (LineBox | null)[]): number {
  const tol = 0.25 * late.size;
  for (let n = 0; n + 1 < before.length; n++) {
    const a = boxes[before[n]]!;
    const b = boxes[before[n + 1]]!;
    if (b.top < a.bottom - tol) continue;
    if (late.top < a.bottom - tol || late.bottom > b.top + tol) continue;
    if (overlapX(a, late) <= 0 || overlapX(b, late) <= 0) continue;
    return before[n];
  }
  return -1;
}

/** A line's runs with late runs put in at their x (a blank run stays after the run before it). */
function mergeRuns(runs: TextRun[], extra: TextRun[]): TextRun[] {
  const out = runs.slice();
  let last = -1;
  for (const r of extra) {
    if (r.str.trim() === '') {
      if (last >= 0) out.splice(++last, 0, r);
      continue;
    }
    last = out.findIndex((o) => o.x >= r.x);
    if (last < 0) last = out.length;
    out.splice(last, 0, r);
  }
  return out;
}

/** Expand a line's runs into positioned characters. */
function lineChars(line: RawLine): Char[] {
  const chars: Char[] = [];
  let prevEnd: number | null = null;
  let prevRun: TextRun | null = null;
  for (const run of line.runs) {
    const str = run.str.normalize('NFC');
    const cps = Array.from(str);
    if (cps.length === 0) continue;
    if (prevEnd !== null && prevRun) {
      const gap = run.x - prevEnd;
      const lastCh = chars.length ? chars[chars.length - 1].ch : ' ';
      if (gap > 0.18 * Math.max(run.fontSize, prevRun.fontSize) && !WS.test(lastCh) && !WS.test(cps[0])) {
        chars.push({ ch: ' ', n: ' ', x0: prevEnd, x1: run.x, run, virtual: true });
      }
    }
    // A comb field draws one character per cell of equal width.
    const weights = cps.map((c) => (run.comb ? 1 : charWeight(c, run.family)));
    const total = weights.reduce((a, b) => a + b, 0) || 1;
    let acc = 0;
    for (let k = 0; k < cps.length; k++) {
      const x0 = run.x + (run.w * acc) / total;
      acc += weights[k];
      const x1 = run.x + (run.w * acc) / total;
      chars.push({ ch: cps[k], n: fold(cps[k]), x0, x1, run });
    }
    prevEnd = run.x + run.w;
    prevRun = run;
  }
  return chars;
}

const JOIN_DIGITS = new Set(['.', ',', ':', '/']);
/**
 * Joined between two letters or digits: apostrophes, hyphens, and the figure
 * dash, en dash and minus of ranges ("10–20" is one token, like "10-20";
 * baseKey compares the dashes alike).
 */
const JOIN_ALNUM = new Set(["'", '’', '-', '\u2010', '\u2011', '\u2012', '\u2013', '\u2212']);
const HYPHENS = new Set(['-', '\u2010', SHY]);
/** Minus/plus signs: hyphen-minus, U+2212 minus, en dash (often used as minus), plus. */
const SIGNS = new Set(['-', '\u2212', '\u2013', '+']);
const OPENERS = new Set(['(', '[', '{', '=', ':', '$', '€', '£', '¥']);
const CURRENCY = new Set(['$', '€', '£', '¥', '₹', '₩', '¢', '₽', '₺']);
/** Spaces that group thousands ("1 234 567"); PDF.js often reports NBSP and NNBSP as plain spaces. */
const GROUP_SPACE = new Set([' ', '\u00a0', '\u2009', '\u202f']);

function tokenKind(text: string, cls: string): TokenKind {
  if (cls === 'cjk') return 'cjk';
  if (cls === 'other') return 'punct';
  return DIGIT.test(text) && !LETTER.test(text) ? 'number' : 'word';
}

/**
 * Normalisation shared by every comparison: ligatures, quotes, widths, dash
 * styles and the length of dot leaders ("Introduction ........ 9"), which
 * follows the layout. Hyphens inside words are kept ("re-sign" ≠ "resign").
 */
export function baseKey(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‐-―−]/g, '-')
    .replace(/([.·‧・])\1{2,}/g, '$1$1$1');
}

/** Reconstruct readable text from tokens, honouring original spacing. */
export function joinTokens(tokens: Token[]): string {
  let s = '';
  for (let k = 0; k < tokens.length; k++) {
    const t = tokens[k];
    if (k > 0 && t.spaceBefore) {
      const prev = tokens[k - 1];
      // A line break between two CJK characters is not a space, also where
      // the paragraph goes on over a page break.
      const wide = isWideToken(prev) || isWideToken(t);
      const cjkBreak = prev.line !== t.line && ((prev.block === t.block && wide) || (prev.page !== t.page && isWideToken(prev) && isWideToken(t)));
      if (!cjkBreak) s += ' ';
    }
    s += t.text;
  }
  return s;
}

function isWideToken(t: Token): boolean {
  return t.kind === 'cjk' || (t.kind === 'punct' && isWide(t.text.codePointAt(0)!));
}

interface Tok {
  text: string;
  kind: TokenKind;
  chars: Char[];
  spaceBefore: boolean;
}

/** Currency codes and units that mark an amount ("100 000 EUR", "CHF 100 000"). */
const AMOUNT_WORD = /^(?:eur|usd|chf|gbp|cny|rmb|jpy|cad|aud|sek|nok|dkk|pln|czk|huf|fr|kr|zł|euros?|dollars?|francs?)$/i;

/** The character or word next to position `i` (skipping one space) in direction `dir`. */
function neighbour(chars: Char[], i: number, dir: 1 | -1): string {
  if (chars[i] && GROUP_SPACE.has(chars[i].ch)) i += dir;
  if (!chars[i]) return '';
  if (!LETTER.test(chars[i].n)) return chars[i].n;
  let w = '';
  while (chars[i] && LETTER.test(chars[i].n)) {
    w = dir === 1 ? w + chars[i].n : chars[i].n + w;
    i += dir;
  }
  return w;
}

/**
 * If chars[j] is a space that groups thousands ("1 234 567", "12 500 €"),
 * return the index after the last group it starts, else -1. The digits from
 * `start` to j must be a 1–3 digit number ("2025 100" is not grouped), every
 * group exactly three digits that no letter follows, and all spaces inside
 * one text run (a gap between runs, such as a table column, never joins).
 * PDF.js often reports no-break and thin spaces as plain spaces (Chromium
 * and LibreOffice already write them as plain spaces), so a plain space only
 * joins in an amount-like context: two or more groups after a 1–2 digit
 * lead ("1 234 567"), groups that start with a zero ("120 000"), a decimal
 * part, or a currency sign, code or % next to the number. "100 200", "10 500"
 * and "120 135 150" stay separate numbers: in a table row or a list they are
 * usually separate figures, and joining them would invent an amount.
 */
function groupEnd(chars: Char[], start: number, j: number): number {
  if (j <= start || !GROUP_SPACE.has(chars[j].ch)) return -1;
  const lead = chars
    .slice(start, j)
    .map((c) => c.n)
    .join('');
  if (!/^[0-9]{1,3}$/.test(lead)) return -1;
  const run = chars[j - 1].run;
  let e = j;
  let groups = 0;
  let special = false;
  for (;;) {
    const sp = chars[e];
    if (!sp || sp.virtual || !GROUP_SPACE.has(sp.ch) || sp.run !== run) break;
    let ok = true;
    for (let i = e + 1; i <= e + 3; i++) if (!/[0-9]/.test(chars[i]?.n ?? '') || chars[i].run !== run) ok = false;
    const after = chars[e + 4]?.n;
    if (!ok || (after !== undefined && (DIGIT.test(after) || LETTER.test(after)))) break;
    special ||= sp.ch !== ' ';
    groups++;
    e += 4;
  }
  if (groups === 0) return -1;
  const amount = (w: string) => CURRENCY.has(w) || w === '%' || w === '\u2030' || AMOUNT_WORD.test(w);
  // A decimal part after the last group ("12 500,50") marks one amount too.
  const decimal = (chars[e]?.n === ',' || chars[e]?.n === '.') && chars[e].run === run && DIGIT.test(chars[e + 1]?.n ?? '');
  // Several groups after a short lead ("1 234 567"), or groups that start
  // with a zero ("120 000": a figure of its own is not written "000"). A
  // run of 3-digit figures ("120 135 150", "250 400 550") stays apart.
  const grouped = (lead.length <= 2 && groups >= 2) || Array.from({ length: groups }, (_, g) => chars[j + 4 * g + 1].n).every((d) => d === '0');
  const context = special || decimal || grouped || amount(neighbour(chars, start - 1, -1)) || amount(neighbour(chars, e, 1));
  return context ? e : -1;
}

/** End of a number whose digits start at `start`, scanning on from j. */
function numberEnd(chars: Char[], start: number, j: number): number {
  while (j < chars.length) {
    const cj = chars[j].n;
    if (DIGIT.test(cj)) j++;
    else if (JOIN_DIGITS.has(cj) && DIGIT.test(chars[j + 1]?.n ?? '')) j += 2;
    else {
      const g = groupEnd(chars, start, j);
      if (g < 0) break;
      j = g;
    }
  }
  return j;
}

const textOf = (chars: Char[]) => chars.map((c) => c.ch).join('');

/** Two runs where one is set smaller and off the other's baseline. */
function shiftedScript(a: TextRun, b: TextRun): boolean {
  if (a === b) return false;
  const big = Math.max(a.fontSize, b.fontSize);
  const small = Math.min(a.fontSize, b.fontSize);
  return small < 0.9 * big && Math.abs(a.baseline - b.baseline) > 0.2 * big;
}

function tokenizeChars(chars: Char[]): Tok[] {
  const out: Tok[] = [];
  let space = true;
  let k = 0;
  while (k < chars.length) {
    const c = chars[k];
    const cls = classify(c.n);
    if (c.ch === SHY) {
      // A soft hyphen at the end of a line marks a word broken across lines
      // (re-joined by joinHyphenation); anywhere else it is invisible.
      const last = out[out.length - 1];
      if (!space && last?.kind === 'word' && chars.slice(k + 1).every((x) => WS.test(x.ch))) {
        out.push({ text: SHY, kind: 'punct', chars: [c], spaceBefore: false });
      }
      k++;
      continue;
    }
    if (cls === 'space') {
      space = true;
      k++;
      continue;
    }
    if (cls === 'alnum') {
      let j = k + 1;
      while (j < chars.length) {
        const cj = chars[j].n;
        // A superscript or subscript run (a footnote marker "temperatures¹")
        // is its own token, so an added marker is not a rewritten word.
        if (shiftedScript(chars[j - 1].run, chars[j].run)) break;
        if (classify(cj) === 'alnum') {
          j++;
          continue;
        }
        const next = chars[j + 1]?.n;
        const prev = chars[j - 1].n;
        if (next !== undefined && JOIN_DIGITS.has(cj) && DIGIT.test(prev) && DIGIT.test(next)) {
          j += 2;
          continue;
        }
        // "re-sign", "10–20", and a soft hyphen inside a word ("infor\u00admation").
        if (next !== undefined && (JOIN_ALNUM.has(cj) || cj === SHY) && classify(next) === 'alnum') {
          j += 2;
          continue;
        }
        const g = groupEnd(chars, k, j);
        if (g > 0) {
          j = g;
          continue;
        }
        break;
      }
      const slice = chars.slice(k, j).filter((x) => x.ch !== SHY);
      const text = textOf(slice);
      out.push({ text, kind: tokenKind(text, cls), chars: slice, spaceBefore: space });
      space = false;
      k = j;
      continue;
    }
    // A rule or leader ("_____", "........", "———") is one token.
    if (cls === 'other' && chars[k + 1]?.ch === c.ch && chars[k + 2]?.ch === c.ch) {
      let j = k + 3;
      while (chars[j]?.ch === c.ch) j++;
      const slice = chars.slice(k, j);
      out.push({ text: textOf(slice), kind: 'punct', chars: slice, spaceBefore: space });
      space = false;
      k = j;
      continue;
    }
    // Accounting negative: "(1,200)" is one number.
    if (c.n === '(' && DIGIT.test(chars[k + 1]?.n ?? '')) {
      const prev = chars[k - 1]?.n;
      if (!prev || space || OPENERS.has(prev)) {
        const j = numberEnd(chars, k + 1, k + 1);
        const after = chars[j + 1]?.n;
        if (chars[j]?.n === ')' && (after === undefined || classify(after) !== 'alnum')) {
          const slice = chars.slice(k, j + 1);
          out.push({ text: textOf(slice), kind: 'number', chars: slice, spaceBefore: space });
          space = false;
          k = j + 1;
          continue;
        }
      }
    }
    // A sign directly in front of a digit belongs to the number ("−500"),
    // unless it joins two words or numbers ("2026-11", "A-3").
    // "−€62.40": a sign in front of a currency symbol belongs to the amount too.
    const viaCurrency = SIGNS.has(c.n) && CURRENCY.has(chars[k + 1]?.n ?? '') && DIGIT.test(chars[k + 2]?.n ?? '');
    if (SIGNS.has(c.n) && (viaCurrency || DIGIT.test(chars[k + 1]?.n ?? ''))) {
      const prev = chars[k - 1]?.n;
      if (!prev || space || OPENERS.has(prev)) {
        const d = k + (viaCurrency ? 2 : 1);
        const j = numberEnd(chars, d, d + 1);
        const slice = chars.slice(k, j);
        out.push({ text: textOf(slice), kind: 'number', chars: slice, spaceBefore: space });
        space = false;
        k = j;
        continue;
      }
    }
    out.push({ text: c.ch, kind: tokenKind(c.n, cls), chars: [c], spaceBefore: space });
    space = false;
    k++;
  }
  return out;
}

function charsRect(chars: Char[]): Rect {
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const c of chars) {
    x0 = Math.min(x0, c.x0);
    x1 = Math.max(x1, c.x1);
    y0 = Math.min(y0, c.run.y);
    y1 = Math.max(y1, c.run.y + c.run.h);
  }
  return { x: x0, y: y0, w: Math.max(0.5, x1 - x0), h: Math.max(0.5, y1 - y0) };
}

function mostCommon<T>(values: T[]): T {
  const counts = new Map<T, number>();
  let best = values[0];
  let bestN = 0;
  for (const v of values) {
    const n = (counts.get(v) ?? 0) + 1;
    counts.set(v, n);
    if (n > bestN) {
      bestN = n;
      best = v;
    }
  }
  return best;
}

/**
 * Turn the raw text runs of a document into a token stream with geometry,
 * lines, paragraphs (blocks) and header/footer flags.
 */
export function buildDocModel(doc: DocText): DocModel {
  const tokens: Token[] = [];
  const lines: Line[] = [];
  let blockId = -1;

  const outOfOrder = new Map<number, number>();
  for (const page of doc.pages) {
    const order = restoreReadingOrder(groupLines(page.index, page.runs.map(upright)), page.width, page.height);
    const raw = order.lines;
    if (order.placed) outOfOrder.set(page.index, order.placed);
    let prev: { rect: Rect; size: number; angle: number; last: Tok } | null = null;
    for (const rl of raw) {
      const chars = lineChars(rl);
      const toks = tokenizeChars(chars);
      if (toks.length === 0) continue;
      // Geometry is worked out in the upright frame of the line's direction
      // (page space for ordinary text) and turned into page space for output.
      const frame = rl.runs[0];
      const rect = union(toks.map((t) => charsRect(t.chars)));
      const size = mostCommon(rl.runs.filter((r) => r.str.trim()).map((r) => Math.round(r.fontSize * 10) / 10));
      // New paragraph when the vertical gap is large or the font size jumps.
      // With a wide line spacing (double spacing, loose CJK layouts) a line
      // that carries on the sentence of the line above stays in its
      // paragraph although the gap is large.
      const gap = prev ? rect.y - (prev.rect.y + prev.rect.h) : Infinity;
      const newBlock =
        !prev ||
        prev.angle !== frame.angle ||
        (gap > 0.75 * size && !(gap <= 1.5 * size && carriesOnLine(prev.last, toks[0]))) ||
        gap < -2 * size ||
        Math.abs(size - prev.size) > 0.15 * Math.max(size, prev.size);
      if (newBlock) blockId++;
      const id = lines.length;
      const start = tokens.length;
      for (const t of toks) {
        const r = turn(charsRect(t.chars), frame, 1);
        const runs = t.chars.filter((c) => !c.virtual).map((c) => c.run);
        const main = runs[0] ?? t.chars[0].run;
        tokens.push({
          i: tokens.length,
          text: t.text,
          key: '',
          kind: t.kind,
          page: page.index,
          line: id,
          block: blockId,
          rects: [r],
          font: main.font,
          size: main.fontSize,
          spaceBefore: t.spaceBefore,
          furniture: false,
          ...(main.field ? { field: true as const } : {}),
          ...(main.comb ? { comb: true as const } : {}),
          ...(main.autoSize ? { autoSize: true as const } : {}),
          ...(main.widget ? { widget: main.widget } : {}),
          ...(rl.late ? { late: true as const } : {}),
        });
      }
      const line: Line = {
        id,
        page: page.index,
        block: blockId,
        rect: turn(rect, frame, 1),
        text: textOf(chars).replace(/\u00ad/g, '').replace(/\s+/g, ' ').trim(),
        start,
        end: tokens.length,
        furniture: false,
      };
      const zone = marginZone(rect, turn({ x: 0, y: 0, w: page.width, h: page.height }, frame, -1));
      if (zone) line.zone = zone;
      lines.push(line);
      prev = { rect, size, angle: frame.angle, last: toks[toks.length - 1] };
    }
  }

  detectFurniture(doc, lines, tokens);
  const joined = joinHyphenation(tokens, lines);

  return {
    name: doc.name,
    pages: doc.pages.map((p) => {
      const angle = textAngle(p.runs);
      return {
        index: p.index,
        width: p.width,
        height: p.height,
        unmapped: p.unmapped ?? 0,
        ...(angle ? { textAngle: angle } : {}),
        ...(p.fieldsUnread ? { fieldsUnread: p.fieldsUnread } : {}),
        ...(outOfOrder.has(p.index) ? { outOfOrder: outOfOrder.get(p.index) } : {}),
      };
    }),
    tokens: joined.tokens,
    lines: joined.lines,
    runs: doc.pages.map((p) => p.runs),
  };
}

/**
 * A line that ends in the middle of a sentence followed by one that carries
 * it on: Chinese or Japanese text after a character, a figure or a comma
 * ("…双方可另行签" / "订补充协议…"), or Latin text continuing in lower
 * case after a word, a figure, a comma or a hyphen. A line ending with a
 * full stop, colon or closing mark, a heading followed by a capital, a list
 * item followed by its bullet or number, all start a new paragraph as
 * before.
 */
function carriesOnLine(last: Tok, first: Tok): boolean {
  const open = /^[,;，、；（(“‘《「\-\u2010\u00ad]$/.test(last.text);
  if (first.kind === 'cjk') return last.kind !== 'punct' || open;
  if (first.kind === 'word' && /^\p{Ll}/u.test(first.text)) return last.kind === 'word' || last.kind === 'number' || open;
  return false;
}

/** The direction most characters on a page run in (0 for ordinary text). */
function textAngle(runs: TextRun[]): number {
  const count = new Map<number, number>();
  for (const r of runs) count.set(r.angle, (count.get(r.angle) ?? 0) + r.str.trim().length);
  let best = 0;
  for (const [angle, n] of count) if (n > (count.get(best) ?? 0)) best = angle;
  return best;
}

/** German conjunctions after a suspended compound ("Ein- und Ausgaben", "Vor- bzw. Nachteile"). */
const SUSPENDED_DE = new Set(['und', 'oder', 'bis', 'sowie', 'bzw']);
/** English ones: "pre- and post-war", "short- to long-term". */
const SUSPENDED_EN = new Set(['and', 'or', 'nor', 'to']);

/**
 * A hyphen at a line end followed by a conjunction marks a suspended
 * compound, not a word broken across lines. For English the next word must
 * also look like the second half of such a pair (hyphenated or capitalised),
 * so that "pho-" + "to" still joins into "photo".
 */
function suspendedCompound(tokens: Token[], cont: Token, next: Line): boolean {
  const w = cont.text.toLowerCase();
  if (SUSPENDED_DE.has(w)) return true;
  if (!SUSPENDED_EN.has(w)) return false;
  const after = cont.i + 1 < next.end ? tokens[cont.i + 1] : undefined;
  return after?.kind === 'word' && (/^\p{Lu}/u.test(after.text) || /\p{L}[-\u2010\u2011]\p{L}/u.test(after.text));
}

/**
 * Re-join words hyphenated at a line break ("infor-" + "mation"), so that
 * re-flowed text compares equal. Returns re-indexed tokens and lines.
 */
function joinHyphenation(tokens: Token[], lines: Line[]): { tokens: Token[]; lines: Line[] } {
  const drop = new Set<number>();
  for (let li = 0; li < lines.length - 1; li++) {
    const line = lines[li];
    if (line.furniture || line.end - line.start < 2) continue;
    // Next non-furniture line.
    let nj = li + 1;
    while (nj < lines.length && lines[nj].furniture) nj++;
    if (nj >= lines.length) continue;
    const next = lines[nj];
    if (next.block !== line.block && next.page === line.page) continue;
    const hy = tokens[line.end - 1];
    const word = tokens[line.end - 2];
    const cont = tokens[next.start];
    if (!hy || !word || !cont || drop.has(word.i)) continue;
    if (!HYPHENS.has(hy.text) || hy.spaceBefore || word.kind !== 'word') continue;
    // A compound broken at its own hyphen before a capital or a figure
    // ("Baden-" + "Württemberg", "COVID-" + "19") keeps the hyphen: such
    // a part never loses it.
    if (hy.text !== SHY && (cont.kind === 'number' || (cont.kind === 'word' && /^\p{Lu}/u.test(cont.text)))) {
      word.text += hy.text + cont.text;
      word.rects = [...word.rects, ...hy.rects, ...cont.rects];
      drop.add(hy.i);
      drop.add(cont.i);
      continue;
    }
    if (cont.kind !== 'word') continue;
    // A soft hyphen always marks a broken word; a visible one only before a
    // lower-case continuation that is not the conjunction of a suspended compound.
    if (hy.text !== SHY && (!/^\p{Ll}/u.test(cont.text) || suspendedCompound(tokens, cont, next))) continue;
    // A hyphen-minus may also belong to the word ("well-" + "known"):
    // syncHyphenation decides once both versions are known.
    if (hy.text === '-') word.hyphenParts = [word.text, cont.text];
    word.text += cont.text;
    word.rects = [...word.rects, ...cont.rects];
    drop.add(hy.i);
    drop.add(cont.i);
  }
  // Soft hyphens left over are invisible.
  for (const t of tokens) if (t.text === SHY) drop.add(t.i);
  if (drop.size === 0) return { tokens, lines };
  const remap = new Int32Array(tokens.length + 1);
  const out: Token[] = [];
  for (const t of tokens) {
    remap[t.i] = out.length;
    if (drop.has(t.i)) continue;
    t.i = out.length;
    out.push(t);
  }
  remap[tokens.length] = out.length;
  const outLines = lines.map((l) => {
    // Dropped tokens map to the index of the next surviving token.
    let start = l.start;
    while (start < l.end && drop.has(start)) start++;
    let end = l.end;
    while (end > start && drop.has(end - 1)) end--;
    const s = start < l.end ? remap[start] : remap[l.end];
    const e = end > start ? remap[end - 1] + 1 : s;
    return { ...l, start: s, end: e };
  });
  return { tokens: out, lines: outLines };
}

/**
 * A hyphen-minus at a line end is either a line-break hyphen ("infor-" +
 * "mation") or part of a compound ("well-" + "known"). Decide for each such
 * word from how it is written where it is not broken — in the same version
 * first, then in the other one — so that re-flowed text compares equal while
 * an edit such as "re-sign" → "resign" is still reported. Without evidence
 * the hyphen is dropped. Safe to call again (e.g. for another comparison).
 */
export function syncHyphenation(a: DocModel, b: DocModel): void {
  if (!a.tokens.some((t) => t.hyphenParts) && !b.tokens.some((t) => t.hyphenParts)) return;
  const norm = (s: string) => baseKey(s).toLowerCase();
  const vocab = (d: DocModel) => new Set(d.tokens.filter((t) => !t.hyphenParts && t.kind === 'word').map((t) => norm(t.text)));
  const va = vocab(a);
  const vb = vocab(b);
  for (const [d, own, other] of [
    [a, va, vb],
    [b, vb, va],
  ] as const) {
    for (const t of d.tokens) {
      if (!t.hyphenParts) continue;
      const [left, right] = t.hyphenParts;
      const hyphenated = norm(left + '-' + right);
      const keep = own.has(hyphenated) || (!own.has(norm(left + right)) && other.has(hyphenated));
      t.text = keep ? left + '-' + right : left + right;
    }
  }
}
