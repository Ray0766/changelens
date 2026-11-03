import type { DocModel, DocText, Line, Rect, Token } from './types.ts';

const ZONE = 0.11;

/**
 * The top or bottom margin zone a line lies in. Both rects are measured in
 * the reading frame of the line (for rotated text, along its direction).
 */
export function marginZone(rect: Rect, page: Rect): 'top' | 'bottom' | undefined {
  if (rect.y + rect.h < page.y + page.h * ZONE) return 'top';
  if (rect.y > page.y + page.h * (1 - ZONE)) return 'bottom';
  return undefined;
}

/** Roman numerals up to 89, as used for front-matter pages. */
const ROMAN = /^(?:xc|xl|l?x{0,3})(?:ix|iv|v?i{0,3})$/;
const LABEL = String.raw`(?:page|p\.?|pg\.?|pag\.?|pág\.?|pagina|página|seite|s\.)`;
const OF = String.raw`(?:/|of|von|de|di|sur)`;
const PAGE_PATTERNS = [
  // "3", "Page 3", "p. 3", "Page 3 of 10", "3 / 10", "Seite 3 von 10", "iv"
  new RegExp(String.raw`^(?:${LABEL} ?)?(?<n>\d{1,3}|[ivxlc]+)(?: ?${OF} ?(?<m>\d{1,4}))?$`),
  // "第 3 页", "第 3 页 / 共 10 页", "共 10 页 第 3 页", "3 页", "3 ページ", "3 페이지"
  /^第 ?(?<n>\d{1,3}) ?页(?: ?[/,，、]? ?共 ?(?<m>\d{1,4}) ?页)?$/,
  /^共 ?(?<m>\d{1,4}) ?页 ?[/,，、]? ?第 ?(?<n>\d{1,3}) ?页$/,
  /^(?<n>\d{1,3}) ?(?:页|ページ|페이지)$/,
];

/**
 * A page number: one small integer or roman numeral, optionally with page
 * words and the page count ("Page 3 of 10"), and symmetric decoration
 * ("- 3 -"). Amounts with separators, dates, times and lines holding other
 * numbers are not page numbers.
 */
export function isPageNumberText(text: string): boolean {
  const orig = text.normalize('NFKC').replace(/\s+/g, ' ').trim();
  let s = orig.toLowerCase();
  const deco = /^([-–—|·•~*]+) ?(.+?) ?([-–—|·•~*]+)$/.exec(s) ?? /^[([](.+)[)\]]$/.exec(s);
  if (deco) s = deco.length === 4 ? deco[2] : deco[1];
  for (const re of PAGE_PATTERNS) {
    const g = re.exec(s)?.groups;
    if (!g) continue;
    if (/^\d+$/.test(g.n)) return g.m === undefined || Number(g.n) <= Number(g.m);
    // A roman numeral written in one case ("iv", "IV"; not "Li" or "mix").
    return ROMAN.test(g.n) && g.m === undefined && (orig.includes(g.n) || orig.includes(g.n.toUpperCase()));
  }
  return false;
}

/** Zone plus digit-insensitive text: lines that repeat page after page share it. */
function signature(line: Line): string | null {
  return line.zone ? line.zone + ':' + line.text.toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, '') : null;
}

/**
 * Flag running headers, footers and page numbers. These change on every page
 * when a document is re-paginated, so by default they are excluded from the
 * comparison.
 *
 * A line counts as furniture when it lies in the top or bottom margin zone and
 *  - its digit-insensitive text repeats in the same zone on at least half of
 *    the pages (minimum two), with identical text or numbers that follow the
 *    page number, or
 *  - it looks like a page number ("3", "Page 3 of 10", "第 3 页 / 共 10 页")
 *    and is set apart from the body text: a paragraph of its own (or with
 *    other furniture), not the last line of a paragraph or a table row.
 */
export function detectFurniture(doc: DocText, lines: Line[], tokens: Token[]): void {
  const n = doc.pages.length;
  const groups = new Map<string, Line[]>();
  const sigs: (string | null)[] = lines.map((line) => {
    const sig = signature(line);
    if (!sig) return null;
    let g = groups.get(sig);
    if (!g) groups.set(sig, (g = []));
    g.push(line);
    return sig;
  });
  const minPages = Math.max(2, Math.ceil(n * 0.5));
  const furnitureSig = new Set<string>();
  for (const [sig, group] of groups) {
    const pages = new Set(group.map((l) => l.page));
    if (n < 2 || pages.size < minPages) continue;
    // Identical text on many pages: a running header/footer.
    if (group.every((l) => l.text === group[0].text) || tracksPageNumber(group)) furnitureSig.add(sig);
  }
  const blocks = new Map<number, number[]>();
  lines.forEach((l, k) => {
    let b = blocks.get(l.block);
    if (!b) blocks.set(l.block, (b = []));
    b.push(k);
  });
  const repeated = (k: number) => sigs[k] !== null && furnitureSig.has(sigs[k]!);
  const apart = (k: number) => blocks.get(lines[k].block)!.every((j) => j === k || repeated(j));
  // A line set in one paragraph with body text on most of its pages (a
  // table's header row repeated at the top of each page the table runs
  // onto, typeset with the row below it) belongs to the body, not to the
  // running header: it moves with the page breaks and is compared.
  const body: string[] = [];
  for (const sig of furnitureSig) {
    const group = groups.get(sig)!;
    if (2 * group.filter((l) => apart(l.id)).length < group.length) body.push(sig);
  }
  for (const sig of body) furnitureSig.delete(sig);
  lines.forEach((line, k) => {
    if (!sigs[k]) return;
    if (repeated(k) || (isPageNumberText(line.text) && apart(k))) {
      line.furniture = true;
      for (let t = line.start; t < line.end; t++) tokens[t].furniture = true;
    }
  });
}

/**
 * Lines whose text differs only in numbers count as one running header if
 * the numbers that differ follow the page number (e.g. "Report · 3",
 * "Report · 4"), and the other numbers stay the same.
 */
function tracksPageNumber(group: Line[]): boolean {
  const nums = group.map((l) => (l.text.match(/\d+/g) ?? []).map(Number));
  const len = nums[0].length;
  if (len === 0 || nums.some((a) => a.length !== len)) return false;
  let tracking = false;
  for (let k = 0; k < len; k++) {
    const same = nums.every((a) => a[k] === nums[0][k]);
    if (same) continue;
    const offset = nums[0][k] - group[0].page;
    if (!nums.every((a, i) => a[k] - group[i].page === offset)) return false;
    tracking = true;
  }
  return tracking;
}

/**
 * Make header/footer detection consistent across the two versions: a line
 * recognised as running header/footer in one document is also treated as
 * such in the other (e.g. a one-page document cannot show repetition by
 * itself, but its two-page successor can).
 */
export function syncFurniture(a: DocModel, b: DocModel): void {
  const sigs = new Set<string>();
  for (const d of [a, b])
    for (const l of d.lines) {
      if (!l.furniture) continue;
      const sig = signature(l);
      if (sig) sigs.add(sig);
    }
  for (const d of [a, b])
    for (const l of d.lines) {
      if (l.furniture) continue;
      const sig = signature(l);
      if (sig && sigs.has(sig)) {
        l.furniture = true;
        for (let t = l.start; t < l.end; t++) d.tokens[t].furniture = true;
      }
    }
}
