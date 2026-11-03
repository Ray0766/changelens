// Evaluation: ChangeLens vs. two baselines on the synthetic corpus in
// eval/cases (plus the pairs listed in eval/extra-cases.json). Run:
//   node eval/run.ts [--json out.json] [--cases a,b*] [--exclude c*] [--blind] [--verbose]
//                    [--dir <folder of cases>]   (default eval/cases)
//
// Case selection: every case is scored except those marked `"blind": true`
// in truth.json (a held-out set waiting for its single recorded run; add
// --blind to include them). --cases / --exclude take comma-separated ids;
// `*` matches any characters (e.g. --cases 'holdout2-*').
//
// Sets (field `set` in truth.json; the extra-cases.json pairs are "extra"):
//   tuning      cases the engine was tuned on
//   held-out-1  first held-out round (engine author), since used for fixes
//   held-out-2  second held-out round (independent authors), since used for fixes
//
// Baselines
//  - text-lines: text extracted per line (headers/footers included, as
//    pdftotext would), then a line diff over the whole document — the usual
//    "extract text and diff it" approach.
//  - pixel-pages: page N of the old file rendered and compared with page N of
//    the new file, differing pixels clustered into regions — the approach of
//    diff-pdf (emulated here; diff-pdf itself is not used).
//
// Scoring (per truth item; one reported item may cover several truth items)
//  - found:    some reported item covers it. ChangeLens: the change type
//              matches (insert/delete/replace/move exactly) and the change
//              contains the truth text; a truth item without text must be on
//              its page and overlap its region (oldRect/newRect: [x, y, w, h]
//              in PDF points, top-left origin; a region given for a text item
//              must be overlapped too). Text line diff: a hunk
//              contains the text. Pixel page diff: any region on the expected
//              page (a generous rule for that baseline).
//  - located:  found by an item that is on the expected page in both files.
//  - separate: truth items found as an item of their own (the largest
//              one-to-one assignment) — the stricter, granularity-aware count.
//  - extra:    reported items that no truth item explains. A truth item
//              explains at most `maxItems` items (default 1), so a change
//              reported in pieces, or twice, counts as noise.
//  - items:    everything a reviewer has to read.
// Expected pages are explicit (oldPage/newPage) or the single page whose body
// text contains the snippet; a snippet on no page or on several is an error.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { openPdf } from '../src/node/pdf.ts';
import { renderPage } from '../src/node/render.ts';
import { extractText } from '../src/pdf/extract.ts';
import { buildDocModel } from '../src/core/tokenize.ts';
import { compareDocs } from '../src/core/compare.ts';
import { addVisualChanges } from '../src/core/pipeline.ts';
import { intern, matchSequences, opsFromMatches } from '../src/core/diff.ts';
import type { DocModel } from '../src/core/types.ts';
import type { Raster } from '../src/core/visual.ts';
import { changeItem, changeLensMatch, expectedPages, furnitureDisclosure, score, textMatch, validate, type CaseMeta, type Item, type Score, type Scored, type Truth } from './score.ts';

const root = new URL('.', import.meta.url).pathname;

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

async function evalCase(id: string, before: string, after: string, truth: Truth[]) {
  validate(id, truth);
  const pa = await openPdf(before);
  const pb = await openPdf(after);
  const a = buildDocModel(await extractText(pa, 'a'));
  const b = buildDocModel(await extractText(pb, 'b'));

  // ChangeLens (text + visual).
  let t0 = performance.now();
  const r = compareDocs(a, b);
  await addVisualChanges(r, (p) => renderPage(pa, p, 1.5), (p) => renderPage(pb, p, 1.5));
  const clMs = performance.now() - t0;
  const cl = score(id, truth, r.changes.map(changeItem), a, b, changeLensMatch, furnitureDisclosure(r, a, b));

  // Text baseline.
  t0 = performance.now();
  const lines = lineItems(a, b);
  const textMs = performance.now() - t0;
  const tx = score(id, truth, lines, a, b, (t, it) => (t.type === 'graphic' || t.type === 'format' ? false : textMatch(t, it)));

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
  const expOf = new Map(truth.map((t) => [t, expectedPages(id, t, a, b)]));
  const px = score(id, truth, regionItems, a, b, (t, it) => {
    const exp = expOf.get(t)!;
    return it.newPages.some((p) => exp.new.includes(p)) || it.oldPages.some((p) => exp.old.includes(p));
  });

  const strip = ({ misses: _, ...s }: Scored) => s;
  return {
    changelens: { ...strip(cl), ms: clMs },
    textLines: { ...strip(tx), ms: textMs },
    pixelPages: { ...strip(px), ms: pxMs },
    /** ChangeLens truth items that are not found, not located or not separate. */
    misses: cl.misses,
    pages: `${a.pages.length}→${b.pages.length}`,
    reported: r.changes.map((c) => ({ kind: c.kind, numeric: !!c.numeric, old: c.old.text.slice(0, 60), new: c.new.text.slice(0, 60) })),
  };
}

// ------------------------------------------------------------------- main --

