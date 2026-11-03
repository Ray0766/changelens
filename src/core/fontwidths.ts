/**
 * Approximate glyph advance widths (1/1000 em) used to split a PDF text run
 * into per-word boxes. PDF.js gives us the exact width of a whole run but not
 * of the individual characters, so we distribute the run width according to
 * standard Helvetica / Times / Courier metrics. This is accurate to a few
 * percent for most proportional fonts — plenty for highlighting.
 */

// prettier-ignore
const HELVETICA = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, // ' '..'/'
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, // '0'..'?'
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, // '@'..'O'
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, // 'P'..'_'
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, // '`'..'o'
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,      // 'p'..'~'
];

// prettier-ignore
const TIMES = [
  250, 333, 408, 500, 500, 833, 778, 180, 333, 333, 500, 564, 250, 333, 250, 278,
  500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 278, 278, 564, 564, 564, 444,
  921, 722, 667, 667, 722, 611, 556, 722, 722, 333, 389, 722, 611, 889, 722, 722,
  556, 722, 667, 556, 611, 722, 722, 944, 722, 722, 611, 333, 278, 333, 469, 500,
  333, 444, 500, 444, 500, 444, 333, 500, 500, 278, 278, 500, 278, 778, 500, 500,
  500, 500, 333, 389, 278, 500, 500, 722, 500, 500, 444, 480, 200, 480, 541,
];

export function isWide(cp: number): boolean {
  return (
    (cp >= 0x1100 && cp <= 0x115f) ||
    (cp >= 0x2e80 && cp <= 0xa4cf) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe30 && cp <= 0xfe4f) ||
    (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    (cp >= 0x20000 && cp <= 0x3fffd)
  );
}

/** Relative advance width of a character for a generic font family. */
export function charWeight(ch: string, family: string): number {
  const cp = ch.codePointAt(0)!;
  if (family === 'monospace') return isWide(cp) ? 1200 : 600;
  const table = family === 'serif' ? TIMES : HELVETICA;
  if (cp >= 32 && cp <= 126) return table[cp - 32];
  if (isWide(cp)) return 1000;
  if (cp === 0xa0) return table[0];
  // Accented Latin etc.: use the base letter.
  const base = ch.normalize('NFD').codePointAt(0)!;
  if (base >= 32 && base <= 126) return table[base - 32];
  if (cp >= 0x2000 && cp <= 0x206f) return 500; // general punctuation: dashes, quotes…
  return 556;
}
