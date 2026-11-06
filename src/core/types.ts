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
  /**
   * Rotated runs only (angle ≠ 0, e.g. on a page with /Rotate): the text
   * origin x (its y is `baseline`), the advance along the text direction and
   * the ascent/descent in points, so that lines and per-word boxes can be
   * worked out along the text direction.
   */
  rot?: { x: number; len: number; ascent: number; descent: number };
  /**
   * The value shown in a form field (an AcroForm text or choice field),
   * which a widget annotation draws, not the page content. Its box is the
   * widget's; glyph positions inside it are estimated.
   */
  field?: true;
  /** (Form fields) A comb field's value: one character per cell (a postcode, an account number). */
  comb?: true;
  /** (Form fields) The field's font size is automatic: the viewer fits it to the value and the box. */
  autoSize?: true;
  /** (Form fields) The box of the widget that shows the value (page space, like x, y, w, h). */
  widget?: Rect;
  /**
   * (Page content) A form field's widget shows the same value over this
   * text (a form flattened with its widgets kept): its glyphs are drawn
   * twice, and their anti-aliased edges come out darker.
   */
  overdrawn?: true;
}

export interface PageText {
  /** 0-based page index. */
  index: number;
  width: number;
  height: number;
  runs: TextRun[];
  /** Glyphs drawn without a Unicode mapping (their text cannot be compared). */
  unmapped?: number;
  /**
   * Form fields (text or choice) whose value could not be read as text, so
   * they are compared as images only; -1 when the page's annotations could
   * not be read at all.
   */
  fieldsUnread?: number;
  /** The annotations the page shows other than form fields' widgets and links (see PageAnnotations). */
  annotations?: PageAnnotations;
}

/**
 * PDF annotations a page shows (drawn over its content by a viewer), other
 * than form fields' widgets, links and pop-ups: read so that a mark put on
 * words as an annotation is listed on them, and so that a notice can say
 * that the file has annotations.
 */
export interface PageAnnotations {
  /** How many, by PDF subtype ("Highlight", "Stamp", "FreeText", "Ink"…). */
  counts: Record<string, number>;
  /** Highlights, strike-outs, underlines and squiggly underlines (text markup). */
  markup: Markup[];
  /** Text that stamps, free-text notes and comments show, where it could be read. */
  notes: AnnotationNote[];
  /** Annotations that show or carry text (contents, a pop-up comment, a stamp's or a note's own text). */
  withText: number;
  /** Text-markup annotations past the bound read per page, not compared on their words. */
  unread?: number;
}

export type MarkupKind = 'strike' | 'underline' | 'squiggly' | 'highlight';

/** A text-markup annotation: what it marks, where and in what colour. */
export interface Markup {
  kind: MarkupKind;
  /** The boxes it marks, from its QuadPoints (page space; each quadrilateral's bounding box). */
  quads: Rect[];
  /** Its colour (/C, 0–255); null where it has none (a viewer then draws its default). */
  colour: [number, number, number] | null;
  /** The box it is drawn in (/Rect, page space). */
  rect: Rect;
}

/** A stamp, a free-text note or a comment (sticky note), with the text it shows. */
export interface AnnotationNote {
  kind: 'stamp' | 'freetext' | 'comment';
  rect: Rect;
  /** A stamp's or a note's own text as drawn, a comment's contents; '' where none could be read. */
  text: string;
}

