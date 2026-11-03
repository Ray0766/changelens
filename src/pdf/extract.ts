import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import type { DocText, PageText, TextRun } from '../core/types.ts';

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
        return [id, name.replace(/^[A-Z]{6}\+/, '')];
      }),
    );
  } catch {
    /* Rendering data unavailable; fall back to generic families. */
  }

  const runs: TextRun[] = [];
  let unmapped = 0;
  for (const item of tc.items) {
    if (!('str' in item)) continue;
    if (item.str === '' && item.width > 0 && !item.hasEOL) {
      // A glyph drawn without a Unicode mapping: its text cannot be compared.
      const y = viewport.height - item.transform[5];
      if (y > viewport.height * 0.11 && y < viewport.height * 0.89) unmapped++;
      continue;
    }
    if (item.str === '' && !item.hasEOL) continue;
    const style = tc.styles[item.fontName] ?? { fontFamily: 'sans-serif', ascent: 0.8, descent: -0.2 };
    const tx = multiply(viewport.transform, item.transform);
    const fontSize = Math.hypot(tx[2], tx[3]);
    const angleRad = Math.atan2(tx[1], tx[0]);
    const angle = Math.round((angleRad * 180) / Math.PI);
    let ascent = Number(style.ascent);
    let descent = Number(style.descent);
    if (!Number.isFinite(ascent) || ascent <= 0) ascent = 0.8;
    if (!Number.isFinite(descent) || descent > 0) descent = -0.2;
    // PDF.js reports width in page units along the text direction.
    const len = item.width * viewport.scale;
    const bx = tx[4];
    const by = tx[5];
    let x: number, y: number, w: number, h: number;
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
    }
    runs.push({
      str: item.str,
      x,
      y,
      w,
      h,
      baseline: by,
      fontSize,
      font: fontNames.get(item.fontName) || style.fontFamily || '',
      family: familyOf(style.fontFamily),
      eol: item.hasEOL,
      angle,
    });
  }
  return { index, width: viewport.width, height: viewport.height, runs, unmapped };
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
