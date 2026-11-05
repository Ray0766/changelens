import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import type { DocText, PageText, TextRun } from '../core/types.ts';
import { charWeight, isWide } from '../core/fontwidths.ts';
import { upright } from '../core/tokenize.ts';

type Matrix = [number, number, number, number, number, number];

function multiply(m1: number[], m2: number[]): Matrix {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

/**
 * Control characters a crafted PDF can map glyphs to (terminal escape
 * sequences, bidi overrides) are removed from extracted text and font names,
 * so no output — terminal, JSON or report — carries them. Tabs and line
 * breaks become spaces.
 */
export function cleanText(s: string): string {
  return s.replace(/[\t\n\v\f\r\u0085]/g, ' ').replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, '');
}

function familyOf(f: string | undefined): string {
  const s = (f ?? '').toLowerCase();
  if (s.includes('mono')) return 'monospace';
  if (s.includes('serif') && !s.includes('sans')) return 'serif';
  return 'sans-serif';
}

/** Options every getDocument() call in ChangeLens should use. */
export const documentOptions = {
  // Needed to read real font names (for bold / font change detection).
  fontExtraProperties: true,
  isEvalSupported: false,
  verbosity: 0,
};

/**
 * The text of one page. `formFonts`: the fonts of form field keys read so far
 * in this document (see drawnFieldFonts), shared by its pages.
 */
export async function extractPage(page: PDFPageProxy, index: number, formFonts: Map<string, string> = new Map()): Promise<PageText> {
  const viewport = page.getViewport({ scale: 1 });
  const tc = await page.getTextContent();
  // Loading the operator list makes PDF.js resolve font objects, which gives
  // us their real names. Only the page content's (annotationMode 0, DISABLE):
  // with the widgets' appearance streams, a form of 2,000 fields took 1 GB
  // and 11 s per document here, for fonts the text content never names.
  let fontNames = new Map<string, string>();
  let stroked: boolean[] = [];
  try {
    const ops = await page.getOperatorList({ annotationMode: 0 });
    try {
      stroked = strokedItems(ops, tc.items);
    } catch {
      /* Render modes unreadable: every run counts as filled only. */
    }
    fontNames = new Map(
      Object.keys(tc.styles).map((id) => {
        let name = '';
        try {
          const f = page.commonObjs.get(id) as { name?: string } | undefined;
          name = f?.name ?? '';
        } catch {
          /* font not resolved */
        }
        return [id, cleanText(name).replace(/^[A-Z]{6}\+/, '')];
      }),
    );
  } catch {
    /* Rendering data unavailable; fall back to generic families. */
  }

  const runs: TextRun[] = [];
  let unmapped = 0;
  for (const [n, item] of tc.items.entries()) {
    if (!('str' in item)) continue;
    const str = cleanText(item.str);
    if (str === '' && item.width > 0 && !item.hasEOL) {
      // A glyph drawn without a Unicode mapping: its text cannot be compared.
      const y = viewport.height - item.transform[5];
      if (y > viewport.height * 0.11 && y < viewport.height * 0.89) unmapped++;
      continue;
    }
    if (str === '' && !item.hasEOL) continue;
    const style = tc.styles[item.fontName] ?? { fontFamily: 'sans-serif', ascent: 0.8, descent: -0.2 };
    const run = makeRun(viewport.transform, item.transform, item.width, str, Number(style.ascent), Number(style.descent), {
      font: (fontNames.get(item.fontName) || style.fontFamily || '') + (stroked[n] ? STROKED : ''),
      family: familyOf(style.fontFamily),
      eol: item.hasEOL,
    });
    // A run placed by a matrix that is not finite (an overflowing scale)
    // has no position to compare: its characters are counted as unreadable.
    if (!placed(run)) {
      unmapped += Array.from(str.replace(/\s/g, '')).length;
      continue;
    }
    runs.push(run);
  }
  let fields: FieldRuns = { runs: [], unread: 0 };
  try {
    const annotations = (await page.getAnnotations({ intent: 'display' })) as WidgetData[];
    fields = fieldRuns(annotations, viewport.transform, runs, await drawnFieldFonts(page, annotations, formFonts));
  } catch {
    // The page's annotations could not be read: their values are compared as images only.
    fields = { runs: [], unread: -1 };
  }
  const page_: PageText = { index, width: viewport.width, height: viewport.height, runs: placeFieldRuns(runs, fields.runs), unmapped };
  if (fields.unread) page_.fieldsUnread = fields.unread;
  return page_;
}

/** The operators of a PDF.js operator list read here (OPS in pdfjs-dist 6.4.299). */
export const OPS_READ = {
  save: 10,
  restore: 11,
  setFont: 37,
  setTextRenderingMode: 38,
  showText: [44, 45, 46, 47],
  paintFormXObjectBegin: 74,
  paintFormXObjectEnd: 75,
  beginAnnotation: 80,
  endAnnotation: 81,
};

