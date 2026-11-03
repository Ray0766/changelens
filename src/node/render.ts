import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { Raster } from '../core/visual.ts';

interface CanvasLike {
  width: number;
  height: number;
  toBuffer(mime: 'image/png'): Buffer;
}
interface FactoryLike {
  create(w: number, h: number): { canvas: CanvasLike; context: CanvasRenderingContext2D };
}

/** Render a page to RGBA pixels with @napi-rs/canvas (via PDF.js' Node canvas factory). */
export async function renderPage(pdf: PDFDocumentProxy, index: number, scale: number): Promise<Raster & { canvas: CanvasLike }> {
  const page = await pdf.getPage(index + 1);
  const viewport = page.getViewport({ scale });
  const factory = (pdf as unknown as { canvasFactory: FactoryLike }).canvasFactory;
  const w = Math.ceil(viewport.width);
  const h = Math.ceil(viewport.height);
  const { canvas, context } = factory.create(w, h);
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, w, h);
  await page.render({ canvasContext: context, canvas: canvas as unknown as HTMLCanvasElement, viewport }).promise;
  const img = context.getImageData(0, 0, w, h);
  return { width: w, height: h, data: img.data, scale, canvas };
}

export async function canRender(): Promise<boolean> {
  try {
    await import('@napi-rs/canvas');
    return true;
  } catch {
    return false;
  }
}
