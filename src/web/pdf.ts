import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import { documentOptions } from '../pdf/extract.ts';
import type { Raster } from '../core/visual.ts';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const base = import.meta.env.BASE_URL;

export type { PDFDocumentProxy };

export async function openPdf(data: Uint8Array): Promise<PDFDocumentProxy> {
  const task = pdfjs.getDocument({
    // PDF.js transfers the buffer to its worker; give it a copy.
    data: data.slice(),
    ...documentOptions,
    cMapUrl: base + 'pdfjs/cmaps/',
    cMapPacked: true,
    standardFontDataUrl: base + 'pdfjs/standard_fonts/',
    wasmUrl: base + 'pdfjs/wasm/',
    iccUrl: base + 'pdfjs/iccs/',
  });
  return (await task.promise) as unknown as PDFDocumentProxy;
}

/** Render a page into the given canvas. Returns the task so it can be cancelled. */
export async function renderInto(
  pdf: PDFDocumentProxy,
  index: number,
  scale: number,
  canvas: HTMLCanvasElement,
  onTask?: (t: RenderTask) => void,
): Promise<void> {
  const page = await pdf.getPage(index + 1);
  const viewport = page.getViewport({ scale });
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext('2d', { alpha: false })!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const task = page.render({ canvasContext: ctx, canvas, viewport });
  onTask?.(task);
  await task.promise;
}

export async function renderCanvas(pdf: PDFDocumentProxy, index: number, scale: number): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  await renderInto(pdf, index, scale, canvas);
  return canvas;
}

export async function renderRaster(pdf: PDFDocumentProxy, index: number, scale: number): Promise<Raster> {
  const canvas = await renderCanvas(pdf, index, scale);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  // Release the backing store early.
  canvas.width = canvas.height = 0;
  return { width: img.width, height: img.height, data: img.data, scale };
}
