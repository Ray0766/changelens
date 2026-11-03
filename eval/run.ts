// Evaluation: ChangeLens vs. two baselines on the synthetic corpus in
// eval/cases (plus the demo pairs). Run:  node eval/run.ts [--json out.json]
//
// Baselines
//  - text-lines: text extracted per line (headers/footers included, as
//    pdftotext would), then a line diff over the whole document — the usual
//    "extract text and diff it" approach.
//  - pixel-pages: page N of the old file rendered and compared with page N of
//    the new file, differing pixels clustered into regions — the approach of
//    diff-pdf (emulated here; diff-pdf itself is not used).
//
// Scoring (per truth item)
//  - found:   some reported item covers it (ChangeLens: compatible change type
//             and text; text-lines: hunk text; pixel-pages: any region on the
//             expected page — a generous rule for that baseline)
//  - located: found AND the reported page matches the expected page
//  - extra:   reported items that match no truth item (noise the reviewer must read)
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { openPdf } from '../src/node/pdf.ts';
import { renderPage } from '../src/node/render.ts';
import { extractText } from '../src/pdf/extract.ts';
import { buildDocModel, joinTokens } from '../src/core/tokenize.ts';
import { compareDocs } from '../src/core/compare.ts';
import { addVisualChanges } from '../src/core/pipeline.ts';
import { intern, matchSequences, opsFromMatches } from '../src/core/diff.ts';
import type { Change, DocModel } from '../src/core/types.ts';
import type { Raster } from '../src/core/visual.ts';

interface Truth {
  type: string;
  old?: string;
  new?: string;
  oldPage?: number | number[];
  newPage?: number | number[];
  many?: boolean;
}
interface Item {
  oldText: string;
  newText: string;
  oldPages: number[]; // 1-based
  newPages: number[];
  change?: Change;
}
interface Score {
  found: number;
  located: number;
  total: number;
  extra: number;
  items: number;
  ms: number;
}

const root = new URL('.', import.meta.url).pathname;
const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
const asList = (p?: number | number[]) => (p === undefined ? [] : Array.isArray(p) ? p : [p]);

function pagesWith(doc: DocModel, snippet: string): number[] {
  const out: number[] = [];
  for (const pg of doc.pages) {
    const text = norm(joinTokens(doc.tokens.filter((t) => t.page === pg.index && !t.furniture)));
    if (text.includes(norm(snippet))) out.push(pg.index + 1);
  }
  return out;
}

function expectedPages(t: Truth, a: DocModel, b: DocModel) {
  return {
    old: t.oldPage !== undefined ? asList(t.oldPage) : t.old ? pagesWith(a, t.old) : [],
    new: t.newPage !== undefined ? asList(t.newPage) : t.new ? pagesWith(b, t.new) : [],
  };
}

// ------------------------------------------------------------- ChangeLens --

function typeOk(t: Truth, c: Change): boolean {
  switch (t.type) {
    case 'number':
      return !!c.numeric;
    case 'move':
      return c.kind === 'move';
    case 'insert':
    case 'delete':
    case 'replace':
      return c.category === 'text';
    case 'format':
      return c.kind === 'format' || (c.kind === 'graphic' && !!c.format);
    case 'graphic':
      return c.kind === 'graphic';
    case 'position':
      return c.kind === 'position';
    case 'overflow':
      return c.kind === 'overflow';
    case 'furniture':
      return false; // handled separately: disclosed as "ignored"
  }
  return false;
}

function changeItem(c: Change): Item {
  const pages = (s: Change['old']) => (s.pages.length ? s.pages : s.caret ? [s.caret.page] : []).map((p) => p + 1);
  return { oldText: c.old.text, newText: c.new.text, oldPages: pages(c.old), newPages: pages(c.new), change: c };
}

// -------------------------------------------------------------- baselines --

function lineItems(a: DocModel, b: DocModel): Item[] {
  const la = a.lines.map((l) => l.text);
  const lb = b.lines.map((l) => l.text);
  const [ka, kb] = intern(la, lb);
  const ops = opsFromMatches(matchSequences(ka, kb), la.length, lb.length);
  const items: Item[] = [];
  let cur: Item | null = null;
  for (const op of ops) {
    if (op.type === 'equal') {
      if (cur) items.push(cur);
      cur = null;
      continue;
    }
    cur ??= { oldText: '', newText: '', oldPages: [], newPages: [] };
    for (let i = op.a0; i < op.a1; i++) {
      cur.oldText += ' ' + la[i];
      cur.oldPages.push(a.lines[i].page + 1);
    }
    for (let i = op.b0; i < op.b1; i++) {
      cur.newText += ' ' + lb[i];
      cur.newPages.push(b.lines[i].page + 1);
    }
  }
  if (cur) items.push(cur);
  return items.map((it) => ({ ...it, oldPages: [...new Set(it.oldPages)], newPages: [...new Set(it.newPages)] }));
}

