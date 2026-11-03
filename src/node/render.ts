import type { PDFDocumentProxy } from 'pdfjs-dist';
import { renderScale, type Raster } from '../core/visual.ts';
import { noteCanvasScale } from '../core/crops.ts';

interface CanvasLike {
  width: number;
  height: number;
  toBuffer(mime: 'image/png'): Buffer;
}
interface FactoryLike {
  create(w: number, h: number): { canvas: CanvasLike; context: CanvasRenderingContext2D };
}

/**
 * Render a page with @napi-rs/canvas (via PDF.js' Node canvas factory).
 *
 * Very large pages are rendered at a lower scale so that no page needs more
 * than MAX_RENDER_PIXELS; `scale` in the result is the one actually used. The
 * RGBA copy (`data`) is only made when it is first read, so callers that just
 * draw the canvas (report crops) do not pay for it. The page's parsed
 * resources are released after rendering; without that, every rendered page
 * stays in memory until the document is closed.
 */
export async function renderPage(pdf: PDFDocumentProxy, index: number, scale: number): Promise<Raster & { canvas: CanvasLike }> {
  const page = await pdf.getPage(index + 1);
  try {
    const unit = page.getViewport({ scale: 1 });
    const s = renderScale(unit.width, unit.height, scale);
    const viewport = page.getViewport({ scale: s });
    const factory = (pdf as unknown as { canvasFactory: FactoryLike }).canvasFactory;
    const w = Math.ceil(viewport.width);
    const h = Math.ceil(viewport.height);
    const { canvas, context } = factory.create(w, h);
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, w, h);
    await page.render({ canvasContext: context, canvas: canvas as unknown as HTMLCanvasElement, viewport }).promise;
    noteCanvasScale(canvas, s);
    let data: Uint8ClampedArray | null = null;
    return {
      width: w,
      height: h,
      scale: s,
      canvas,
      get data() {
        return (data ??= context.getImageData(0, 0, w, h).data);
      },
    };
  } finally {
    page.cleanup();
  }
}

export async function canRender(): Promise<boolean> {
  try {
    await import('@napi-rs/canvas');
    return true;
  } catch {
    return false;
  }
}
