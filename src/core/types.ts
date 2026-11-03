/**
 * Shared data model. Everything in src/core is environment-agnostic: it runs
 * unchanged in the browser, in Node (CLI) and in tests.
 *
 * Coordinates are PDF points in an unrotated, top-left-origin page space
 * (i.e. a PDF.js viewport at scale 1).
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A run of text as reported by the PDF (one PDF.js text item). */
export interface TextRun {
  str: string;
  /** Bounding box of the run. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Baseline y. */
  baseline: number;
  fontSize: number;
  /** Real font name with subset prefix removed, e.g. "LiberationSerif-Bold". */
  font: string;
  /** Generic family reported by PDF.js: "serif" | "sans-serif" | "monospace". */
  family: string;
  /** PDF.js says a line break follows this run. */
  eol: boolean;
  /** Rotation in degrees (0 for normal horizontal text). */
  angle: number;
}

export interface PageText {
  /** 0-based page index. */
  index: number;
  width: number;
  height: number;
  runs: TextRun[];
  /** Glyphs drawn without a Unicode mapping (their text cannot be compared). */
  unmapped?: number;
}

export interface Coverage {
  /** Pages without any comparable text (e.g. scanned or image-only pages). */
  textless: number[];
  /** Pages with glyphs whose text could not be read, with their count. */
  unreadable: { page: number; count: number }[];
  /** (New version only) pages whose text mostly has no counterpart: pairing is uncertain. */
  uncertain?: { page: number; matched: number }[];
}

export interface DocText {
  name: string;
  pages: PageText[];
}

export type TokenKind = 'word' | 'number' | 'cjk' | 'punct';

export interface Token {
  /** Index in the document's token array. */
  i: number;
  /** Text as displayed (NFC; hyphenation removed when a word was split across lines). */
  text: string;
  /** Comparison key (normalised according to the diff options). */
  key: string;
  kind: TokenKind;
  page: number;
  /** Global line id (unique within the document). */
  line: number;
  /** Paragraph/block id (unique within the document). */
  block: number;
  /** Usually one rect; a word hyphenated across lines has two. */
  rects: Rect[];
  font: string;
  size: number;
  /** Whitespace preceded this token in the source text. */
  spaceBefore: boolean;
  /** Running header/footer or page number. */
  furniture: boolean;
}

export interface Line {
  id: number;
  page: number;
  block: number;
  rect: Rect;
  text: string;
  /** Token index range [start, end) in the document token array. */
  start: number;
  end: number;
  furniture: boolean;
}

export interface DocModel {
  name: string;
  pages: { index: number; width: number; height: number; unmapped: number }[];
  /** All tokens, including furniture, in reading order. */
  tokens: Token[];
  lines: Line[];
  /** Text runs per page (kept for masking and overflow checks). */
  runs: TextRun[][];
}

export interface DiffOptions {
  ignoreCase: boolean;
  ignorePunctuation: boolean;
  /** Ignore running headers, footers and page numbers (default true). */
  ignoreFurniture: boolean;
  /** Report font / size / weight changes of unchanged text. */
  detectFormatting: boolean;
  /**
   * Page pairs set by the reviewer ([old, new], 0-based). They override the
   * automatic page pairing (visual comparison, synchronised scrolling).
   */
  manualPairs?: [number, number][];
}

export const defaultOptions: DiffOptions = {
  ignoreCase: false,
  ignorePunctuation: false,
  ignoreFurniture: true,
  detectFormatting: true,
};

export type ChangeKind =
  | 'insert'
  | 'delete'
  | 'replace'
  | 'move'
  | 'format'
  | 'position'
  | 'overflow'
  | 'graphic';

export type ChangeCategory = 'text' | 'visual';

