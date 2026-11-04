import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import type { DocText, PageText, TextRun } from '../core/types.ts';
import { charWeight } from '../core/fontwidths.ts';
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

export async function extractPage(page: PDFPageProxy, index: number): Promise<PageText> {
  const viewport = page.getViewport({ scale: 1 });
  const tc = await page.getTextContent();
  // Loading the operator list makes PDF.js resolve font objects, which gives
  // us their real names. It is also cached for the later render.
  let fontNames = new Map<string, string>();
  try {
    await page.getOperatorList();
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
  for (const item of tc.items) {
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
      font: fontNames.get(item.fontName) || style.fontFamily || '',
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
    fields = fieldRuns((await page.getAnnotations({ intent: 'display' })) as WidgetData[], viewport.transform, runs);
  } catch {
    // The page's annotations could not be read: their values are compared as images only.
    fields = { runs: [], unread: -1 };
  }
  const page_: PageText = { index, width: viewport.width, height: viewport.height, runs: placeFieldRuns(runs, fields.runs), unmapped };
  if (fields.unread) page_.fieldsUnread = fields.unread;
  return page_;
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
  extra: { font: string; family: string; eol: boolean; field?: true; comb?: true },
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
  };
}

// ------------------------------------------------------------ form fields ---

/** The parts of a PDF.js widget annotation (page.getAnnotations()) read here. */
export interface WidgetData {
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

/** Families of the standard form fonts ("Helv", "TiRo", "Cour", or a font resource name). */
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
 * Hidden widgets are skipped (they are not shown). Password fields, rotated
 * widgets and values that are not text are counted as not compared, so a
 * notice can say so. Glyph positions inside a field are estimated from
 * standard font widths (PDF.js does not give them); the box, the first
 * glyph and the line are those of the widget.
 */
export function fieldRuns(annotations: WidgetData[], vt: number[], content: TextRun[]): FieldRuns {
  const out: FieldRuns = { runs: [], unread: 0 };
  for (const a of annotations) {
    if (a.subtype !== 'Widget' || a.hidden) continue;
    if (a.fieldType !== 'Tx' && a.fieldType !== 'Ch') continue;
    const r = a.rect;
    if (!r || r.length !== 4 || !r.every(Number.isFinite) || r[2] <= r[0] || r[3] <= r[1]) {
      out.unread++;
      continue;
    }
    if (a.password || (a.rotation ?? 0) !== 0) {
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
    // flattened while its widgets were kept): compare it once.
    if (shownByContent(lines, r, vt, content)) continue;
    out.runs.push(layoutField(a, lines, r, vt));
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
function combStart(a: WidgetData, str: string, cell: number): number {
  const n = Array.from(str).length;
  const max = a.maxLen!;
  const raw = typeof a.fieldValue === 'string' ? cleanText(a.fieldValue).trimEnd() : '';
  const squash = (s: string) => s.replace(/\s+/g, '');
  const lead = squash(raw) === squash(str) ? Array.from(raw).length - Array.from(raw.trimStart()).length : 0;
  let first: number;
  if (a.textPosition && Number.isFinite(a.textPosition[0])) {
    const drawnLead = /^\s/.test(a.textContent?.[0] ?? '') ? lead : 0;
    first = Math.floor(a.textPosition[0] / cell) + drawnLead;
  } else {
    const total = lead + n;
    first = lead + (a.textAlignment === 1 ? Math.floor((max - total) / 2) : a.textAlignment === 2 ? max - total : 0);
  }
  return Math.max(0, Math.min(first, max - n));
}

/** Content text inside the widget's box already reads like the field value. */
function shownByContent(lines: string[], r: number[], vt: number[], content: TextRun[]): boolean {
  const [x0, y0] = apply(vt, r[0], r[1]);
  const [x1, y1] = apply(vt, r[2], r[3]);
  const box = { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
  const inside = content.filter((c) => {
    const cx = c.x + c.w / 2;
    const cy = c.y + c.h / 2;
    return cx >= box.x && cx <= box.x + box.w && cy >= box.y && cy <= box.y + box.h;
  });
  const squash = (s: string) => s.replace(/\s+/g, '');
  return inside.length > 0 && squash(inside.map((c) => c.str).join('')) === squash(lines.join(''));
}

function apply(m: number[], x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

/** Lay out a field's text lines in its widget box (user space), as runs in viewport space. */
function layoutField(a: WidgetData, lines: string[], r: number[], vt: number[]): TextRun[] {
  const family = fieldFamily(a.defaultAppearanceData?.fontName);
  const font = a.defaultAppearanceData?.fontName || 'form field';
  const boxW = r[2] - r[0];
  const boxH = r[3] - r[1];
  const multi = !!a.multiLine || (a.fieldType === 'Ch' && !a.combo) || lines.length > 1;
  let fs = a.defaultAppearanceData?.fontSize ?? 0;
  // Auto size (0): what fits the box, as viewers do.
  if (!(fs > 0)) fs = multi ? 12 : Math.max(4, Math.min(12, boxH * 0.65));
  const advance = (s: string) => (Array.from(s).reduce((n, ch) => n + charWeight(ch, family), 0) / 1000) * fs;
  const align = a.textAlignment ?? 0;
  // The left padding: where the first glyph starts, for left-aligned text.
  const pad = align === 0 && a.textPosition && Number.isFinite(a.textPosition[0]) ? Math.max(0, Math.min(a.textPosition[0], boxW / 4)) : 2;
  const avail = Math.max(fs, boxW - 2 * pad);
  // Wrap long lines to the box (multi-line fields), as the viewer shows them.
  let visual = lines;
  if (multi && !a.comb) visual = lines.flatMap((l) => wrap(l, avail, advance));
  const runs: TextRun[] = [];
  const comb = !!a.comb && (a.maxLen ?? 0) > 0;
  const at = (str: string, x: number, baseline: number, w: number, eol: boolean) =>
    runs.push(makeRun(vt, [fs, 0, 0, fs, x, baseline], w, str, 0.8, -0.2, { font, family, eol, field: true, ...(comb ? { comb: true as const } : {}) }));
  const xOf = (w: number) => (align === 1 ? r[0] + (boxW - w) / 2 : align === 2 ? r[2] - pad - w : r[0] + pad);
  if (!multi) {
    const str = visual[0] ?? '';
    let w = advance(str);
    let x = a.textPosition && Number.isFinite(a.textPosition[0]) ? r[0] + a.textPosition[0] : xOf(w);
    if (comb) {
      // One character per cell, from the cell the value starts in.
      const cell = boxW / a.maxLen!;
      w = cell * Array.from(str).length;
      x = r[0] + cell * combStart(a, str, cell);
    }
    // A value longer than the box scrolls in the viewer: keep its text, but inside the box.
    w = Math.min(w, Math.max(1, r[2] - x));
    const baseline = a.textPosition && Number.isFinite(a.textPosition[1]) ? r[1] + a.textPosition[1] : r[1] + (boxH - fs) / 2 + 0.22 * fs;
    at(str, x, baseline, w, true);
    return runs;
  }
  // Multi-line: PDF.js gives the lowest baseline of the appearance's text
  // (and its count of lines); lines run down from the top of the box.
  const n = visual.length;
  let lh = 1.2 * fs;
  let top = r[3] - pad - 0.8 * fs;
  const known = a.textPosition && Number.isFinite(a.textPosition[1]) && a.textContent && a.textContent.length > 1 && a.textContent.length === n;
  if (known) {
    const bottom = r[1] + a.textPosition![1];
    const est = (top - bottom) / (n - 1);
    if (est >= 0.9 * fs && est <= 1.8 * fs) lh = est;
    top = bottom + (n - 1) * lh;
  }
  // Lines beyond the box scroll in the viewer: keep them inside it.
  if (n > 1) lh = Math.max(0.3 * fs, Math.min(lh, (top - (r[1] + 0.2 * fs)) / (n - 1)));
  visual.forEach((str, k) => {
    const w = Math.min(advance(str), avail);
    at(str, xOf(w), top - k * lh, w, true);
  });
  return runs;
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
    up.forEach((c, k) => {
      if (!along(c)) return;
      if (Math.abs(c.baseline - f.baseline) >= 0.5 * Math.max(size, c.fontSize)) return;
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
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    pages.push(await extractPage(page, i - 1));
    onPage?.(i, pdf.numPages);
  }
  return { name, pages };
}
