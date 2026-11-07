import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from 'pdfjs-dist';
import { documentOptions } from '../pdf/extract.ts';
import { renderScale, type Raster } from '../core/visual.ts';
import { canvasScale, noteCanvasScale } from '../core/crops.ts';

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

async function draw(page: PDFPageProxy, scale: number, canvas: HTMLCanvasElement, onTask?: (t: RenderTask) => void): Promise<void> {
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

/** Render a page into the given canvas. Returns the task so it can be cancelled. */
export async function renderInto(
  pdf: PDFDocumentProxy,
  index: number,
  scale: number,
  canvas: HTMLCanvasElement,
  onTask?: (t: RenderTask) => void,
): Promise<void> {
  await draw(await pdf.getPage(index + 1), scale, canvas, onTask);
}

/**
 * Render a page into a new canvas (visual comparison, report crops). Very
 * large pages are rendered at a lower scale (renderScale); the scale used is
 * recorded for drawCrop. The page's parsed resources are released afterwards.
 */
export async function renderCanvas(pdf: PDFDocumentProxy, index: number, scale: number): Promise<HTMLCanvasElement> {
  const page = await pdf.getPage(index + 1);
  try {
    const unit = page.getViewport({ scale: 1 });
    const s = renderScale(unit.width, unit.height, scale);
    const canvas = document.createElement('canvas');
    await draw(page, s, canvas);
    noteCanvasScale(canvas, s);
    return canvas;
  } finally {
    page.cleanup();
  }
}

export async function renderRaster(pdf: PDFDocumentProxy, index: number, scale: number): Promise<Raster> {
  const canvas = await renderCanvas(pdf, index, scale);
  const s = canvasScale(canvas, scale);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  // Release the backing store early.
  canvas.width = canvas.height = 0;
  return { width: img.width, height: img.height, data: img.data, scale: s };
}
