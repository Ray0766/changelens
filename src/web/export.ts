import type { CompareResult } from '../core/types.ts';
import { cropRegions, drawCrop, type CanvasLike, type Region } from '../core/crops.ts';
import { buildJson, buildReport, type Review } from '../core/report.ts';
import type { Lang } from '../core/i18n.ts';
import { download } from './dom.ts';
import { renderCanvas, type PDFDocumentProxy } from './pdf.ts';

export interface ExportInput {
  result: CompareResult;
  pdfs: { old: PDFDocumentProxy; new: PDFDocumentProxy };
  names: { old: string; new: string };
  lang: Lang;
  reviews: Record<string, Review>;
  include?: string[];
}

function baseName(name: string): string {
  return name.replace(/\.pdf$/i, '').replace(/[^\p{L}\p{N}._-]+/gu, '-').slice(0, 60) || 'document';
}

export async function exportReport(input: ExportInput, onProgress?: (done: number, total: number) => void): Promise<void> {
  const { result } = input;
  const scale = 2;
  const changes = input.include ? result.changes.filter((c) => input.include!.includes(c.id)) : result.changes;
  const regions = new Map(changes.map((c) => [c.id, cropRegions(c, result.oldDoc, result.newDoc)]));
  const jobs: { side: 'old' | 'new'; page: number; items: { id: string; region: Region }[] }[] = [];
  for (const side of ['old', 'new'] as const) {
    const byPage = new Map<number, { id: string; region: Region }[]>();
    for (const c of changes) {
      const region = regions.get(c.id)![side];
      if (!region) continue;
      let list = byPage.get(region.page);
      if (!list) byPage.set(region.page, (list = []));
      list.push({ id: c.id, region });
    }
    for (const [page, items] of byPage) jobs.push({ side, page, items });
  }
  const make = (w: number, h: number) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c as unknown as CanvasLike;
  };
  const crops: Record<string, { old?: string; new?: string; wide?: boolean }> = {};
  let done = 0;
  for (const job of jobs) {
    const canvas = await renderCanvas(input.pdfs[job.side], job.page, scale);
    for (const { id, region } of job.items) {
      const c = changes.find((x) => x.id === id)!;
      const entry = (crops[id] ??= {});
      entry[job.side] = drawCrop(make, canvas as unknown as CanvasLike, scale, region, c, job.side);
      if (region.rect.w > 380) entry.wide = true;
    }
    canvas.width = canvas.height = 0;
    onProgress?.(++done, jobs.length);
  }
  const html = buildReport({
    result,
    lang: input.lang,
    oldName: input.names.old,
    newName: input.names.new,
    reviews: input.reviews,
    crops,
    include: input.include,
  });
  download(`changelens-report-${baseName(input.names.new)}.html`, html, 'text/html;charset=utf-8');
}

export function exportJson(input: ExportInput): void {
  const json = buildJson({ result: input.result, lang: input.lang, oldName: input.names.old, newName: input.names.new, reviews: input.reviews });
  download(`changelens-${baseName(input.names.new)}.json`, JSON.stringify(json, null, 2), 'application/json');
}
