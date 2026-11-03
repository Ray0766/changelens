/** Parse amounts such as "8,000", "9.500,00", "1 234.5", "12%" or "¥3,000". */
export function parseNumber(text: string): number | null {
  // Accounting notation: (1,200) is −1,200.
  const paren = /^\(.*\)$/.test(text.trim());
  if (paren) {
    const v = parseNumber(text.trim().slice(1, -1));
    return v === null ? null : -v;
  }
  let s = text.replace(/[\u2212\u2013]/g, '-').replace(/[\s  ']/g, '').replace(/[^\d.,\-+]/g, '');
  if (!/\d/.test(s)) return null;
  const neg = s.startsWith('-');
  s = s.replace(/^[+-]/, '');
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  if (lastDot >= 0 && lastComma >= 0) {
    // Whichever separator comes last is the decimal separator.
    if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (lastComma >= 0) {
    // "8,000" → thousands; "3,5" → decimal.
    const groups = s.split(',');
    const thousands = groups.length > 1 && groups.slice(1).every((g) => g.length === 3);
    s = thousands ? groups.join('') : s.replace(',', '.');
  } else if (lastDot >= 0) {
    const groups = s.split('.');
    if (groups.length > 2 && groups.slice(1).every((g) => g.length === 3)) s = groups.join('');
  }
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const v = Number(s);
  return Number.isFinite(v) ? (neg ? -v : v) : null;
}

const NUMERIC_PUNCT = /^[$€£¥₹₩%‰+\-−.,:/()]$/;
const CURRENCY_WORDS = /^(usd|eur|gbp|cny|rmb|jpy|元|万|亿|円|k|m|bn)$/i;

/** True when every token is a number, currency sign or unit. */
export function isNumericPhrase(texts: string[]): boolean {
  let digits = 0;
  for (const t of texts) {
    if (/\d/.test(t) && /^[\d.,:/\-+%\u2212\u2013()$€£¥₹₩¢₽₺]+$/.test(t)) {
      digits++;
      continue;
    }
    if (NUMERIC_PUNCT.test(t) || CURRENCY_WORDS.test(t)) continue;
    return false;
  }
  return digits > 0;
}