/**
 * Appended to the font name of a run drawn with its glyphs filled and
 * stroked (text render mode 2 or 6): the bold that LibreOffice and Word draw
 * for a font without a bold face, with the regular font's name. After a
 * comma, the font's family stays the same (see parseStyle in compare.ts),
 * and it reads as no weight of its own: compare.ts takes it for bold only
 * where labels are told apart by their weight (labelBox), not as a
 * formatting change, which the visual comparison sees in the glyphs' ink.
 */
export const STROKED = ',Stroke';

/**
 * For each text content item, whether its glyphs were filled and stroked.
 * PDF.js gives the text render mode only in the operator list, not with the
 * text content; both follow the content stream, so the items are found in
 * order in the text the operator list shows (without white space, NFKC),
 * each within 4,000 characters of where the last one ended. An item not
 * found there counts as filled only.
 */
function strokedItems(ops: { fnArray: number[]; argsArray: unknown[] } | undefined, items: readonly unknown[]): boolean[] {
  const out: boolean[] = [];
  if (!ops?.fnArray) return out;
  const stroke = (k: number) => ops.fnArray[k] === OPS_READ.setTextRenderingMode && [2, 6].includes(Number((ops.argsArray[k] as unknown[] | null)?.[0]));
  if (!ops.fnArray.some((_, k) => stroke(k))) return out;
  const squash = (x: string) => x.normalize('NFKC').replace(/\s+/g, '');
  let text = '';
  let marks = '';
  let mode = 0;
  const saved: number[] = [];
  for (let k = 0; k < ops.fnArray.length; k++) {
    const fn = ops.fnArray[k];
    if (fn === OPS_READ.save || fn === OPS_READ.paintFormXObjectBegin) saved.push(mode);
    else if (fn === OPS_READ.restore || fn === OPS_READ.paintFormXObjectEnd) mode = saved.pop() ?? mode;
    else if (fn === OPS_READ.setTextRenderingMode) mode = Number((ops.argsArray[k] as unknown[] | null)?.[0] ?? 0);
    else if (OPS_READ.showText.includes(fn)) {
      const args = (ops.argsArray[k] as unknown[] | null) ?? [];
      const glyphs = [...args].reverse().find(Array.isArray) as unknown[] | undefined;
      let shown = '';
      for (const g of glyphs ?? []) if (g && typeof g === 'object' && typeof (g as { unicode?: unknown }).unicode === 'string') shown += (g as { unicode: string }).unicode;
      shown = squash(shown);
      text += shown;
      marks += (mode === 2 || mode === 6 ? 's' : 'f').repeat(shown.length);
    }
  }
  let at = 0;
  for (const [n, item] of items.entries()) {
    const str = item && typeof item === 'object' && 'str' in item ? squash(String((item as { str: unknown }).str)) : '';
    if (!str) continue;
    const from = text.indexOf(str, at);
    if (from < 0 || from - at > 4000) continue;
    const filled = marks.indexOf('f', from);
    out[n] = filled < 0 || filled >= from + str.length;
    at = from + str.length;
  }
  return out;
}

/**
 * The fonts PDF.js draws form field values in, by the key their default
 * appearance names, for the keys of the form's resources that are not
 * standard ("F1", "Time", "F3"): the key alone says nothing about the face,
 * the font it stands for does. A key is read once per document (`byKey`),
 * from the operator list of the first page whose fields show a value under
 * it, with the widgets drawn: the font set for the first text of a widget
 * with that key. That list loads every widget's appearance on the page (see
 * extractPage), so it is loaded only for keys not read yet. A key whose font
 * cannot be read this way stays unknown (''), and only the size of its
 * values is compared.
 */
async function drawnFieldFonts(page: PDFPageProxy, annotations: WidgetData[], byKey: Map<string, string>): Promise<Map<string, string>> {
  const keyOf = (a: WidgetData) => a.defaultAppearanceData?.fontName ?? '';
  const shown = (a: WidgetData) =>
    (Array.isArray(a.textContent) ? a.textContent.join('') : Array.isArray(a.fieldValue) ? a.fieldValue.join('') : typeof a.fieldValue === 'string' ? a.fieldValue : '').trim() !== '';
  const keys = new Map<string, string>();
  for (const a of annotations)
    if (a.subtype === 'Widget' && !a.hidden && (a.fieldType === 'Tx' || a.fieldType === 'Ch') && a.id && shown(a) && !fieldFont(keyOf(a)) && !byKey.has(keyOf(a))) keys.set(a.id, keyOf(a));
  if (!keys.size) return byKey;
  const missing = new Set(keys.values());
  try {
    // annotationMode 1 (ENABLE): widgets drawn into the page, as the visual stage renders them.
    const { fnArray, argsArray } = await page.getOperatorList({ annotationMode: 1 });
    let key: string | null = null;
    let font = '';
    for (let k = 0; k < fnArray.length && missing.size; k++) {
      const fn = fnArray[k];
      if (fn === OPS_READ.beginAnnotation) {
        key = keys.get(String(argsArray[k]?.[0] ?? '')) ?? null;
        if (key !== null && !missing.has(key)) key = null;
        font = '';
      } else if (fn === OPS_READ.endAnnotation) key = null;
      else if (key === null) continue;
      else if (fn === OPS_READ.setFont) font = String(argsArray[k]?.[0] ?? '');
      else if (OPS_READ.showText.includes(fn) && font) {
        let name = '';
        try {
          name = (page.commonObjs.get(font) as { name?: string } | undefined)?.name ?? '';
        } catch {
          /* font not resolved */
        }
        name = cleanText(name).replace(/^[A-Z]{6}\+/, '');
        if (name) {
          byKey.set(key, name);
          missing.delete(key);
        }
        key = null;
      }
    }
  } catch {
    // The widgets could not be drawn: their fonts stay unknown (and are not tried again).
    for (const k of missing) byKey.set(k, '');
  }
  return byKey;
}