/** Where a change sits in one of the two documents. */
export interface Side {
  /** Pages touched by the change (0-based, ascending). */
  pages: number[];
  /** Highlight rects keyed by page. */
  rects: { page: number; rect: Rect }[];
  /** Text on this side (empty for the "missing" side of insert/delete). */
  text: string;
  /**
   * For the side where nothing exists (e.g. the old side of an insertion):
   * a caret marking where the content would be.
   */
  caret?: { page: number; x: number; y: number; h: number };
  /** Token index range [start, end) when the change is textual. */
  start?: number;
  end?: number;
}

export interface FormatDetail {
  boldAdded?: boolean;
  boldRemoved?: boolean;
  italicAdded?: boolean;
  italicRemoved?: boolean;
  sizeFrom?: number;
  sizeTo?: number;
  fontFrom?: string;
  fontTo?: string;
  /** Colour or stroke weight of the glyphs changed (found visually). */
  appearanceChanged?: boolean;
}

export interface Change {
  id: string;
  kind: ChangeKind;
  category: ChangeCategory;
  old: Side;
  new: Side;
  /** Both sides consist only of numbers / amounts that differ. */
  numeric?: { from: string; to: string; fromValue: number | null; toValue: number | null };
  /** The deleted/inserted content spans one or more whole paragraphs. */
  wholeParagraphs?: number;
  /** Number of words (Latin) or characters (CJK) affected. */
  size: number;
  /** Mostly CJK content → count in characters, not words. */
  cjk: boolean;
  /** A few tokens of unchanged text before/after, for context. */
  contextBefore: string;
  contextAfter: string;
  format?: FormatDetail;
  overflow?: { edge: 'left' | 'right' | 'top' | 'bottom' | 'margin' };
  /** Unchanged text that moved on the page (points; +x right, +y down). */
  shift?: { dx: number; dy: number };
  /** The same change repeated across the document (e.g. a font replaced everywhere). */
  places?: number;
  /** Graphics only displaced by a few points (layout drift); hidden by default. */
  minor?: boolean;
  /** Not an edit but a consequence of one (e.g. list items renumbered after an insertion). */
  consequence?: 'renumber';
  /** Inserted content that repeats text found elsewhere in the new version (0-based page). */
  duplicateOf?: number;
  /** (Moves) Number of edits inside the moved text; each is listed as its own change. */
  moveEdits?: number;
  /** An edit inside a moved passage: id of that move change. */
  inMove?: string;
  /**
   * (Changes aggregated over several places, see `places`) each place's own
   * text and location; `old.rects` / `new.rects` cover all of them.
   */
  parts?: { old: Side; new: Side }[];
  /** Order key for sorting (position in the new document, then old). */
  order: number;
}

export interface PageLink {
  oldPage: number;
  newPage: number;
  /** Number of matched tokens shared by the two pages. */
  weight: number;
  /** Set by the reviewer rather than derived from matched text. */
  manual?: boolean;
}

export interface Anchor {
  oldPage: number;
  oldY: number;
  newPage: number;
  newY: number;
}

export interface CompareResult {
  oldDoc: DocModel;
  newDoc: DocModel;
  changes: Change[];
  pageLinks: PageLink[];
  /** For each old page, the best matching new page (or -1). */
  oldToNew: number[];
  /** For each new page, the best matching old page (or -1). */
  newToOld: number[];
  /** Monotonic list of matched positions used for synchronised scrolling. */
  anchors: Anchor[];
  /** Matched document token indices, flattened: [old0, new0, old1, new1, …]. */
  matches: Int32Array;
  options: DiffOptions;
  /** What could not be compared as text — shown so "no changes" is never a false all-clear. */
  coverage: { old: Coverage; new: Coverage };
  /** Differences that exist but were filtered out by the options. */
  ignored: { furniture: number; caseOnly: number; minorShifts: number; renumbered: number };
  /** Minor layout shifts, kept apart from `changes` (shown on request). */
  minor: Change[];
  stats: {
    oldTokens: number;
    newTokens: number;
    matchedTokens: number;
    similarity: number;
    /** Tokens (both versions) in passages too different to align word by word. */
    unalignedTokens?: number;
  };
}
