import type { DocModel, DocText, Line, Rect, TextRun, Token, TokenKind } from './types.ts';
import { charWeight, isWide } from './fontwidths.ts';
import { detectFurniture } from './furniture.ts';
import { union } from './geometry.ts';

interface Char {
  ch: string;
  x0: number;
  x1: number;
  run: TextRun;
  /** Virtual separator inserted between runs. */
  virtual?: boolean;
}

interface RawLine {
  page: number;
  runs: TextRun[];
}

const WS = /\s| |　|​/;

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
      if (Math.abs(r.baseline - lastBaseline) < 0.5 * Math.max(lastSize, r.fontSize, 1)) cur.runs.push(r);
      if (r.eol) forceBreak = true;
      continue;
    }
    if (blank) {
      if (r.eol) forceBreak = true;
      continue;
    }
    const size = Math.max(lastSize, r.fontSize, 1);
    const sameLine =
      cur !== null &&
      !forceBreak &&
      r.angle === 0 &&
      cur.runs[0].angle === 0 &&
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
        chars.push({ ch: ' ', x0: prevEnd, x1: run.x, run, virtual: true });
      }
    }
    const weights = cps.map((c) => charWeight(c, run.family));
    const total = weights.reduce((a, b) => a + b, 0) || 1;
    let acc = 0;
    for (let k = 0; k < cps.length; k++) {
      const x0 = run.x + (run.w * acc) / total;
      acc += weights[k];
      const x1 = run.x + (run.w * acc) / total;
      chars.push({ ch: cps[k], x0, x1, run });
    }
    prevEnd = run.x + run.w;
    prevRun = run;
  }
  return chars;
}

const JOIN_DIGITS = new Set(['.', ',', ':', '/']);
const JOIN_ALNUM = new Set(["'", '’', '-', '‐', '‑']);
const HYPHENS = new Set(['-', '‐', '­']);

function tokenKind(text: string, cls: string): TokenKind {
  if (cls === 'cjk') return 'cjk';
  if (cls === 'other') return 'punct';
  return DIGIT.test(text) && !LETTER.test(text) ? 'number' : 'word';
}

/** Normalisation shared by every comparison: ligatures, quotes, widths. */
export function baseKey(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‐-―−]/g, '-')
    .replace(/(?<=\p{L})-(?=\p{L})/gu, '');
}

/** Reconstruct readable text from tokens, honouring original spacing. */
export function joinTokens(tokens: Token[]): string {
  let s = '';
  for (let k = 0; k < tokens.length; k++) {
    const t = tokens[k];
    if (k > 0 && t.spaceBefore) {
      const prev = tokens[k - 1];
      // A line break between two CJK characters is not a space.
      const cjkBreak = prev.line !== t.line && prev.block === t.block && (isWideToken(prev) || isWideToken(t));
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

function tokenizeChars(chars: Char[]): Tok[] {
  const out: Tok[] = [];
  let space = true;
  let k = 0;
  while (k < chars.length) {
    const c = chars[k];
    const cls = classify(c.ch);
    if (c.ch === '­') {
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
        const cj = chars[j].ch;
        if (classify(cj) === 'alnum') {
          j++;
          continue;
        }
        const next = chars[j + 1]?.ch;
        const prev = chars[j - 1].ch;
        if (next !== undefined && JOIN_DIGITS.has(cj) && DIGIT.test(prev) && DIGIT.test(next)) {
          j += 2;
          continue;
        }
        if (next !== undefined && JOIN_ALNUM.has(cj) && classify(next) === 'alnum') {
          j += 2;
          continue;
        }
        break;
      }
      const slice = chars.slice(k, j);
      const text = slice.map((s) => s.ch).join('');
      out.push({ text, kind: tokenKind(text, cls), chars: slice, spaceBefore: space });
      space = false;
      k = j;
      continue;
    }
    out.push({ text: c.ch, kind: tokenKind(c.ch, cls), chars: [c], spaceBefore: space });
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

  for (const page of doc.pages) {
    const raw = groupLines(page.index, page.runs);
    let prev: { rect: Rect; size: number; x: number } | null = null;
    for (const rl of raw) {
      const chars = lineChars(rl);
      const toks = tokenizeChars(chars);
      if (toks.length === 0) continue;
      const rect = union(toks.map((t) => charsRect(t.chars)));
      const size = mostCommon(rl.runs.filter((r) => r.str.trim()).map((r) => Math.round(r.fontSize * 10) / 10));
      // New paragraph when the vertical gap is large or the font size jumps.
      const gap = prev ? rect.y - (prev.rect.y + prev.rect.h) : Infinity;
      const newBlock =
        !prev ||
        gap > 0.75 * size ||
        gap < -2 * size ||
        Math.abs(size - prev.size) > 0.15 * Math.max(size, prev.size);
      if (newBlock) blockId++;
      const id = lines.length;
      const start = tokens.length;
      for (const t of toks) {
        const r = charsRect(t.chars);
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
        });
      }
      lines.push({
        id,
        page: page.index,
        block: blockId,
        rect,
        text: chars.map((c) => c.ch).join('').replace(/\s+/g, ' ').trim(),
        start,
        end: tokens.length,
        furniture: false,
      });
      prev = { rect, size, x: rect.x };
    }
  }

  detectFurniture(doc, lines, tokens);
  const joined = joinHyphenation(tokens, lines);

  return {
    name: doc.name,
    pages: doc.pages.map((p) => ({ index: p.index, width: p.width, height: p.height })),
    tokens: joined.tokens,
    lines: joined.lines,
    runs: doc.pages.map((p) => p.runs),
  };
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
    if (cont.kind !== 'word' || !/^\p{Ll}/u.test(cont.text)) continue;
    word.text += cont.text;
    word.rects = [...word.rects, ...cont.rects];
    drop.add(hy.i);
    drop.add(cont.i);
  }
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