function pixelRegions(ra: Raster | null, rb: Raster | null): number {
  if (!ra || !rb) return ra || rb ? 1 : 0; // page only in one file: one big difference
  const w = Math.min(ra.width, rb.width);
  const h = Math.min(ra.height, rb.height);
  const CELL = 8;
  const cols = Math.ceil(w / CELL);
  const rows = Math.ceil(h / CELL);
  const hot = new Uint8Array(cols * rows);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = (y * ra.width + x) * 4;
      const q = (y * rb.width + x) * 4;
      const d = Math.max(Math.abs(ra.data[p] - rb.data[q]), Math.abs(ra.data[p + 1] - rb.data[q + 1]), Math.abs(ra.data[p + 2] - rb.data[q + 2]));
      if (d > 40) hot[((y / CELL) | 0) * cols + ((x / CELL) | 0)] = 1;
    }
  }
  // Count connected regions (8-neighbourhood, with a 2-cell gap allowed).
  const seen = new Uint8Array(hot.length);
  let regions = 0;
  for (let i = 0; i < hot.length; i++) {
    if (!hot[i] || seen[i]) continue;
    regions++;
    const stack = [i];
    seen[i] = 1;
    while (stack.length) {
      const c = stack.pop()!;
      const cx = c % cols;
      const cy = (c / cols) | 0;
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
          const n = ny * cols + nx;
          if (hot[n] && !seen[n]) {
            seen[n] = 1;
            stack.push(n);
          }
        }
    }
  }
  return regions;
}

// ---------------------------------------------------------------- scoring --

function score(truth: Truth[], items: Item[], a: DocModel, b: DocModel, match: (t: Truth, it: Item) => boolean): Omit<Score, 'ms'> {
  const used = new Set<number>();
  let found = 0;
  let located = 0;
  for (const t of truth) {
    const exp = expectedPages(t, a, b);
    const hits = items.map((it, k) => ({ it, k })).filter(({ it, k }) => (t.many || !used.has(k)) && match(t, it));
    if (!hits.length) continue;
    found++;
    // A side without pages (e.g. the old side of an added graphic) is not checked.
    const pageOk = (it: Item) =>
      (exp.new.length === 0 || it.newPages.length === 0 || it.newPages.some((p) => exp.new.includes(p))) &&
      (exp.old.length === 0 || it.oldPages.length === 0 || it.oldPages.some((p) => exp.old.includes(p))) &&
      (it.newPages.length > 0 || it.oldPages.length > 0);
    const best = hits.find(({ it }) => pageOk(it)) ?? hits[0];
    if (pageOk(best.it)) located++;
    if (t.many) hits.forEach(({ k }) => used.add(k));
    else used.add(best.k);
  }
  return { found, located, total: truth.length, extra: items.length - used.size, items: items.length };
}

const textMatch = (t: Truth, it: Item) =>
  (t.old === undefined || norm(it.oldText).includes(norm(t.old))) && (t.new === undefined || norm(it.newText).includes(norm(t.new))) && (t.old !== undefined || t.new !== undefined);

async function evalCase(before: string, after: string, truth: Truth[]) {
  const pa = await openPdf(before);
  const pb = await openPdf(after);
  const a = buildDocModel(await extractText(pa, 'a'));
  const b = buildDocModel(await extractText(pb, 'b'));

  // ChangeLens (text + visual).
  let t0 = performance.now();
  const r = compareDocs(a, b);
  await addVisualChanges(r, (p) => renderPage(pa, p, 1.5), (p) => renderPage(pb, p, 1.5));
  const clMs = performance.now() - t0;
  // A header/footer truth counts as found (and located) for ChangeLens when it
  // is reported as a change or disclosed as an ignored header/footer difference.
  const furnitureTruth = truth.filter((t) => t.type === 'furniture');
  const clTruth = truth.filter((t) => t.type !== 'furniture');
  const clRaw = score(clTruth, r.changes.map(changeItem), a, b, (t, it) => {
    if (!typeOk(t, it.change!)) return false;
    // Graphic/format truths without text match on type and page only.
    if (t.old === undefined && t.new === undefined) return true;
    return textMatch(t, it);
  });
  const reportedAsChange = (t: Truth) => r.changes.some((c) => c.category === 'text' && textMatch(t, changeItem(c)));
  const disclosed = furnitureTruth.filter((t) => reportedAsChange(t) || r.ignored.furniture > 0).length;
  // A header change reported as a text change is not noise.
  clRaw.extra -= r.changes.filter((c) => furnitureTruth.some((t) => c.category === 'text' && textMatch(t, changeItem(c)))).length;
  const cl = { ...clRaw, found: clRaw.found + disclosed, located: clRaw.located + disclosed, total: truth.length };

  // Text baseline.
  t0 = performance.now();
  const lines = lineItems(a, b);
  const textMs = performance.now() - t0;
  const tx = score(truth, lines, a, b, (t, it) => (t.type === 'graphic' || t.type === 'format' ? false : textMatch(t, it)));
  if (furnitureTruth.length) {
    // Pages for header truths: every page.
    for (const t of furnitureTruth) t.newPage ??= b.pages.map((p) => p.index + 1);
  }

  // Pixel baseline: page N vs page N.
  t0 = performance.now();
  const n = Math.max(a.pages.length, b.pages.length);
  const regionItems: Item[] = [];
  for (let p = 0; p < n; p++) {
    const ra = p < a.pages.length ? await renderPage(pa, p, 1) : null;
    const rb = p < b.pages.length ? await renderPage(pb, p, 1) : null;
    const count = pixelRegions(ra, rb);
    for (let k = 0; k < count; k++) regionItems.push({ oldText: '', newText: '', oldPages: ra ? [p + 1] : [], newPages: rb ? [p + 1] : [] });
  }
  const pxMs = performance.now() - t0;
  const px = score(truth, regionItems, a, b, (t, it) => {
    const exp = expectedPages(t, a, b);
    return it.newPages.some((p) => exp.new.includes(p)) || it.oldPages.some((p) => exp.old.includes(p));
  });

  return {
    changelens: { ...cl, ms: clMs },
    textLines: { ...tx, ms: textMs },
    pixelPages: { ...px, ms: pxMs },
    pages: `${a.pages.length}→${b.pages.length}`,
    reported: r.changes.map((c) => ({ kind: c.kind, numeric: !!c.numeric, old: c.old.text.slice(0, 60), new: c.new.text.slice(0, 60) })),
  };
}