/** Every coordinate of the run is a finite number. */
function placed(r: TextRun): boolean {
  return [r.x, r.y, r.w, r.h, r.baseline, r.fontSize, ...(r.rot ? [r.rot.x, r.rot.len, r.rot.ascent, r.rot.descent] : [])].every(Number.isFinite);
}

/**
 * One text run in viewport space from a PDF text-space matrix (`transform`,
 * user space) and the run's advance `width` (user-space units along the text
 * direction).
 */
function makeRun(
  vt: number[],
  transform: number[],
  width: number,
  str: string,
  ascentRaw: number,
  descentRaw: number,
  extra: { font: string; family: string; eol: boolean; field?: true; comb?: true; autoSize?: true },
): TextRun {
  const tx = multiply(vt, transform);
  const scale = Math.hypot(vt[0], vt[1]) || 1;
  const fontSize = Math.hypot(tx[2], tx[3]);
  const angleRad = Math.atan2(tx[1], tx[0]);
  const angle = Math.round((angleRad * 180) / Math.PI);
  let ascent = ascentRaw;
  let descent = descentRaw;
  if (!Number.isFinite(ascent) || ascent <= 0) ascent = 0.8;
  if (!Number.isFinite(descent) || descent > 0) descent = -0.2;
  // PDF.js reports width in page units along the text direction.
  const len = width * scale;
  const bx = tx[4];
  const by = tx[5];
  let x: number, y: number, w: number, h: number;
  let rot: TextRun['rot'];
  if (angle === 0) {
    x = bx;
    y = by - fontSize * ascent;
    w = len;
    h = fontSize * (ascent - descent);
  } else {
    // Axis-aligned box around the rotated run.
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);
    const pts = [
      [0, -ascent * fontSize],
      [len, -ascent * fontSize],
      [len, -descent * fontSize],
      [0, -descent * fontSize],
    ].map(([px, py]) => [bx + px * cos - py * sin, by + px * sin + py * cos]);
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    x = Math.min(...xs);
    y = Math.min(...ys);
    w = Math.max(...xs) - x;
    h = Math.max(...ys) - y;
    rot = { x: bx, len, ascent: ascent * fontSize, descent: -descent * fontSize };
  }
  return {
    str,
    x,
    y,
    w,
    h,
    baseline: by,
    fontSize,
    font: extra.font,
    family: extra.family,
    eol: extra.eol,
    angle,
    ...(rot ? { rot } : {}),
    ...(extra.field ? { field: true as const } : {}),
    ...(extra.comb ? { comb: true as const } : {}),
    ...(extra.autoSize ? { autoSize: true as const } : {}),
  };
}

// ------------------------------------------------------------ form fields ---

/** The parts of a PDF.js widget annotation (page.getAnnotations()) read here. */
export interface WidgetData {
  /** The annotation's id ("12R"), as the operator list names it. */
  id?: string;
  subtype?: string;
  fieldType?: string;
  fieldValue?: unknown;
  textContent?: string[];
  /** First glyph's position relative to the rect's lower-left corner (user space). */
  textPosition?: number[];
  rect?: number[];
  multiLine?: boolean;
  comb?: boolean;
  maxLen?: number;
  password?: boolean;
  hidden?: boolean;
  rotation?: number;
  textAlignment?: number;
  combo?: boolean;
  options?: { exportValue?: unknown; displayValue?: unknown }[];
  defaultAppearanceData?: { fontSize?: number; fontName?: string };
  checkBox?: boolean;
  radioButton?: boolean;
  pushButton?: boolean;
}

export interface FieldRuns {
  /** One group of runs (the lines of one field) per field, in annotation order. */
  runs: TextRun[][];
  /** Text and choice fields whose value could not be read as text (-1: the annotations could not be read at all). */
  unread: number;
}

