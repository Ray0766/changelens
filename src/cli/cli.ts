#!/usr/bin/env node
import { access, constants, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { openPdf } from '../node/pdf.ts';
import { renderPage, canRender } from '../node/render.ts';
import { extractText } from '../pdf/extract.ts';
import { buildDocModel } from '../core/tokenize.ts';
import { compareDocs } from '../core/compare.ts';
import { addVisualChanges, countChanges } from '../core/pipeline.ts';
import { cropRegions, drawCrop, type CanvasLike, type Region } from '../core/crops.ts';
import { buildJson, buildReport, comparedEverything, reportNotices } from '../core/report.ts';
import { countLabel, describeChange, kindLabel, locationLabel } from '../core/describe.ts';
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
      --lang <en|zh>       Language of descriptions: en or zh (zh-CN, en-US … also
                           accepted; default: from $LANG)
      --no-visual          Skip the comparison of graphics, images and colours
      --no-format          Do not report bold / size / font changes
      --include-furniture  Also compare headers, footers and page numbers
      --ignore-case        Ignore upper/lower case differences
      --ignore-punctuation Ignore punctuation differences
      --pair <old:new>     Treat old page <old> and new page <new> as the same page
                           (repeatable; e.g. --pair 2:3 for a page without text)
      --fail-on-change     Exit with code 1 when differences are found, 3 when
                           none were found but not everything was compared (for CI)
  -q, --quiet              Only print the summary line and the notes
  -h, --help               Show this help
  -v, --version            Show the version

Exit codes:
  0  Done. With --fail-on-change: no differences and everything was compared.
  1  With --fail-on-change: differences were found.
  2  Wrong arguments, a PDF could not be read, or an output file could not be
     written (or would overwrite an input).
  3  With --fail-on-change: no differences in what was compared, but some of it
     was not compared: pages without a text layer, unreadable characters, or
     graphics (--no-visual, or @napi-rs/canvas missing). The notes say what.

Examples:
  changelens contract-v1.pdf contract-v2.pdf -o review.html
  changelens a.pdf b.pdf --json changes.json --fail-on-change
`;

/**
 * Text from a PDF (and file names) can contain control characters or bidi
 * overrides that would rewrite the terminal (e.g. ESC[2J clears the screen).
 * Show them as visible escapes instead; colour codes are added afterwards.
 */
function safe(s: string): string {
  return s.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, (ch) => {
    const n = ch.charCodeAt(0);
    return n < 0x100 ? '\\x' + n.toString(16).padStart(2, '0') : '\\u' + n.toString(16).padStart(4, '0');
  });
}

/** Refuse output paths that would overwrite an input or each other, or cannot be written. */
async function checkOutputs(inputs: string[], outputs: { flag: string; path: string }[]): Promise<string | null> {
  const same = async (a: string, b: string) => {
    if (resolve(a) === resolve(b)) return true;
    // Same file under another name (symlink, hard link, case-insensitive file system).
    const [sa, sb] = await Promise.all([stat(a).catch(() => null), stat(b).catch(() => null)]);
    return !!sa && !!sb && sa.dev === sb.dev && sa.ino === sb.ino;
  };
  for (const [k, o] of outputs.entries()) {
    for (const input of inputs)
      if (await same(o.path, input)) return `${o.flag} ${o.path}: this is an input file and would be overwritten. Choose another name.`;
    for (const other of outputs.slice(k + 1))
      if (await same(o.path, other.path)) return `${o.flag} and ${other.flag} name the same file (${o.path}). Choose two different names.`;
    const existing = await stat(o.path).catch(() => null);
    if (existing?.isDirectory()) return `${o.flag} ${o.path}: this is a folder; give a file name.`;
    const dir = dirname(resolve(o.path));
    try {
      if (!(await stat(dir)).isDirectory()) return `${o.flag} ${o.path}: ${dir} is not a folder.`;
      await access(existing ? o.path : dir, constants.W_OK);
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      return code === 'ENOENT' ? `${o.flag} ${o.path}: the folder ${dir} does not exist.` : `${o.flag} ${o.path}: no permission to write there (${code}).`;
    }
  }
  return null;
}

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
        // A page too large for the pixel budget at this scale: render each crop on its own.
        const src = r.scale < scale ? (await renderPage(pdfs[side], page, scale, region.rect)).canvas : r.canvas;
        entry[side] = drawCrop(make, src as unknown as CanvasLike, scale, region, change, side);
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
  let lang: Lang;
  if (o.lang === undefined) lang = detectLang(process.env.LC_ALL || process.env.LANG || '');
  else if (/^(zh|en)([-_][\w-]*)?$/i.test(o.lang)) lang = detectLang(o.lang);
  else {
    process.stderr.write(`Unknown --lang value "${safe(o.lang)}" (use en or zh, e.g. --lang zh)\n`);
    return 2;
  }
  const [oldPath, newPath] = positionals;
  // Check the output paths before the (possibly long) comparison.
  const outputs = [
    ...(o.out !== undefined ? [{ flag: '-o', path: o.out }] : []),
    ...(o.json !== undefined ? [{ flag: '--json', path: o.json }] : []),
  ];
  const outputError = await checkOutputs([oldPath, newPath], outputs);
  if (outputError) {
    process.stderr.write(safe(outputError) + '\n');
    return 2;
  }

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
      process.stderr.write(safe(t(lang, 'noText', { name: d.name })) + '\n');
      return 2;
    }
  }
  const manualPairs: [number, number][] = [];
  for (const p of o.pair ?? []) {
    const m = /^(\d+):(\d+)$/.exec(p);
    if (!m || +m[1] < 1 || +m[2] < 1 || +m[1] > oldDoc.pages.length || +m[2] > newDoc.pages.length) {
      process.stderr.write(`--pair ${safe(p)}: expected OLD:NEW with pages 1–${oldDoc.pages.length} and 1–${newDoc.pages.length}, e.g. --pair 2:3\n`);
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
  const head = `${bold(safe(basename(oldPath)))} (${oldDoc.pages.length}) → ${bold(safe(basename(newPath)))} (${newDoc.pages.length})`;
  process.stdout.write(`${head}\n`);
  // Filtered differences and uncovered areas are always stated.
  const visualCompared = !o['no-visual'] && rendering;
  const notes = reportNotices(lang, result, visualCompared);
  const complete = comparedEverything(notes, visualCompared);
  if (counts.total === 0) process.stdout.write(t(lang, complete ? 'noChanges' : 'noChangesIncomplete') + '\n');
  else process.stdout.write(`${bold(countLabel(lang, counts.total))} — ${t(lang, 'summaryLine', { text: counts.text, num: counts.numbers, visual: counts.visual })}\n`);
  for (const n of notes) process.stdout.write((n.level === 'warn' ? c('33', '! ') + safe(n.text) : dim('· ' + safe(n.text))) + '\n');
  if (!o.quiet) {
    const width = String(result.changes.length).length;
    for (const [k, ch] of result.changes.entries()) {
      const loc = safe(locationLabel(lang, ch));
      process.stdout.write(`  ${dim(String(k + 1).padStart(width))}  ${color(ch, safe(kindLabel(lang, ch)).padEnd(lang === 'zh' ? 2 : 8))}  ${safe(describeChange(lang, ch))}  ${dim(loc)}\n`);
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
  // Each output is written on its own: one failure does not lose the other.
  let writeFailed = false;
  const write = async (path: string, content: () => Promise<string>) => {
    try {
      await writeFile(path, await content());
      process.stdout.write(dim(`→ ${safe(path)}`) + '\n');
    } catch (e) {
      process.stderr.write(`Could not write ${safe(path)}: ${safe((e as Error)?.message ?? String(e))}\n`);
      writeFailed = true;
    }
  };
  if (o.json) await write(o.json, async () => JSON.stringify(buildJson(input), null, 2));
  if (o.out) await write(o.out, async () => buildReport({ ...input, crops: rendering ? await makeCrops(result, pdfs) : {} }));
  if (writeFailed) return 2;
  if (!o['fail-on-change']) return 0;
  if (counts.total > 0) return 1;
  return complete ? 0 : 3;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    process.stderr.write(`${safe(String(err?.message ?? err))}\n`);
    process.exit(2);
  },
);
