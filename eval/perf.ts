// Time and peak memory of the CLI pipeline, one fresh process per run:
//   node eval/perf.ts old.pdf new.pdf [--no-visual]
// Prints JSON: { ms, maxRssMB, pages, changes }.
import { openPdf } from '../src/node/pdf.ts';
import { renderPage } from '../src/node/render.ts';
import { extractText } from '../src/pdf/extract.ts';
import { buildDocModel } from '../src/core/tokenize.ts';
import { compareDocs } from '../src/core/compare.ts';
import { addVisualChanges } from '../src/core/pipeline.ts';

const [a, b] = process.argv.slice(2);
const visual = !process.argv.includes('--no-visual');
const t0 = performance.now();
const pa = await openPdf(a);
const pb = await openPdf(b);
const r = compareDocs(buildDocModel(await extractText(pa, 'a')), buildDocModel(await extractText(pb, 'b')));
if (visual) await addVisualChanges(r, (p) => renderPage(pa, p, 1.5), (p) => renderPage(pb, p, 1.5));
const ms = performance.now() - t0;
console.log(JSON.stringify({ ms: Math.round(ms), maxRssMB: Math.round(process.resourceUsage().maxRSS / 1024), pages: `${r.oldDoc.pages.length}→${r.newDoc.pages.length}`, changes: r.changes.length, visual }));