/** Ascent and descent (per unit of font size) of the standard fonts by family, as PDF.js reports them for page text. */
const FIELD_METRICS: Record<string, [number, number]> = {
  'sans-serif': [0.905, -0.212],
  serif: [0.891, -0.216],
  monospace: [0.833, -0.3],
};

/** The standard fonts by the resource names Acrobat gives them in a form's default resources. */
const STANDARD_FORM_FONTS: Record<string, string> = {
  Helv: 'Helvetica',
  HeBo: 'Helvetica-Bold',
  HeOb: 'Helvetica-Oblique',
  HeBO: 'Helvetica-BoldOblique',
  TiRo: 'Times-Roman',
  TiBo: 'Times-Bold',
  TiIt: 'Times-Italic',
  TiBI: 'Times-BoldItalic',
  Cour: 'Courier',
  CoBo: 'Courier-Bold',
  CoOb: 'Courier-Oblique',
  CoBO: 'Courier-BoldOblique',
  Symb: 'Symbol',
  ZaDb: 'ZapfDingbats',
};
const STANDARD_FONTS = new Set(Object.values(STANDARD_FORM_FONTS));

/**
 * The font of a field's value, from the font resource named in its default
 * appearance: a standard font by its usual resource name ("Helv", "TiRo")
 * or its own name, else unknown (''). Any other name ("F1", "F3") is only
 * the key of a font in the form's resources, and re-saving a form may
 * rename it: it says nothing about the face (see drawnFieldFonts).
 */
function fieldFont(name: string | undefined): string {
  if (!name) return '';
  return STANDARD_FORM_FONTS[name] ?? (STANDARD_FONTS.has(name) ? name : '');
}

/** The family of a form font, by its name ("Times-Roman", "LiberationSans") or standard key ("Helv", "TiRo", "Cour"). */
function fieldFamily(name: string | undefined): string {
  const s = (name ?? '').toLowerCase();
  if (/^cour|mono/.test(s)) return 'monospace';
  if (/^tiro|^times|serif/.test(s) && !s.includes('sans')) return 'serif';
  return 'sans-serif';
}

/**
 * The values shown in a page's form fields, as text runs placed in each
 * widget's box. Form field values are drawn by widget annotations, not by
 * the page content, so getTextContent() never sees them; without this a
 * changed value is compared only as pixels, and a two-digit change in small
 * print falls below the pixel stage's noise threshold.
 *
 * - Text fields (Tx): the text PDF.js read from the widget's appearance
 *   (textContent, with the first glyph's position), or the field value when
 *   the widget has no appearance yet. Single-line, multi-line and comb
 *   fields; long lines are wrapped to the box as a viewer would.
 * - Choice fields (Ch): the displayed text of the selected option(s).
 * - Check boxes, radio buttons, push buttons and signatures stay visual: the
 *   visual stage compares how they are drawn.
 * Hidden widgets are skipped (they are not shown). Password fields, widgets
 * turned by other than a quarter turn and values that are not text are
 * counted as not compared, so a notice can say so. Glyph positions inside a
 * field are estimated from standard font widths (PDF.js does not give
 * them); the box, the first glyph and the line are those of the widget.
 * `drawn`: the fonts of the form's own font keys (see drawnFieldFonts).
 */