export interface Coverage {
  /** Pages without any comparable text (e.g. scanned or image-only pages). */
  textless: number[];
  /** Pages with glyphs whose text could not be read, with their count. */
  unreadable: { page: number; count: number }[];
  /** Pages with characters in the Unicode private-use area: compared by code, but without a standard meaning. */
  privateUse?: { page: number; count: number }[];
  /** (New version only) pages whose text mostly has no counterpart: pairing is uncertain. */
  uncertain?: { page: number; matched: number }[];
  /** Pages whose graphics were not compared: too large to render, or rendering failed. */
  visualSkipped?: number[];
  /**
   * (New version only) pages with words under or next to an overlay (a
   * stamp, a watermark, a fill, a graphic that changed) whose colour,
   * weight, strikethrough and underline could be compared only in part:
   * how many, and the first few. `faint`: how many of them only because a
   * line through or under them was too thin or too light to be sure of.
   */
  partlyCompared?: { page: number; count: number; words: string[]; faint?: number }[];
  /** Pages with form fields whose values could not be compared as text (count -1: the page's form fields could not be read). */
  fieldsUnread?: { page: number; count: number }[];
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
  /**
   * A word re-joined across a line break at a hard hyphen ("well-" + "known"):
   * its two parts. Whether the hyphen is part of the word is settled when two
   * versions are compared (syncHyphenation in tokenize.ts).
   */
  hyphenParts?: [string, string];
  /** Part of a form field's value (see TextRun.field). */
  field?: true;
  /** Part of a comb field's value (see TextRun.comb). */
  comb?: true;
  /** Part of the value of a field with an automatic font size (see TextRun.autoSize). */
  autoSize?: true;
  /** The box of the widget that shows a form field's value (see TextRun.widget). */
  widget?: Rect;
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
  /** The line lies in the top or bottom margin zone (measured along its text direction). */
  zone?: 'top' | 'bottom';
}

export interface DocModel {
  name: string;
  /**
   * textAngle: the direction most of the page's text runs in, in degrees, when
   * it is not horizontal (e.g. 90 or -90 on a page with /Rotate 90). Lines and
   * word boxes follow that direction; positions are in page space, so they are
   * not comparable with a page of the other version that has another angle.
   */
  pages: { index: number; width: number; height: number; unmapped: number; textAngle?: number; fieldsUnread?: number; annotations?: PageAnnotations }[];
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
  /** A line through or under the text was added or removed (found visually). */
  decoration?: { line: 'strike' | 'underline'; added: boolean };
  /** A text-markup annotation on the words was added, removed or changed colour (read from the PDF's annotations). */
  markup?: { kind: MarkupKind; change: 'added' | 'removed' | 'recoloured' };
  /**
   * (Form fields) The value reads in another direction in its box: degrees
   * clockwise from left to right (90: top to bottom, 180: upside down, 270:
   * bottom to top).
   */
  turnFrom?: number;
  turnTo?: number;
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
  /**
   * A whole page changed: a page without text was added or removed, or the
   * page size or orientation changed (rects cover the page).
   */
  pageChange?: 'added' | 'removed' | 'resized';
  /** (pageChange 'added' / 'removed') The page is blank: no text and no ink at all. */
  blankPage?: boolean;
  /** (pageChange 'resized') The page was turned (/Rotate) by this many degrees clockwise. */
  turned?: 90 | 180 | 270;
  /**
   * Not an edit but a consequence of one: list items renumbered after an
   * insertion, or a line repeated at the top of a page (a table's header
   * row) that came or went because a page break moved, or the rule that
   * closes the table at the foot of the page before it ('closingRule', a
   * graphic: the side that has the rule has its place).
   */
  consequence?: 'renumber' | 'repeatedLine' | 'closingRule';
  /** Inserted content that repeats text found elsewhere in the new version (0-based page). */
  duplicateOf?: number;
  /** (Moves) Number of edits inside the moved text; each is listed as its own change. */
  moveEdits?: number;
  /** An edit inside a moved passage: id of that move change. */
  inMove?: string;
  /** (Text changes) The changed text is a form field's value (see TextRun.field). */
  field?: true;
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
  /** Pages without text paired by their position (and look) and compared as images only. */
  image?: boolean;
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
  ignored: {
    furniture: number;
    caseOnly: number;
    minorShifts: number;
    renumbered: number;
    /** Lines repeated at the top of a page that came or went with a moved page break (see `consequence`). */
    repeatedLines?: number;
    /** Rules closing a table at the foot of the page before such a line, which came or went with it (see `consequence`). */
    closingRules?: number;
  };
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
