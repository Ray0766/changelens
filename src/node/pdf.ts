import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { documentOptions } from '../pdf/extract.ts';

const require = createRequire(import.meta.url);
const pdfjsRoot = dirname(require.resolve('pdfjs-dist/package.json'));

export { pdfjs };

export async function openPdf(path: string): Promise<PDFDocumentProxy> {
  const data = new Uint8Array(await readFile(path));
  return openPdfData(data);
}

export async function openPdfData(data: Uint8Array): Promise<PDFDocumentProxy> {
  const task = pdfjs.getDocument({
    data,
    ...documentOptions,
    cMapUrl: join(pdfjsRoot, 'cmaps') + '/',
    cMapPacked: true,
    standardFontDataUrl: join(pdfjsRoot, 'standard_fonts') + '/',
    wasmUrl: join(pdfjsRoot, 'wasm') + '/',
  });
  return (await task.promise) as unknown as PDFDocumentProxy;
}
