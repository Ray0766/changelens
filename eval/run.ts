// Evaluation: ChangeLens vs. two baselines on the synthetic corpus in
// eval/cases (plus the pairs listed in eval/extra-cases.json). Run:
//   node eval/run.ts [--json out.json] [--cases a,b*] [--exclude c*] [--blind] [--verbose]
//                    [--strict-snippets] [--strict-carets] [--registered-rules]
//                    [--items items.json] [--rescore items.json]
//                    [--dir <folder of cases>]   (default eval/cases)
//
// Case selection: every case is scored except those marked `"blind": true`
// in truth.json (a held-out set waiting for its single recorded run; add
// --blind to include them). --cases / --exclude take comma-separated ids;
// `*` matches any characters (e.g. --cases 'holdout2-*'). Only the selected
// cases' truth.json is read; one that cannot be read or is invalid is
// skipped and named at the end, and a selection that matches no case is an
// error.
//
// Sets (field `set` in truth.json; the extra-cases.json pairs are "extra"):
//   tuning      cases the engine was tuned on
//   held-out-1  first held-out round (engine author), since used for fixes
//   held-out-2  second held-out round (independent authors), since used for fixes
//   held-out-3  third held-out round (independent authors), since used for fixes
//   held-out-4  fourth held-out round (independent authors), since used for fixes
// Any other set name is reported under that name; a blind case without a
// set under "blind". With --blind, the cases not marked blind are also
// summed on their own, so the default selection's totals stay visible.
//
// --items writes the ChangeLens items of every scored case; --rescore scores
// such a file again (with the truth of the selected cases and the rules
// given) without running the engine. A blind round's single run can so be
// scored under a rule decided later, separately from later engine changes.
// test/fixtures/holdout3-recorded-items.json and holdout4-recorded-items.json
// hold the items of the recorded blind runs of rounds 3 and 4 (the latter
// is eval/results-holdout4-blind-items.json with the header/footer lines
// that the rules decided after round 4 need).
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
//              matches (insert/delete/replace/move exactly; format: whatever
//              the UI labels Format) and the change contains the truth text,
//              or (context rule, the default) the changed text lies inside
//              the truth text and the truth text lies inside what the report
//              shows: context before + changed text + context after, at a
//              place that covers the changed text, on each side the truth
//              item has. --strict-snippets turns the context rule off (the
//              rule of the recorded blind runs). A truth item without text
//              must be on its page and overlap its region (oldRect/newRect:
//              [x, y, w, h] in PDF points, top-left origin; a region given
//              for a text item must be overlapped too). A side where the
//              change has no region (the old side of an added stamp, the
//              new side of a deletion) is not checked, but the side it has
//              must overlap. A replace whose new text is the old text with
//              something inserted (每年 → 每半年) is also met by an insertion
//              of that something at that place, the context showing both
//              texts (a deletion likewise). An overflow truth with a region
//              is matched by page and region only: cut-off text is partly
//              missing from the text layer. Text line diff: a
//              hunk contains the text, or (context rule) the hunk lies inside it
//              and it lies inside the line before + hunk + line after. Pixel
//              page diff: any region on the expected page (a generous rule
//              for that baseline).
//  - located:  found by an item that is on the expected page in both files.
//              An insertion point (caret) right before the first body text
//              of a page also counts for the previous page, and one right
//              after the last body text for the next page: the same place in
//              the reading order. --strict-carets counts the caret's own page
//              only (the rule of the recorded blind runs).
//  - separate: truth items found as an item of their own (the largest
//              one-to-one assignment) — the stricter, granularity-aware count.
//  - extra:    reported items that no truth item explains. A truth item
//              explains at most `maxItems` items (default 1), so a change
//              reported in pieces, or twice, counts as noise.
//  - items:    everything a reviewer has to read.
// A header/footer truth item that ChangeLens does not report (headers and
// footers are ignored by default and counted in a notice) is found when it
// is disclosed: its old text lies in an old header/footer line and its new
// text in a new one, on its pages, and these lines differ — the lines the
// notice counts.
//
// Rules decided after a blind round was run are kept apart, so that the
// recorded run can be reproduced:
//  - --registered-rules: as registered for round 4 (b5cee6f; engine frozen
//    at 6cd041b), without the rules decided after its run: regions on both
//    sides the truth gives, kinds exactly, overflow by text, and a header/
//    footer truth disclosed only when one change of a comparison with
//    headers and footers included holds its texts. Its run: 104 / 104 / 175.
//  - --strict-snippets --strict-carets: the rules of the blind runs of
//    rounds 1–3 (round 3: 55 / 54 / 38; round 4 rescored: 88 / 87 / 191).
//    Either flag also implies --registered-rules: the later rules were
//    decided on top of the context rule and boundary carets, and a strict
//    flag is there to reproduce a recorded run.
// Expected pages are explicit (oldPage/newPage) or the single page whose body
// text contains the snippet; a snippet on no page or on several is an error.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
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
import {
  changeItem,
  changeLensMatch,
  disclosureUnder,
  expectedPages,
  furnitureDisclosure,
  furnitureRuns,
  recordCase,
  rescoreCase,
  score,
  textMatch,
  validate,
  type CaseMeta,
  type Item,
  type RecordedCase,
  type Rules,
  type Score,
  type Scored,
  type Truth,
} from './score.ts';

