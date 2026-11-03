/**
 * Parse one amount such as "8,000", "9.500,00", "1 234.5", "0,125", "12%",
 * "¥3,000" or "１２，０００". Returns null when the text is not a single
 * amount: times ("12:30"), dates ("11/03/2026"), fractions ("1/2"), ranges
 * ("10-20") or several numbers ("8,000 12%").
 */
export function parseNumber(text: string): number | null {
  // NFKC folds full-width digits and separators, and turns the no-break and
  // thin spaces that group thousands into plain spaces.
  let s = text.normalize('NFKC').trim();
  // Accounting notation: (1,200) is −1,200.
  if (/^\(.*\)$/.test(s)) {
    const v = parseNumber(s.slice(1, -1));
    return v === null ? null : -v;
  }
  s = s.replace(/[\u2212\u2013]/g, '-');
  if (/\d\s*[:/]\s*\d/.test(s)) return null;
  // Currency signs, units and words around the number go; "1'234" loses its apostrophe.
  s = s
    .replace(/(?<=\d)['’](?=\d)/g, '')
    .replace(/[^\d.,+\- ]/g, ' ')
    .trim()
    .replace(/ +/g, ' ')
    .replace(/^([+-]) /, '$1');
  if (!/\d/.test(s)) return null;
  const neg = s.startsWith('-');
  s = s.replace(/^[+-]/, '');
  if (s.includes(' ')) {
    // Thousands grouped with spaces ("1 234 567", "1 234,50"); anything else is several numbers.
    const parts = s.split(' ');
    const grouped =
      /^[1-9]\d{0,2}$/.test(parts[0]) && parts.slice(1, -1).every((g) => /^\d{3}$/.test(g)) && /^\d{3}([.,]\d+)?$/.test(parts[parts.length - 1]);
    if (!grouped) return null;
    s = parts.join('').replace(',', '.');
  } else {
    const lastDot = s.lastIndexOf('.');
    const lastComma = s.lastIndexOf(',');
    if (lastDot >= 0 && lastComma >= 0) {
      // Whichever separator comes last is the decimal separator.
      const eu = lastComma > lastDot;
      if (!(eu ? /^\d{1,3}(\.\d{3})+,\d+$/ : /^\d{1,3}(,\d{3})+\.\d+$/).test(s)) return null;
      s = eu ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
    } else if (lastComma >= 0 || lastDot >= 0) {
      // "8,000" and "1.234.567" group thousands; "3,5", "0,125" and "1.234" are decimals.
      const sep = lastComma >= 0 ? ',' : '.';
      const groups = s.split(sep);
      const thousands = /^[1-9]\d{0,2}$/.test(groups[0]) && groups.slice(1).every((g) => g.length === 3);
      if (thousands && (sep === ',' || groups.length > 2)) s = groups.join('');
      else if (groups.length === 2) s = groups.join('.');
      else return null;
    }
  }
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const v = Number(s);
  return Number.isFinite(v) ? (neg ? -v : v) : null;
}

const NUMERIC_PUNCT = /^[$€£¥₹₩%‰+\-−.,:/()]$/;
const CURRENCY_WORDS = /^(usd|eur|gbp|cny|rmb|jpy|元|万|亿|円|k|m|bn)$/i;

/** True when every token is a number, currency sign or unit (full-width forms included). */
export function isNumericPhrase(texts: string[]): boolean {
  let digits = 0;
  for (const raw of texts) {
    const t = raw.normalize('NFKC');
    if (/\d/.test(t) && /^[\d.,:/\-+%\u2212\u2013\u2012()$€£¥₹₩¢₽₺ '’]+$/.test(t)) {
      digits++;
      continue;
    }
    if (NUMERIC_PUNCT.test(t) || CURRENCY_WORDS.test(t)) continue;
    return false;
  }
  return digits > 0;
}
