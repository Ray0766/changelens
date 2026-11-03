/**
 * Parse one amount such as "8,000", "9.500,00", "1 234.5", "0,125", "12%",
 * "¥3,000" or "１２，０００". Returns null when the text is not a single
 * amount: times ("12:30"), dates ("11/03/2026"), fractions ("1/2"), ranges
 * ("10-20") or several numbers ("8,000 12%").
 */
export function parseNumber(text: string, decimal?: ',' | '.'): number | null {
  // NFKC folds full-width digits and separators, and turns the no-break and
  // thin spaces that group thousands into plain spaces.
  let s = text.normalize('NFKC').trim();
  // Accounting notation: (1,200) is −1,200.
  if (/^\(.*\)$/.test(s)) {
    const v = parseNumber(s.slice(1, -1), decimal);
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
      // "8,000" and "1.234.567" group thousands; "3,5", "0,125" and "1.234" are
      // decimals, unless `decimal` (the separator the other version shows for
      // decimals, see decimalMark) says otherwise.
      const sep = lastComma >= 0 ? ',' : '.';
      const groups = s.split(sep);
      const thousands = /^[1-9]\d{0,2}$/.test(groups[0]) && groups.slice(1).every((g) => g.length === 3);
      if (decimal && decimal !== sep) {
        if (!thousands) return null;
        s = groups.join('');
      } else if (thousands && !decimal && (sep === ',' || groups.length > 2)) s = groups.join('');
      else if (groups.length === 2) s = groups.join('.');
      else return null;
    }
  }
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const v = Number(s);
  return Number.isFinite(v) ? (neg ? -v : v) : null;
}

/**
 * The decimal separator a number shows unambiguously: "1.234,50", "0,125"
 * and "3,5" use a comma, "1,234.50" and "2.75" a point. Null when it could be
 * either ("8,000", "1.234") or there is none. Used to read the other version
 * of the same figure alike ("1.234" → "1.234,50" is +0.04%, not +99941%).
 */
export function decimalMark(text: string): ',' | '.' | null {
  const s = text.normalize('NFKC');
  const seps = [...s.matchAll(/(?<=\d)[.,](?=\d)/g)];
  if (!seps.length) return null;
  const last = seps[seps.length - 1];
  if (seps.some((m) => m[0] !== last[0])) return last[0] as ',' | '.';
  // One kind of separator: a decimal unless every group after it has three
  // digits and the first group at most three.
  const groups = s.slice(0, last.index! + 1 + (/^\d+/.exec(s.slice(last.index! + 1))?.[0].length ?? 0)).split(last[0]);
  const head = /\d+$/.exec(groups[0])?.[0] ?? '';
  const grouping = /^[1-9]\d{0,2}$/.test(head) && groups.slice(1).every((g) => /^\d{3}$/.test(g));
  if (grouping) return null;
  return seps.length === 1 ? (last[0] as ',' | '.') : null;
}

/**
 * A magnitude or unit written onto a figure ("2.7m", "5bn", "10k", "7.42p").
 * A lone "b" is left out: "2b" is more often a clause or item label.
 */
export const SUFFIX = /^(?:k|m|mn|bn|tn|p|万|亿)$/i;

const NUMERIC_PUNCT = /^[$€£¥₹₩%‰+\-−.,;:/()]$/;
const CURRENCY_WORDS = /^(usd|eur|gbp|cny|rmb|jpy|元|万|亿|円|k|m|mn|bn)$/i;

/** True when every token is a number, currency sign or unit (full-width forms included). */
export function isNumericPhrase(texts: string[]): boolean {
  let digits = 0;
  for (const raw of texts) {
    const t = raw.normalize('NFKC');
    if (/\d/.test(t) && /^[\d.,:/\-+%\u2212\u2013\u2012()$€£¥₹₩¢₽₺ '’]+$/.test(t.replace(/(?<=\d)(?:k|m|mn|bn|tn|p)$/i, ''))) {
      digits++;
      continue;
    }
    if (NUMERIC_PUNCT.test(t) || CURRENCY_WORDS.test(t)) continue;
    return false;
  }
  return digits > 0;
}