const root = new URL('.', import.meta.url).pathname;

// -------------------------------------------------------------- baselines --

function lineItems(a: DocModel, b: DocModel): Item[] {
  const la = a.lines.map((l) => l.text);
  const lb = b.lines.map((l) => l.text);
  const [ka, kb] = intern(la, lb);
  const ops = opsFromMatches(matchSequences(ka, kb), la.length, lb.length);
  const items: Item[] = [];
  let cur: Item | null = null;
  // The unchanged line next to a hunk, as a diff shows it (diff -U1).
  const lineAt = (i: number, j: number) => lb[j] ?? la[i] ?? '';
  for (const op of ops) {
    if (op.type === 'equal') {
      if (cur) items.push({ ...cur, shown: { ...cur.shown!, after: lineAt(op.a0, op.b0) } });
      cur = null;
      continue;
    }
    cur ??= { oldText: '', newText: '', oldPages: [], newPages: [], shown: { before: lineAt(op.a0 - 1, op.b0 - 1), old: '', new: '', after: '' } };
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
  return items.map((it) => ({ ...it, oldPages: [...new Set(it.oldPages)], newPages: [...new Set(it.newPages)], shown: { ...it.shown!, old: it.oldText, new: it.newText } }));
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

async function evalCase(id: string, before: string, after: string, truth: Truth[], rules: Rules) {
  const pa = await openPdf(before);
  const pb = await openPdf(after);
  const a = buildDocModel(await extractText(pa, 'a'));
  const b = buildDocModel(await extractText(pb, 'b'));

  // ChangeLens (text + visual).
  let t0 = performance.now();
  const r = compareDocs(a, b);
  await addVisualChanges(r, (p) => renderPage(pa, p, 1.5), (p) => renderPage(pb, p, 1.5));
  const clMs = performance.now() - t0;
  const items = r.changes.map((c) => (rules.boundaryCarets ? changeItem(c, a, b) : changeItem(c)));
  const cl = score(id, truth, items, a, b, (t, it) => changeLensMatch(t, it, rules), disclosureUnder(rules, r, a, b));
  // Recorded for both disclosure rules: the registered flags and the lines.
  if (recorded) recorded[id] = recordCase(id, truth, r.changes, a, b, furnitureDisclosure(r, a, b), furnitureRuns(r, a, b));

  // Text baseline.
  t0 = performance.now();
  const lines = lineItems(a, b);
  const textMs = performance.now() - t0;
  const tx = score(id, truth, lines, a, b, (t, it) => (t.type === 'graphic' || t.type === 'format' ? false : textMatch(t, it, rules.snippets)));

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
    'strict-snippets': { type: 'boolean' },
    'strict-carets': { type: 'boolean' },
    'registered-rules': { type: 'boolean' },
    items: { type: 'string' },
    rescore: { type: 'string' },
  },
});
// --items: also write the ChangeLens items of each case, so that this run can
// be scored again later (--rescore) under other rules, without the engine.
const recorded: Record<string, RecordedCase> | null = args.items ? {} : null;
const strictFlag = args['strict-snippets'] || args['strict-carets'];
const rules: Rules = { snippets: args['strict-snippets'] ? 'strict' : 'context', boundaryCarets: !args['strict-carets'], afterRound4: !args['registered-rules'] && !strictFlag };
const rulesLine =
  `Rules: snippets ${rules.snippets === 'strict' ? 'strict (--strict-snippets)' : 'with context (default)'}; ` +
  `carets ${rules.boundaryCarets ? 'at a page boundary count for both pages (default)' : 'count on their own page only (--strict-carets)'}; ` +
  `rules decided after round 4 (one-sided regions, part of a replace, overflow by region, header/footer lines) ${rules.afterRound4 ? 'on (default)' : args['registered-rules'] ? 'off (--registered-rules)' : 'off (implied by a strict flag)'}. ` +
  'Blind runs: rounds 1–3 used --strict-snippets --strict-carets, round 4 --registered-rules.';