export function fieldRuns(annotations: WidgetData[], vt: number[], content: TextRun[], drawn: Map<string, string> = new Map()): FieldRuns {
  const out: FieldRuns = { runs: [], unread: 0 };
  for (const a of annotations) {
    if (a.subtype !== 'Widget' || a.hidden) continue;
    if (a.fieldType !== 'Tx' && a.fieldType !== 'Ch') continue;
    const r = a.rect;
    if (!r || r.length !== 4 || !r.every(Number.isFinite) || r[2] <= r[0] || r[3] <= r[1]) {
      out.unread++;
      continue;
    }
    if (a.password || !TURNS.has(a.rotation ?? 0)) {
      out.unread++;
      continue;
    }
    let lines: string[] | null;
    if (a.fieldType === 'Tx') {
      if (Array.isArray(a.textContent) && a.textContent.every((l) => typeof l === 'string')) lines = a.textContent;
      else if (typeof a.fieldValue === 'string') lines = a.fieldValue.split(/\r\n?|\n/);
      else if (a.fieldValue === undefined || a.fieldValue === null) lines = [];
      else lines = null;
    } else {
      const values = Array.isArray(a.fieldValue) ? a.fieldValue : typeof a.fieldValue === 'string' ? [a.fieldValue] : a.fieldValue == null ? [] : null;
      lines =
        values &&
        values.map((v) => {
          const opt = a.options?.find((o) => o.exportValue === v);
          return String(typeof opt?.displayValue === 'string' ? opt.displayValue : v);
        });
    }
    if (!lines) {
      out.unread++;
      continue;
    }
    lines = lines.map((l) => cleanText(l).replace(/\s+$/, ''));
    // A comb field draws one character per cell; PDF.js reads the cells as
    // separate words ("4 0 2 1 3"). The value is the characters together.
    if (a.fieldType === 'Tx' && a.comb && (a.maxLen ?? 0) > 0 && lines.length === 1) lines = [combValue(lines[0], a.fieldValue)];
    if (!lines.some((l) => l.trim())) continue;
    // The value is already part of the page content (a form filled and
    // flattened while its widgets were kept): compare it once. The widget
    // draws it over that text again.
    const shown = shownByContent(lines, r, vt, content);
    if (shown) {
      for (const run of shown) run.overdrawn = true;
      continue;
    }
    const group = layoutField(a, lines, r, vt, drawn.get(a.defaultAppearanceData?.fontName ?? '') ?? '');
    const [x0, y0] = apply(vt, r[0], r[1]);
    const [x1, y1] = apply(vt, r[2], r[3]);
    const widget = { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
    for (const run of group) run.widget = widget;
    out.runs.push(group);
  }
  return out;
}

/** The value of a comb field read as "4 0 2 1 3": the field value when it shows the same characters, else the cells joined. */
function combValue(shown: string, value: unknown): string {
  const squash = (s: string) => s.replace(/\s+/g, '');
  if (typeof value === 'string' && squash(cleanText(value)) === squash(shown)) return cleanText(value).trim();
  return /^\S(?: \S)*$/.test(shown.trim()) ? squash(shown) : shown;
}

/**
 * The cell a comb field's value (`str`, its characters without leading
 * spaces) starts in. With an appearance: the cell of the first glyph it
 * draws (textPosition; the glyphs are centred in their cells), plus the
 * leading spaces it draws as empty cells. Without one, where PDF.js draws
 * the field value: from the first cell, centred by whole cells (/Q 1) or in
 * the last cells (/Q 2), leading spaces counted as cells.
 */
function combStart(a: WidgetData, str: string, cell: number, tpx: number | undefined): number {
  const n = Array.from(str).length;
  const max = a.maxLen!;
  const raw = typeof a.fieldValue === 'string' ? cleanText(a.fieldValue).trimEnd() : '';
  const squash = (s: string) => s.replace(/\s+/g, '');
  const lead = squash(raw) === squash(str) ? Array.from(raw).length - Array.from(raw.trimStart()).length : 0;
  let first: number;
  if (tpx !== undefined) {
    const drawnLead = /^\s/.test(a.textContent?.[0] ?? '') ? lead : 0;
    first = Math.floor(tpx / cell) + drawnLead;
  } else {
    const total = lead + n;
    first = lead + (a.textAlignment === 1 ? Math.floor((max - total) / 2) : a.textAlignment === 2 ? max - total : 0);
  }
  return Math.max(0, Math.min(first, max - n));
}

/** Content text inside the widget's box that already reads like the field value (its runs), or null. */
function shownByContent(lines: string[], r: number[], vt: number[], content: TextRun[]): TextRun[] | null {
  const [x0, y0] = apply(vt, r[0], r[1]);
  const [x1, y1] = apply(vt, r[2], r[3]);
  const box = { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
  const inside = content.filter((c) => {
    const cx = c.x + c.w / 2;
    const cy = c.y + c.h / 2;
    return cx >= box.x && cx <= box.x + box.w && cy >= box.y && cy <= box.y + box.h;
  });
  const squash = (s: string) => s.replace(/\s+/g, '');
  return inside.length > 0 && squash(inside.map((c) => c.str).join('')) === squash(lines.join('')) ? inside : null;
}

function apply(m: number[], x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

/** A widget turned by /MK /R draws its appearance in the box turned by that angle (as PDF.js does). */
const TURNS = new Set([0, 90, 180, 270]);

/** The height of the widget box of a one-line field's run, in viewport space (see placeFieldRuns). */
const widgetBand = new WeakMap<TextRun, { y: number; h: number }>();

/**
 * Lay out a field's text lines in its widget box, as runs in viewport space.
 * The layout is made in the frame of the widget's appearance: the box as
 * drawn, upright, from (0, 0); a widget turned by /MK /R (90, 180 or 270)
 * maps it into its rect turned by that angle, as PDF.js draws it.
 */
function layoutField(a: WidgetData, lines: string[], r: number[], vt: number[], drawnFont: string): TextRun[] {
  // The font named by a standard key, else the one the viewer draws the value in.
  const font = fieldFont(a.defaultAppearanceData?.fontName) || drawnFont;
  const family = fieldFamily(font || a.defaultAppearanceData?.fontName);
  // The glyph box of the standard font of that family, as PDF.js measures
  // page text set in it (Helvetica, Times and Courier are drawn with the
  // Liberation fonts): a value burned into the page has the same box.
  const [ascent, descent] = FIELD_METRICS[family];
  const rot = a.rotation ?? 0;
  const rw = r[2] - r[0];
  const rh = r[3] - r[1];
  const turned = rot === 90 || rot === 270;
  const boxW = turned ? rh : rw;
  const boxH = turned ? rw : rh;
  // Appearance frame → user space (PDF.js getRotationMatrix, then the rect's corner).
  const frame = rot === 90 ? [0, 1, -1, 0, rw + r[0], r[1]] : rot === 180 ? [-1, 0, 0, -1, rw + r[0], rh + r[1]] : rot === 270 ? [0, -1, 1, 0, r[0], rh + r[1]] : [1, 0, 0, 1, r[0], r[1]];
  // The first glyph's position, for an unturned widget (PDF.js gives it
  // relative to the rect's corner; for a turned one in no clear frame).
  const tp = rot === 0 && a.textPosition && a.textPosition.length === 2 ? a.textPosition : undefined;
  const tpx = tp && Number.isFinite(tp[0]) ? tp[0] : undefined;
  const tpy = tp && Number.isFinite(tp[1]) ? tp[1] : undefined;
  const multi = !!a.multiLine || (a.fieldType === 'Ch' && !a.combo) || lines.length > 1;
  // No appearance text: the viewer draws the value from /V (NeedAppearances,
  // or no appearance yet), and the layout follows PDF.js, which renders it
  // here (TextWidgetAnnotation: 1 pt padding top and bottom, 2 pt at the
  // sides, lines of 1.35 × the font size fitted to the box).
  const viewer = a.fieldType === 'Tx' && !Array.isArray(a.textContent);
  // A bold standard font is wider than the regular one (Helvetica-Bold, Times-Bold).
  const bold = /bold/i.test(font);
  const em = (s: string) => Array.from(s).reduce((n, ch) => n + charWeight(ch, family, bold), 0) / 1000;
  const floor2 = (v: number) => Math.floor(v * 100) / 100;
  const inner = { w: boxW - 4, h: boxH - 2 };
  let fs = a.defaultAppearanceData?.fontSize ?? 0;
  const autoSize = !(fs > 0);
  let rows = 0;
  if (viewer && multi && inner.h > 0) {
    // As many lines as fit at 1.35 × the size; auto size: the largest size at
    // which the wrapped value fits the box.
    const wrapped = (size: number) => lines.reduce((n, l) => n + splitLine(l, inner.w, (x) => em(x) * size).length, 0);
    if (fs > 0) rows = Math.max(1, Math.round(inner.h / (1.35 * fs)));
    else {
      const sizeFor = (k: number) => floor2(inner.h / k / 1.35);
      const tooBig = (size: number) => wrapped(size) * size > inner.h;
      rows = Math.max(1, Math.round(inner.h / 16.2), lines.length);
      if (tooBig(sizeFor(rows))) {
        let low = rows;
        let high = 2 * rows;
        while (tooBig(sizeFor(high)) && high < 4096) [low, high] = [high, 2 * high];
        while (high - low > 1) {
          const mid = Math.floor((low + high) / 2);
          if (tooBig(sizeFor(mid))) low = mid;
          else high = mid;
        }
        rows = high;
      }
      fs = sizeFor(rows);
    }
  } else if (viewer && !multi && !(fs > 0) && inner.h > 0 && inner.w > 0) {
    const width = em(lines[0] ?? '');
    fs = floor2(Math.min(inner.h / 1.35, width > 0 ? inner.w / width : Infinity));
  }
  // Auto size (0) otherwise: what fits the box, as viewers do.
  if (!(fs > 0)) fs = multi ? 12 : Math.max(4, Math.min(12, boxH * 0.65));
  const advance = (s: string) => em(s) * fs;
  const align = a.textAlignment ?? 0;
  // The left padding: where the first glyph starts, for left-aligned text.
  const pad = align === 0 && tpx !== undefined ? Math.max(0, Math.min(tpx, boxW / 4)) : 2;
  const avail = Math.max(fs, boxW - 2 * pad);
  // Wrap long lines to the box (multi-line fields), as the viewer shows them.
  let visual = lines;
  // A word the viewer breaks because it is wider than the box ("Lisbo" +
  // "n" in a narrow cell) stays one word, on the line where it starts: its
  // text is the value's, only its end is drawn elsewhere (or clipped).
  const glued: boolean[] = [];
  const letter = (ch: string | undefined) => !!ch && /[\p{L}\p{N}]/u.test(ch) && !isWide(ch.codePointAt(0)!);
  if (multi && !a.comb)
    visual = lines.flatMap((l) => {
      const parts = viewer ? splitLine(l, inner.w, advance) : wrap(l, avail, advance);
      parts.forEach((p, k) => glued.push(viewer && k > 0 && letter(Array.from(parts[k - 1]).pop()) && letter(Array.from(p)[0])));
      return parts;
    });
  const runs: TextRun[] = [];
  const comb = !!a.comb && (a.maxLen ?? 0) > 0;
  const at = (str: string, x: number, baseline: number, w: number, eol: boolean) =>
    runs.push(makeRun(vt, multiply(frame, [fs, 0, 0, fs, x, baseline]), w, str, ascent, descent, { font, family, eol, field: true, ...(comb ? { comb: true as const } : {}), ...(autoSize ? { autoSize: true as const } : {}) }));
  const xOf = (w: number) => (align === 1 ? (boxW - w) / 2 : align === 2 ? boxW - pad - w : pad);
  if (!multi) {
    const str = visual[0] ?? '';
    let w = advance(str);
    let x = tpx ?? xOf(w);
    if (comb) {
      // One character per cell, from the cell the value starts in.
      const cell = boxW / a.maxLen!;
      w = cell * Array.from(str).length;
      x = cell * combStart(a, str, cell, tpx);
    }
    // A value longer than the box scrolls in the viewer: keep its text, but inside the box.
    w = Math.min(w, Math.max(1, boxW - x));
    // Without an appearance, centred on the font's glyph box, as PDF.js does.
    const baseline = tpy ?? (boxH - (ascent - descent) * fs) / 2 - descent * fs;
    at(str, x, baseline, w, true);
    const [, y0] = apply(vt, r[0], r[1]);
    const [, y1] = apply(vt, r[2], r[3]);
    widgetBand.set(runs[0], { y: Math.min(y0, y1), h: Math.abs(y1 - y0) });
    return runs;
  }
  const n = visual.length;
  let lh = 1.2 * fs;
  let top = boxH - pad - 0.8 * fs;
  if (viewer && rows > 0) {
    // PDF.js: the box's inner height shared by the lines that fit; the first
    // baseline one line (less its descent) below the top padding.
    lh = inner.h / rows;
    top = boxH - Math.min(Math.floor((boxH - fs) / 2), 1) - (lh - Math.max(0.35 / 1.35 * lh, -descent * fs));
  } else if (tpy !== undefined && a.textContent && a.textContent.length > 1 && a.textContent.length === n) {
    // An appearance: PDF.js gives its lowest baseline (and the count of its
    // lines); lines run down from the top of the box.
    const bottom = tpy;
    const est = (top - bottom) / (n - 1);
    if (est >= 0.9 * fs && est <= 1.8 * fs) lh = est;
    top = bottom + (n - 1) * lh;
  }
  // Lines beyond the box scroll in the viewer: keep them inside it.
  if (n > 1) lh = Math.max(0.3 * fs, Math.min(lh, (top - 0.2 * fs) / (n - 1)));
  visual.forEach((line, k) => {
    if (glued[k]) return;
    let str = line;
    for (let j = k + 1; j < visual.length && glued[j]; j++) str += visual[j];
    // (The viewer's lines keep the spaces it breaks at, and may run past the
    // box: a space it starts a line with moves the words after it.)
    if (!str.trim()) return;
    const lead = str.length - str.trimStart().length;
    const w = viewer ? advance(str) : Math.min(advance(str), avail);
    const x = xOf(w) + advance(str.slice(0, lead));
    const text = str.trim();
    at(text, x, top - k * lh, viewer ? advance(text) : Math.min(advance(text), avail), true);
  });
  return runs;
}

/**
 * The lines PDF.js breaks a text field's value into (TextWidgetAnnotation
 * _splitLine), with standard widths: at the last space before the glyph
 * that would pass `width` (the space stays at the end of the line, and the
 * first glyph after it is not counted), or before that glyph when the line
 * has no space; a space that would pass it starts the next line.
 */
function splitLine(line: string, width: number, advance: (s: string) => number): string[] {
  const cps = Array.from(line);
  if (cps.length <= 1) return [line];
  const chunks: string[] = [];
  let start = 0;
  let lastSpace = -1;
  let cur = 0;
  for (let i = 0; i < cps.length; i++) {
    const w = advance(cps[i]);
    if (cps[i] === ' ') {
      if (cur + w > width) {
        chunks.push(cps.slice(start, i).join(''));
        start = i;
        cur = w;
        lastSpace = -1;
      } else {
        cur += w;
        lastSpace = i;
      }
    } else if (cur + w > width) {
      if (lastSpace !== -1) {
        chunks.push(cps.slice(start, lastSpace + 1).join(''));
        start = lastSpace + 1;
        i = lastSpace + 1;
        lastSpace = -1;
        cur = 0;
      } else {
        chunks.push(cps.slice(start, i).join(''));
        start = i;
        cur = w;
      }
    } else cur += w;
  }
  if (start < cps.length) chunks.push(cps.slice(start).join(''));
  return chunks;
}

/** Greedy word wrap of one line to `width` (CJK text may break between any two characters). */
function wrap(line: string, width: number, advance: (s: string) => number): string[] {
  if (advance(line) <= width) return [line];
  const parts = line.match(/[\u2e80-\u9fff\uf900-\ufaff]|\S+\s*|\s+/gu) ?? [line];
  const out: string[] = [];
  let cur = '';
  for (const p of parts) {
    if (cur && advance((cur + p).trimEnd()) > width) {
      out.push(cur.trimEnd());
      cur = p.trimStart();
    } else cur += p;
  }
  if (cur.trim()) out.push(cur.trimEnd());
  return out.length ? out : [line];
}

/**
 * Put each field's runs into the content's reading order: after the content
 * run that ends to its left on the same line (its label), or one that starts
 * to its left and runs on under the widget, or else after the line of the
 * nearest content above it, or first on the page. The label's
 * line-break flag moves to the field's last run, so label and value form one
 * line, as they read on the page. On a turned page (/Rotate) the content
 * and the fields run in the same direction: positions are compared in the
 * upright frame of that direction, as lines are built (see upright()).
 */
export function placeFieldRuns(content: TextRun[], fields: TextRun[][]): TextRun[] {
  if (!fields.length) return content;
  const runs = content.slice();
  const up = runs.map(upright);
  const after = new Map<number, TextRun[][]>();
  /** Content runs that fields follow on the same line, with their own line-break flag. */
  const labelEol = new Map<number, boolean>();
  /** Each field's first run in the upright frame of its direction (for sorting). */
  const key = new Map<TextRun[], TextRun>();
  for (const group of fields) {
    const f = upright(group[0]);
    key.set(group, f);
    const size = Math.max(1, f.fontSize);
    /** The content run reads in the field's direction (both upright, or both turned with the page). */
    const along = (c: TextRun) => c.angle === f.angle && (c.angle === 0 || (!!c.rot && !!group[0].rot)) && !!c.str.trim();
    let at = -1;
    let bestRight = -Infinity;
    // A label that runs on under the widget (the widget's fill covers its
    // end): the same-line run that starts closest to the left of the value.
    let under = -1;
    let bestLeft = -Infinity;
    // A one-line value in a box taller than its line (centred in it, as the
    // viewer draws it): a label set level with the box is on its line too.
    const band = f.angle === 0 && group.length === 1 ? widgetBand.get(group[0]) : undefined;
    const level = (c: TextRun) =>
      Math.abs(c.baseline - f.baseline) < 0.5 * Math.max(size, c.fontSize) || (!!band && c.y + c.h / 2 >= band.y && c.y + c.h / 2 <= band.y + band.h);
    up.forEach((c, k) => {
      if (!along(c) || !level(c)) return;
      const right = c.x + c.w;
      if (right <= f.x + 0.5 * size && right > bestRight) {
        bestRight = right;
        at = k;
      } else if (c.x < f.x && right > f.x && c.x > bestLeft) {
        bestLeft = c.x;
        under = k;
      }
    });
    if (at < 0) at = under;
    if (at >= 0) {
      // Label and value on one line: the label's line break goes after the
      // last value on its line (see below).
      if (!labelEol.has(at)) labelEol.set(at, runs[at].eol);
      if (runs[at].eol) runs[at] = { ...runs[at], eol: false };
    } else {
      // The nearest content line above the field; then the rest of that line.
      let best = -Infinity;
      up.forEach((c, k) => {
        if (!along(c) || c.baseline > f.y + 0.2 * size) return;
        const overlap = Math.min(c.x + c.w, f.x + f.w) - Math.max(c.x, f.x) > 0 ? 0.5 : 0;
        const score = c.baseline + overlap;
        if (score > best) {
          best = score;
          at = k;
        }
      });
      while (at >= 0 && at + 1 < runs.length && !runs[at].eol && Math.abs(up[at + 1].baseline - up[at].baseline) < 0.5 * Math.max(1, runs[at].fontSize)) at++;
      // Turned text with no content in its direction: after the page's content.
      if (at < 0 && f.angle !== 0 && !up.some(along)) at = runs.length - 1;
    }
    let list = after.get(at);
    if (!list) after.set(at, (list = []));
    list.push(group);
  }
  const order = (x: TextRun[], y: TextRun[]) => key.get(x)!.baseline - key.get(y)!.baseline || key.get(x)!.x - key.get(y)!.x;
  const out: TextRun[] = [];
  for (const g of (after.get(-1) ?? []).sort(order)) out.push(...g);
  runs.forEach((c, k) => {
    out.push(c);
    const groups = (after.get(k) ?? []).sort(order);
    groups.forEach((g, j) => {
      const eol = labelEol.get(k);
      if (eol !== undefined) g[g.length - 1] = { ...g[g.length - 1], eol: j === groups.length - 1 ? eol : false };
      out.push(...g);
    });
  });
  return out;
}

export async function extractText(
  pdf: PDFDocumentProxy,
  name: string,
  onPage?: (done: number, total: number) => void,
): Promise<DocText> {
  const pages: PageText[] = [];
  const formFonts = new Map<string, string>();
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    pages.push(await extractPage(page, i - 1, formFonts));
    onPage?.(i, pdf.numPages);
  }
  return { name, pages };
}
