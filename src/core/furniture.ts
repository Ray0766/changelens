import type { DocText, Line, Token } from './types.ts';

const ZONE = 0.11;

/** Words that, together with digits, make up a typical page-number line. */
const PAGE_WORDS = new Set([
  '', 'page', 'pageof', 'p', 'pg', 'of', 'seite', 'seitevon', 'pagina', 'paginade', 'páginade', 'página',
  '第页', '第页共页', '共页第页', '页', '共页', 'ページ', '페이지',
]);

function zoneOf(doc: DocText, line: Line): 'top' | 'bottom' | null {
  const p = doc.pages[line.page];
  if (line.rect.y + line.rect.h < p.height * ZONE) return 'top';
  if (line.rect.y > p.height * (1 - ZONE)) return 'bottom';
  return null;
}

export function isPageNumberText(text: string): boolean {
  if (!/\d/.test(text) && !/^[ivxlcdm]+$/i.test(text.trim())) return false;
  const rest = text
    .toLowerCase()
    .replace(/\d+/g, '')
    .replace(/^[ivxlcdm]+$/g, '')
    .replace(/[\s\-–—|·•.,:/()[\]]/g, '');
  return PAGE_WORDS.has(rest);
}

/**
 * Flag running headers, footers and page numbers. These change on every page
 * when a document is re-paginated, so by default they are excluded from the
 * comparison.
 *
 * A line counts as furniture when it lies in the top or bottom margin zone and
 *  - looks like a page number ("3", "Page 3 of 10", "第 3 页 / 共 10 页"), or
 *  - its digit-insensitive text repeats in the same zone on at least half of
 *    the pages (minimum two).
 */
export function detectFurniture(doc: DocText, lines: Line[], tokens: Token[]): void {
  const n = doc.pages.length;
  const groups = new Map<string, Line[]>();
  const sigs: (string | null)[] = lines.map((line) => {
    const zone = zoneOf(doc, line);
    if (!zone) return null;
    const sig = zone + ':' + line.text.toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, '');
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
  lines.forEach((line, k) => {
    const sig = sigs[k];
    if (!sig) return;
    if (furnitureSig.has(sig) || isPageNumberText(line.text)) {
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