const patterns = (s?: string) => (s ? s.split(',').map((p) => new RegExp('^' + p.trim().replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$')) : null);
const only = patterns(args.cases);
const skip = patterns(args.exclude);
const selected = (id: string) => (!only || only.some((re) => re.test(id))) && !skip?.some((re) => re.test(id));

const SETS: Record<string, string> = {
  tuning: 'Tuning set',
  'held-out-1': 'Held-out round 1 (since used for fixes)',
  'held-out-2': 'Held-out round 2 (since used for fixes)',
  'held-out-3': 'Held-out round 3 (since used for fixes)',
  'held-out-4': 'Held-out round 4 (since used for fixes)',
  extra: 'Extra pairs (demos, LibreOffice)',
  blind: 'Blind cases without a set (first run)',
};
const setLabel = (set: string) => SETS[set] ?? set;
// Only the selected cases' truth is read, so a case folder that is still
// being written does not stop the others; one that cannot be read is named.
const pairs: { id: string; before: string; after: string; read: () => CaseMeta }[] = [];
const casesDir = args.dir ?? join(root, 'cases');
const isDir = (p: string) => {
  try {
    return statSync(p).isDirectory(); // follows symlinks
  } catch {
    return false;
  }
};
for (const id of readdirSync(casesDir).filter((n) => isDir(join(casesDir, n))).sort()) {
  const dir = join(casesDir, id);
  pairs.push({ id, before: join(dir, 'before.pdf'), after: join(dir, 'after.pdf'), read: () => JSON.parse(readFileSync(join(dir, 'truth.json'), 'utf8')) });
}
// Further pairs (demo files, LibreOffice fixture) listed with their paths.
const extraCases = JSON.parse(readFileSync(join(root, 'extra-cases.json'), 'utf8')) as Record<string, CaseMeta & { before: string; after: string }>;
for (const [id, meta] of Object.entries(extraCases)) pairs.push({ id, before: join(root, '..', meta.before), after: join(root, '..', meta.after), read: () => ({ set: 'extra', ...meta }) });

type Result = Awaited<ReturnType<typeof evalCase>> & { description: string; set: string; blind: boolean };
const results: Record<string, Result> = {};
const skipped: Record<string, string> = {};
let blindSkipped = 0;
const todo: { id: string; before: string; after: string; meta: CaseMeta }[] = [];
for (const { id, before, after, read } of pairs) {
  if (!selected(id)) continue;
  let meta: CaseMeta;
  try {
    meta = read();
    if (meta.blind && !args.blind) {
      blindSkipped++;
      continue;
    }
    if (!Array.isArray(meta.truth)) throw new Error('no "truth" list');
    validate(id, meta.truth);
  } catch (e) {
    skipped[id] = (e as Error).message;
    continue;
  }
  todo.push({ id, before, after, meta });
}
if (args.rescore) {
  // Score the items of a recorded run (--items) again; ChangeLens only.
  const rec = JSON.parse(readFileSync(args.rescore, 'utf8')) as Record<string, RecordedCase>;
  const sum = { found: 0, located: 0, separate: 0, total: 0, extra: 0, items: 0 };
  let table = '| Case | Truth | ChangeLens found / located / extra (separate) |\n|---|---|---|\n';
  const lost: string[] = [];
  const perCase: Record<string, { changelens: Omit<Scored, 'misses'>; misses: Scored['misses'] }> = {};
  for (const { id, meta } of todo) {
    if (!rec[id]) continue;
    let sc: Scored;
    try {
      sc = rescoreCase(meta.truth, rec[id], rules);
    } catch (e) {
      console.error(`${id} in ${args.rescore}: ${(e as Error).message}.`);
      process.exit(1);
    }
    for (const k of Object.keys(sum) as (keyof typeof sum)[]) sum[k] += sc[k];
    table += `| ${id} | ${sc.total} | ${sc.found} / ${sc.located} / ${sc.extra} (${sc.separate}) |\n`;
    lost.push(...sc.misses.map((m) => `${id} #${m.truth} ${m.text}: ${m.why}`));
    const { misses, ...counts } = sc;
    perCase[id] = { changelens: counts, misses };
  }
  if (!todo.some((c) => rec[c.id])) {
    console.error(`No selected case is in ${args.rescore} (blind cases need --blind).`);
    process.exit(1);
  }
  table += `| **Total** | ${sum.total} | **${sum.found} / ${sum.located} / ${sum.extra} (${sum.separate})** |\n`;
  console.log(`Rescored the items recorded in ${args.rescore}.\n\n${table}\n${rulesLine}`);
  if (lost.length) console.log('ChangeLens misses:\n  ' + lost.join('\n  '));
  if (args.json) writeFileSync(args.json, JSON.stringify({ rules, results: perCase, totals: { changelens: sum } }, null, 2));
  process.exit(0);
}
if (!todo.length && !blindSkipped) {
  console.error(`No case to score${args.cases || args.exclude ? ` (--cases ${args.cases ?? '*'}${args.exclude ? `, --exclude ${args.exclude}` : ''})` : ''} in ${casesDir}.`);
  for (const [id, why] of Object.entries(skipped)) console.error(`  skipped ${id}: ${why}`);
  process.exit(1);
}
for (const { id, before, after, meta } of todo) {
  const set = meta.set ?? (meta.blind ? 'blind' : 'tuning');
  results[id] = { description: meta.description, set, blind: !!meta.blind, ...(await evalCase(id, before, after, meta.truth, rules)) };
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
const setRow = (label: string, rs: Result[], sum: Record<Tool, Score>) => `| ${label} | ${rs.length} | ${sum.changelens.total} | ${tools.map((t) => cell(sum[t])).join(' | ')} |\n`;
const setOrder = [...Object.keys(SETS), ...Object.keys(bySet).filter((s) => !SETS[s]).sort()];
for (const set of setOrder.filter((s) => bySet[s])) summary += setRow(setLabel(set), Object.values(results).filter((r) => r.set === set), bySet[set]);
// With --blind: the cases of the default selection on their own as well.
const open = Object.values(results).filter((r) => !r.blind);
if (open.length && open.length < Object.keys(results).length) {
  const sum = perTool();
  for (const r of open) for (const t of tools) add(sum[t], r[t]);
  summary += setRow('Not marked blind (the default selection)', open, sum);
}
summary += `| **All selected** | ${Object.keys(results).length} | ${totals.changelens.total} | ${tools.map((t) => `**${cell(totals[t])}**`).join(' | ')} |\n`;
console.log(summary);
console.log(rulesLine);
console.log('(separate) = truth items found as an item of their own (one-to-one).');
console.log('To read: ' + tools.map((t) => `${toolLabel[t]} ${totals[t].extra} extra ${unit[t]} (${totals[t].items} in total)`).join('; '));
console.log('Time (ms): ' + tools.map((t) => `${toolLabel[t]} ${totals[t].ms.toFixed(0)}`).join(', '));
if (blindSkipped) console.log(`${blindSkipped} blind case(s) not scored; add --blind for their single recorded run.`);
for (const [id, why] of Object.entries(skipped)) console.error(`Skipped ${id}: ${why}`);
const misses = Object.entries(results).flatMap(([id, r]) => r.misses.map((m) => `${id} #${m.truth} ${m.text}: ${m.why}`));
if (misses.length) console.log('ChangeLens misses:\n  ' + misses.join('\n  '));
if (args.json) writeFileSync(args.json, JSON.stringify({ rules, results, totals, sets: bySet, blindSkipped, skipped }, null, 2));
if (args.items) writeFileSync(args.items, JSON.stringify(recorded));
if (args.verbose) for (const [id, r] of Object.entries(results)) console.log(id, JSON.stringify(r.reported));
