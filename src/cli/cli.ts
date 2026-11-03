#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { parseArgs } from 'node:util';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { openPdf } from '../node/pdf.ts';
import { renderPage, canRender } from '../node/render.ts';
import { extractText } from '../pdf/extract.ts';
import { buildDocModel } from '../core/tokenize.ts';
import { compareDocs } from '../core/compare.ts';
import { addVisualChanges, countChanges } from '../core/pipeline.ts';
import { cropRegions, drawCrop, type CanvasLike, type Region } from '../core/crops.ts';
import { buildJson, buildReport } from '../core/report.ts';
import { countLabel, describeChange, kindLabel, locationLabel, notices } from '../core/describe.ts';
import { createHash } from 'node:crypto';
import { detectLang, explainOpenError, t, type Lang } from '../core/i18n.ts';
import type { Change, CompareResult } from '../core/types.ts';

declare const __VERSION__: string;
const VERSION = typeof __VERSION__ !== 'undefined' ? __VERSION__ : 'dev';

const HELP = `ChangeLens ${VERSION} — see exactly what changed between two PDFs

Usage:
  changelens <old.pdf> <new.pdf> [options]

Options:
  -o, --out <file>         Write a shareable HTML review report
      --json <file>        Write all changes as JSON
      --lang <en|zh>       Language of descriptions (default: from $LANG)
      --no-visual          Skip the comparison of graphics, images and colours
      --no-format          Do not report bold / size / font changes
      --include-furniture  Also compare headers, footers and page numbers
      --ignore-case        Ignore upper/lower case differences
      --ignore-punctuation Ignore punctuation differences
      --pair <old:new>     Treat old page <old> and new page <new> as the same page
                           (repeatable; e.g. --pair 2:3 for a page without text)
      --fail-on-change     Exit with code 1 when differences are found (for CI)
  -q, --quiet              Only print the summary line
  -h, --help               Show this help
  -v, --version            Show the version

Examples:
  changelens contract-v1.pdf contract-v2.pdf -o review.html
  changelens a.pdf b.pdf --json changes.json --fail-on-change
`;

const tty = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code: string, s: string) => (tty ? `\x1b[${code}m${s}\x1b[0m` : s);
const dim = (s: string) => c('2', s);
const bold = (s: string) => c('1', s);

function color(ch: Change, s: string): string {
  if (ch.numeric) return c('33', s);
  if (ch.category === 'visual') return c('35', s);
  if (ch.kind === 'insert') return c('32', s);
  if (ch.kind === 'delete') return c('31', s);
  if (ch.kind === 'move') return c('34', s);
  return c('36', s);
}

async function makeCrops(result: CompareResult, pdfs: { old: PDFDocumentProxy; new: PDFDocumentProxy }) {
  const { createCanvas } = await import('@napi-rs/canvas');
  const make = (w: number, h: number) => createCanvas(w, h) as unknown as CanvasLike;
  const scale = 2;
  const crops: Record<string, { old?: string; new?: string; wide?: boolean }> = {};
  const regions = new Map(result.changes.map((ch) => [ch.id, cropRegions(ch, result.oldDoc, result.newDoc)]));
  for (const side of ['old', 'new'] as const) {
    const byPage = new Map<number, { change: Change; region: Region }[]>();
    for (const ch of result.changes) {
      const region = regions.get(ch.id)![side];
      if (!region) continue;
      let list = byPage.get(region.page);
      if (!list) byPage.set(region.page, (list = []));
      list.push({ change: ch, region });
    }
    for (const [page, list] of byPage) {
      const r = await renderPage(pdfs[side], page, scale);
      for (const { change, region } of list) {
        const entry = (crops[change.id] ??= {});
        entry[side] = drawCrop(make, r.canvas as unknown as CanvasLike, scale, region, change, side);
        if (region.rect.w > 380) entry.wide = true;
      }
    }
  }
  return crops;
}

