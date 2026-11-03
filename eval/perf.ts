// Time and peak memory of the CLI pipeline (extraction, text comparison and,
// unless --no-visual, the visual comparison at 1.5×; no report), one fresh
// process per run.
//
//   node eval/perf.ts old.pdf new.pdf [--no-visual]
//     one run of that pair; prints JSON: { ms, maxRssMB, pages, changes, visual }
//   node eval/perf.ts [--runs 3] [--keep <dir>]
//     generates the 24 → 24 page A4 pair (eval/make-cases.mjs --perf-pair; needs
//     Playwright's Chromium), then times it text-only and text + visual and
//     prints the median of the runs. --keep writes the pair into <dir>.
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { openPdf } from '../src/node/pdf.ts';
import { renderPage } from '../src/node/render.ts';
import { extractText } from '../src/pdf/extract.ts';
import { buildDocModel } from '../src/core/tokenize.ts';
import { compareDocs } from '../src/core/compare.ts';
import { addVisualChanges } from '../src/core/pipeline.ts';

const { values: o, positionals } = parseArgs({ allowPositionals: true, options: { 'no-visual': { type: 'boolean' }, runs: { type: 'string' }, keep: { type: 'string' } } });

interface Run {
  ms: number;
  maxRssMB: number;
  pages: string;
  changes: number;
  visual: boolean;
}

if (positionals.length === 2) {
  const [a, b] = positionals;
  const visual = !o['no-visual'];
  const t0 = performance.now();
  const pa = await openPdf(a);
  const pb = await openPdf(b);
  const r = compareDocs(buildDocModel(await extractText(pa, 'a')), buildDocModel(await extractText(pb, 'b')));
  if (visual) await addVisualChanges(r, (p) => renderPage(pa, p, 1.5), (p) => renderPage(pb, p, 1.5));
  const ms = performance.now() - t0;
  const run: Run = { ms: Math.round(ms), maxRssMB: Math.round(process.resourceUsage().maxRSS / 1024), pages: `${r.oldDoc.pages.length}→${r.newDoc.pages.length}`, changes: r.changes.length, visual };
  console.log(JSON.stringify(run));
} else if (positionals.length === 0) {
  const dir = o.keep ?? mkdtempSync(join(tmpdir(), 'changelens-perf-'));
  const here = (f: string) => new URL(f, import.meta.url).pathname;
  execFileSync(process.execPath, [here('make-cases.mjs'), '--perf-pair', dir], { stdio: 'inherit' });
  const runs = Number(o.runs ?? 3);
  const median = (xs: number[]) => [...xs].sort((x, y) => x - y)[Math.floor(xs.length / 2)];
  console.log(`| Pair | Mode | Median of ${runs} runs | Peak RSS (max) | Changes |\n|---|---|---|---|---|`);
  for (const mode of [['--no-visual'], []]) {
    const results: Run[] = [];
    for (let k = 0; k < runs; k++) {
      const out = execFileSync(process.execPath, [here('perf.ts'), join(dir, 'before.pdf'), join(dir, 'after.pdf'), ...mode], { encoding: 'utf8' });
      results.push(JSON.parse(out.trim().split('\n').pop()!));
    }
    const r = results[0];
    console.log(`| Generated ${r.pages} A4 pages | ${r.visual ? 'text + visual' : 'text only'} | ${(median(results.map((x) => x.ms)) / 1000).toFixed(1)} s | ${Math.max(...results.map((x) => x.maxRssMB))} MB | ${r.changes} |`);
  }
  console.log(`Node ${process.version}, ${process.platform}/${process.arch}.${o.keep ? ` Pair kept in ${dir}.` : ''}`);
} else {
  console.error('usage: node eval/perf.ts [old.pdf new.pdf [--no-visual]]');
  process.exit(2);
}
