import type { DocText, TextRun } from '../src/core/types.ts';
import { buildDocModel } from '../src/core/tokenize.ts';

/**
 * Build a synthetic document: pages → paragraphs → lines. Lines are laid out
 * top to bottom with a paragraph gap, like a typical generated PDF.
 */
export function makeDoc(name: string, pages: string[][][], opts: { header?: (p: number, n: number) => string; footer?: (p: number, n: number) => string; font?: string } = {}): DocText {
  const W = 595;
  const H = 842;
  return {
    name,
    pages: pages.map((paras, pi) => {
      const runs: TextRun[] = [];
      const line = (str: string, y: number, size = 11, x = 56, font = opts.font ?? 'Body-Regular') => {
        runs.push({ str, x, y: y - size * 0.9, w: str.length * size * 0.5, h: size * 1.1, baseline: y, fontSize: size, font, family: 'sans-serif', eol: true, angle: 0 });
      };
      if (opts.header) line(opts.header(pi + 1, pages.length), 30, 8);
      let y = 90;
      for (const para of paras) {
        for (const l of para) {
          line(l, y);
          y += 16;
        }
        y += 14;
      }
      if (opts.footer) line(opts.footer(pi + 1, pages.length), H - 24, 8, 480);
      return { index: pi, width: W, height: H, runs };
    }),
  };
}

export const model = (d: DocText) => buildDocModel(d);