async function main(): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs({
      allowPositionals: true,
      options: {
        out: { type: 'string', short: 'o' },
        json: { type: 'string' },
        lang: { type: 'string' },
        'no-visual': { type: 'boolean' },
        'no-format': { type: 'boolean' },
        'include-furniture': { type: 'boolean' },
        'ignore-case': { type: 'boolean' },
        'ignore-punctuation': { type: 'boolean' },
        pair: { type: 'string', multiple: true },
        'fail-on-change': { type: 'boolean' },
        quiet: { type: 'boolean', short: 'q' },
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
      },
    });
  } catch (e) {
    process.stderr.write(`${(e as Error).message}\n\n${HELP}`);
    return 2;
  }
  const { values: o, positionals } = parsed;
  if (o.help) {
    process.stdout.write(HELP);
    return 0;
  }
  if (o.version) {
    process.stdout.write(VERSION + '\n');
    return 0;
  }
  if (positionals.length !== 2) {
    process.stderr.write(HELP);
    return 2;
  }
  const lang: Lang = o.lang === 'zh' || o.lang === 'en' ? o.lang : detectLang(process.env.LC_ALL || process.env.LANG || '');
  const [oldPath, newPath] = positionals;

  const open = async (path: string) => {
    try {
      return await openPdf(path);
    } catch (e) {
      throw new Error(explainOpenError(lang, basename(path), e));
    }
  };
  const pdfs = { old: await open(oldPath), new: await open(newPath) };
  const oldDoc = buildDocModel(await extractText(pdfs.old, basename(oldPath)));
  const newDoc = buildDocModel(await extractText(pdfs.new, basename(newPath)));
  for (const d of [oldDoc, newDoc]) {
    if (d.tokens.length === 0) {
      process.stderr.write(t(lang, 'noText', { name: d.name }) + '\n');
      return 2;
    }
  }
  const manualPairs: [number, number][] = [];
  for (const p of o.pair ?? []) {
    const m = /^(\d+):(\d+)$/.exec(p);
    if (!m || +m[1] < 1 || +m[2] < 1 || +m[1] > oldDoc.pages.length || +m[2] > newDoc.pages.length) {
      process.stderr.write(`--pair ${p}: expected OLD:NEW with pages 1–${oldDoc.pages.length} and 1–${newDoc.pages.length}, e.g. --pair 2:3\n`);
      return 2;
    }
    manualPairs.push([+m[1] - 1, +m[2] - 1]);
  }
  const result = compareDocs(oldDoc, newDoc, {
    manualPairs,
    ignoreCase: !!o['ignore-case'],
    ignorePunctuation: !!o['ignore-punctuation'],
    ignoreFurniture: !o['include-furniture'],
    detectFormatting: !o['no-format'],
  });

  const rendering = await canRender();
  if (!o['no-visual']) {
    if (rendering) {
      await addVisualChanges(
        result,
        (p) => renderPage(pdfs.old, p, 1.5),
        (p) => renderPage(pdfs.new, p, 1.5),
      );
    } else if (!o.quiet) {
      process.stderr.write(dim('(graphics comparison skipped: optional dependency @napi-rs/canvas is not installed)\n'));
    }
  }

  const counts = countChanges(result.changes);
  const head = `${bold(basename(oldPath))} (${oldDoc.pages.length}) → ${bold(basename(newPath))} (${newDoc.pages.length})`;
  process.stdout.write(`${head}\n`);
  if (counts.total === 0) process.stdout.write(t(lang, 'noChanges') + '\n');
  else process.stdout.write(`${bold(countLabel(lang, counts.total))} — ${t(lang, 'summaryLine', { text: counts.text, num: counts.numbers, visual: counts.visual })}\n`);
  // Filtered differences and uncovered areas are always stated.
  const notes = notices(lang, result);
  const visualCompared = !o['no-visual'] && rendering;
  if (!visualCompared) notes.push({ level: 'info', text: t(lang, 'noticeNoVisual') });
  for (const n of notes) process.stdout.write((n.level === 'warn' ? c('33', '! ') : dim('· ')) + (n.level === 'warn' ? n.text : dim(n.text)) + '\n');
  if (!o.quiet) {
    const width = String(result.changes.length).length;
    for (const [k, ch] of result.changes.entries()) {
      const loc = locationLabel(lang, ch);
      process.stdout.write(`  ${dim(String(k + 1).padStart(width))}  ${color(ch, kindLabel(lang, ch).padEnd(lang === 'zh' ? 2 : 8))}  ${describeChange(lang, ch)}  ${dim(loc)}\n`);
    }
  }

  const sha = async (p: string) => createHash('sha256').update(await readFile(p)).digest('hex');
  const input = {
    result,
    lang,
    oldName: basename(oldPath),
    newName: basename(newPath),
    files: { old: { sha256: await sha(oldPath) }, new: { sha256: await sha(newPath) } },
    version: VERSION,
    visualCompared,
  };
  if (o.out) {
    const crops = rendering ? await makeCrops(result, pdfs) : {};
    await writeFile(o.out, buildReport({ ...input, crops }));
    process.stdout.write(dim(`→ ${o.out}\n`));
  }
  if (o.json) {
    await writeFile(o.json, JSON.stringify(buildJson(input), null, 2));
    process.stdout.write(dim(`→ ${o.json}\n`));
  }
  return o['fail-on-change'] && counts.total > 0 ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    process.stderr.write(`${err?.message ?? err}\n`);
    process.exit(2);
  },
);