const { values: args } = parseArgs({
  options: {
    json: { type: 'string' },
    dir: { type: 'string' },
    cases: { type: 'string' },
    exclude: { type: 'string' },
    blind: { type: 'boolean' },
    verbose: { type: 'boolean' },
  },
});
const patterns = (s?: string) => (s ? s.split(',').map((p) => new RegExp('^' + p.trim().replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$')) : null);
const only = patterns(args.cases);
const skip = patterns(args.exclude);
const selected = (id: string) => (!only || only.some((re) => re.test(id))) && !skip?.some((re) => re.test(id));

const SETS: Record<string, string> = {
  tuning: 'Tuning set',
  'held-out-1': 'Held-out round 1 (since used for fixes)',
  'held-out-2': 'Held-out round 2 (since used for fixes)',
  extra: 'Extra pairs (demos, LibreOffice)',
};
const pairs: { id: string; before: string; after: string; meta: CaseMeta }[] = [];
const casesDir = args.dir ?? join(root, 'cases');
for (const id of readdirSync(casesDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort()) {
  const dir = join(casesDir, id);
  pairs.push({ id, before: join(dir, 'before.pdf'), after: join(dir, 'after.pdf'), meta: JSON.parse(readFileSync(join(dir, 'truth.json'), 'utf8')) });
}
// Further pairs (demo files, LibreOffice fixture) listed with their paths.
const extraCases = JSON.parse(readFileSync(join(root, 'extra-cases.json'), 'utf8')) as Record<string, CaseMeta & { before: string; after: string }>;
for (const [id, meta] of Object.entries(extraCases)) pairs.push({ id, before: join(root, '..', meta.before), after: join(root, '..', meta.after), meta: { set: 'extra', ...meta } });

type Result = Awaited<ReturnType<typeof evalCase>> & { description: string; set: string };
const results: Record<string, Result> = {};
let blindSkipped = 0;
for (const { id, before, after, meta } of pairs) {
  if (!selected(id)) continue;
  if (meta.blind && !args.blind) {
    blindSkipped++;
    continue;
  }
  const set = meta.set ?? 'tuning';
  if (!SETS[set]) throw new Error(`${id}: unknown set "${set}"`);
  results[id] = { description: meta.description, set, ...(await evalCase(id, before, after, meta.truth)) };
}

const tools = ['changelens', 'textLines', 'pixelPages'] as const;
type Tool = (typeof tools)[number];
const toolLabel = { changelens: 'ChangeLens', textLines: 'Text line diff', pixelPages: 'Pixel page diff' };
const unit = { changelens: 'items', textLines: 'hunks', pixelPages: 'regions' };
const zero = (): Score => ({ found: 0, located: 0, separate: 0, total: 0, extra: 0, items: 0, ms: 0 });
const perTool = () => Object.fromEntries(tools.map((t) => [t, zero()])) as Record<Tool, Score>;
const add = (into: Score, s: Score) => {
  for (const k of Object.keys(into) as (keyof Score)[]) into[k] += s[k];
};
const cell = (s: Score) => `${s.found} / ${s.located} / ${s.extra} (${s.separate})`;
const columns = tools.map((t) => `${toolLabel[t]} found / located / extra (separate)`).join(' | ');
let out = `| Case | Set | Pages | Truth | ${columns} |\n|---|---|---|---|${tools.map(() => '---').join('|')}|\n`;
const totals = perTool();
const bySet: Record<string, Record<Tool, Score>> = {};
for (const [id, r] of Object.entries(results)) {
  out += `| ${id} | ${r.set} | ${r.pages} | ${r.changelens.total} | ${tools.map((t) => cell(r[t])).join(' | ')} |\n`;
  bySet[r.set] ??= perTool();
  for (const t of tools) {
    add(totals[t], r[t]);
    add(bySet[r.set][t], r[t]);
  }
}
out += `| **Total** | | | ${totals.changelens.total} | ${tools.map((t) => `**${cell(totals[t])}**`).join(' | ')} |\n`;
console.log(out);
let summary = `| Set | Cases | Truth | ${columns} |\n|---|---|---|${tools.map(() => '---').join('|')}|\n`;
for (const set of Object.keys(SETS).filter((s) => bySet[s])) {
  const count = Object.values(results).filter((r) => r.set === set).length;
  summary += `| ${SETS[set]} | ${count} | ${bySet[set].changelens.total} | ${tools.map((t) => cell(bySet[set][t])).join(' | ')} |\n`;
}
summary += `| **All selected** | ${Object.keys(results).length} | ${totals.changelens.total} | ${tools.map((t) => `**${cell(totals[t])}**`).join(' | ')} |\n`;
console.log(summary);
console.log('(separate) = truth items found as an item of their own (one-to-one).');
console.log('To read: ' + tools.map((t) => `${toolLabel[t]} ${totals[t].extra} extra ${unit[t]} (${totals[t].items} in total)`).join('; '));
console.log('Time (ms): ' + tools.map((t) => `${toolLabel[t]} ${totals[t].ms.toFixed(0)}`).join(', '));
if (blindSkipped) console.log(`${blindSkipped} blind case(s) not scored; add --blind for their single recorded run.`);
const misses = Object.entries(results).flatMap(([id, r]) => r.misses.map((m) => `${id} #${m.truth} ${m.text}: ${m.why}`));
if (misses.length) console.log('ChangeLens misses:\n  ' + misses.join('\n  '));
if (args.json) writeFileSync(args.json, JSON.stringify({ results, totals, sets: bySet, blindSkipped }, null, 2));
if (args.verbose) for (const [id, r] of Object.entries(results)) console.log(id, JSON.stringify(r.reported));