type Result = Awaited<ReturnType<typeof evalCase>> & { description: string; holdout?: boolean };
const results: Record<string, Result> = {};
for (const id of readdirSync(join(root, 'cases')).sort()) {
  const dir = join(root, 'cases', id);
  const meta = JSON.parse(readFileSync(join(dir, 'truth.json'), 'utf8'));
  results[(meta.holdout ? '' : '') + id] = { description: meta.description, holdout: !!meta.holdout, ...(await evalCase(join(dir, 'before.pdf'), join(dir, 'after.pdf'), meta.truth)) };
}
// Further pairs (demo files, LibreOffice fixture) listed with their paths.
const extra = JSON.parse(readFileSync(join(root, 'extra-cases.json'), 'utf8')) as Record<string, { before: string; after: string; description: string; truth: Truth[] }>;
for (const [id, meta] of Object.entries(extra)) {
  results[id] = { description: meta.description, ...(await evalCase(join(root, '..', meta.before), join(root, '..', meta.after), meta.truth)) };
}

const tools = ['changelens', 'textLines', 'pixelPages'] as const;
const label = { changelens: 'ChangeLens', textLines: 'Text line diff', pixelPages: 'Pixel page diff' };
let out = '| Case | Pages | Truth | ' + tools.map((t) => `${label[t]} found / located / extra`).join(' | ') + ' |\n';
out += '|---|---|---|' + tools.map(() => '---').join('|') + '|\n';
const totals = Object.fromEntries(tools.map((t) => [t, { found: 0, located: 0, total: 0, extra: 0, items: 0, ms: 0 }])) as Record<(typeof tools)[number], Score>;
for (const [id, r] of Object.entries(results)) {
  out += `| ${id} | ${r.pages} | ${r.changelens.total} | ` + tools.map((t) => `${r[t].found} / ${r[t].located} / ${r[t].extra}`).join(' | ') + ' |\n';
  for (const t of tools) for (const k of ['found', 'located', 'total', 'extra', 'items', 'ms'] as const) totals[t][k] += r[t][k];
}
out += `| **Total** | | ${totals.changelens.total} | ` + tools.map((t) => `**${totals[t].found} / ${totals[t].located} / ${totals[t].extra}**`).join(' | ') + ' |\n';
const hold = Object.values(results).filter((r) => r.holdout);
if (hold.length) {
  out += `| *Held-out subtotal* | | ${hold.reduce((n, r) => n + r.changelens.total, 0)} | ` + tools.map((t) => `*${hold.reduce((n, r) => n + r[t].found, 0)} / ${hold.reduce((n, r) => n + r[t].located, 0)} / ${hold.reduce((n, r) => n + r[t].extra, 0)}*`).join(' | ') + ' |\n';
}
console.log(out);
console.log('Items a reviewer has to read (all cases): ' + tools.map((t) => `${label[t]} ${totals[t].items}`).join(', '));
console.log('Time (all cases, ms): ' + tools.map((t) => `${label[t]} ${totals[t].ms.toFixed(0)}`).join(', '));
const jsonArg = process.argv.indexOf('--json');
if (jsonArg > 0) writeFileSync(process.argv[jsonArg + 1], JSON.stringify({ results, totals }, null, 2));
if (process.argv.includes('--verbose'))
  for (const [id, r] of Object.entries(results)) console.log(id, JSON.stringify(r.reported));
