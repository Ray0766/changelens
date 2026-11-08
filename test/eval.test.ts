// Regression guard for the evaluation corpus (eval/cases + eval/extra-cases.json,
// blind cases excluded): every truth item must be found as an item of its own on
// the right page, with no extra items — except the known misses listed below.
// See docs/EVALUATION.md for what this does and does not prove.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { canRender } from '../src/node/render.ts';
import { compareDocs } from '../src/core/compare.ts';
import { kindLabel } from '../src/core/describe.ts';
import { t } from '../src/core/i18n.ts';
import type { Change } from '../src/core/types.ts';
import {
  CURRENT_RULES,
  REGISTERED_ROUND4_RULES,
  STRICT_RULES,
  caretPages,
  changeItem,
  changeLensMatch,
  coversInContext,
  disclosureUnder,
  expectedPages,
  furnitureDisclosure,
  furnitureLinesDisclosed,
  furnitureRuns,
  oneInsertion,
  rescoreCase,
  score,
  spansGap,
  textMatch,
  validate,
  type CaseMeta,
  type Item,
  type MatchRules,
  type RecordedCase,
  type Rules,
  type Truth,
} from '../eval/score.ts';
import { makeDoc, model } from './helpers.ts';

/**
 * Truth items ChangeLens gets wrong at this commit ("<case> #<truth item>"),
 * with the reason. Remove an entry when a fix makes it pass; the test fails
 * until the list matches, so it cannot silently go stale.
 */
const expectedMisses: Record<string, string> = {};
/** Extra (unexplained) items per case that come with the misses above. */
const expectedExtra: Record<string, number> = {};

interface CaseResult {
  changelens: { found: number; located: number; separate: number; total: number; extra: number };
  misses: { truth: number; text: string; why: string }[];
}

test('evaluation corpus: all truth found, located and separate, no noise (known misses listed)', { skip: !(await canRender()) && 'no canvas', timeout: 300_000 }, () => {
  const out = join(mkdtempSync(join(tmpdir(), 'cl-eval-')), 'results.json');
  execFileSync(process.execPath, [new URL('../eval/run.ts', import.meta.url).pathname, '--json', out], { stdio: 'pipe' });
  const { results } = JSON.parse(readFileSync(out, 'utf8')) as { results: Record<string, CaseResult> };
  const misses = Object.entries(results).flatMap(([id, r]) => r.misses.map((m) => [`${id} #${m.truth}`, `${m.text}: ${m.why}`] as const));
  const unexpected = misses.filter(([k]) => !(k in expectedMisses)).map(([k, v]) => `${k} ${v}`);
  const nowPassing = Object.keys(expectedMisses).filter((k) => !misses.some(([m]) => m === k));
  assert.deepEqual(unexpected, [], 'new misses');
  assert.deepEqual(nowPassing, [], 'listed as expected misses but now pass: remove them from expectedMisses');
  const extra = Object.entries(results)
    .filter(([id, r]) => r.changelens.extra !== (expectedExtra[id] ?? 0))
    .map(([id, r]) => `${id}: extra ${r.changelens.extra}, expected ${expectedExtra[id] ?? 0}`);
  assert.deepEqual(extra, []);
  // Every case of the corpus was scored (none skipped by an error or a filter).
  assert.ok(Object.keys(results).length >= 31, `${Object.keys(results).length} cases scored`);
});

// ------------------------------------------------------------ scoring rules --

// The first line of a page lies in the header band, so the text starts on the second.
const words = (p: number) => [[`Part ${p}`], [`Section ${p} covers the maintenance of the equipment listed in schedule ${p}.`, `The contractor keeps a written log of every visit on site ${p}.`]];
const pagesOf = (n: number) => Array.from({ length: n }, (_, i) => words(i + 1));
const side = (page: number | null, text = '', rect = { x: 56, y: 90, w: 300, h: 12 }) =>
  page === null ? { pages: [], rects: [], text } : { pages: [page - 1], rects: [{ page: page - 1, rect }], text };
let nextId = 0;
const change = (kind: Change['kind'], old: ReturnType<typeof side>, nu: ReturnType<typeof side>, extra: Partial<Change> = {}): Item =>
  changeItem({ id: `c${nextId++}`, kind, category: kind === 'graphic' || kind === 'format' ? 'visual' : 'text', old, new: nu, size: 1, cjk: false, contextBefore: '', contextAfter: '', order: 0, ...extra } as Change);

test('scoring: one item may cover several truth items (found), but counts once as a separate item', () => {
  const a = model(makeDoc('a', pagesOf(1)));
  const truth: Truth[] = [
    { type: 'replace', old: 'maintenance', new: 'servicing', oldPage: 1, newPage: 1 },
    { type: 'replace', old: 'written log', new: 'digital log', oldPage: 1, newPage: 1 },
  ];
  const hunk: Item = { oldText: 'covers the maintenance of … keeps a written log', newText: 'covers the servicing of … keeps a digital log', oldPages: [1], newPages: [1] };
  const s = score('t', truth, [hunk], a, a, textMatch);
  assert.deepEqual([s.found, s.located, s.separate, s.extra], [2, 2, 1, 0]);
  assert.deepEqual(s.misses.map((m) => m.why), ['not a separate item']);
});

test('scoring: a truth item explains at most maxItems items; textless items need their page and region', () => {
  const a = model(makeDoc('a', pagesOf(9)));
  const font: Truth = { type: 'format', oldPage: 1, newPage: 1, oldRect: [56, 55, 490, 520], newRect: [56, 55, 490, 520], maxItems: 1 };
  validate('t', [font]);
  // A font change reported once per page: one is the truth, eight are noise.
  const perPage = Array.from({ length: 9 }, (_, p) => change('format', side(p + 1, 'x'), side(p + 1, 'x'), { format: { fontFrom: 'Serif', fontTo: 'Sans' } }));
  let s = score('t', [font], perPage, a, a, changeLensMatch);
  assert.deepEqual([s.found, s.extra], [1, 8]);
  // A checkbox tick: a graphic change elsewhere on the same page does not count.
  const tick: Truth = { type: 'graphic', oldPage: 1, newPage: 1, newRect: [54, 160, 16, 16] };
  const rule = change('graphic', side(null), side(1, '', { x: 56, y: 208, w: 484, h: 8 }));
  s = score('t', [tick], [rule], a, a, changeLensMatch);
  assert.deepEqual([s.found, s.extra], [0, 1]);
  const ticked = change('graphic', side(null), side(1, '', { x: 56, y: 164, w: 12, h: 8 }));
  s = score('t', [tick], [ticked], a, a, changeLensMatch);
  assert.deepEqual([s.found, s.located, s.extra], [1, 1, 0]);
  // On the wrong page it is not found at all.
  s = score('t', [tick], [change('graphic', side(null), side(2, '', { x: 56, y: 164, w: 12, h: 8 }))], a, a, changeLensMatch);
  assert.equal(s.found, 0);
  assert.throws(() => validate('t', [{ type: 'graphic', oldPage: 1, newPage: 1 }]), /needs a region/);
  assert.throws(() => validate('t', [{ type: 'format', oldPage: 1, newPage: 1, many: true } as Truth]), /maxItems/);
});

test('scoring: insert, delete and replace must be reported as such; empty snippets are rejected', () => {
  const a = model(makeDoc('a', pagesOf(2)));
  const del: Truth = { type: 'delete', old: 'written log of every visit on site 1' };
  const moved = change('move', side(1, 'The contractor keeps a written log of every visit on site 1.'), side(2, 'The contractor keeps a written log of every visit on site 1.'));
  assert.equal(score('t', [del], [moved], a, a, changeLensMatch).found, 0);
  const deleted = change('delete', side(1, 'The contractor keeps a written log of every visit on site 1.'), side(null));
  assert.equal(score('t', [del], [deleted], a, a, changeLensMatch).found, 1);
  assert.throws(() => validate('t', [{ type: 'replace', old: '两个', new: '' }]), /empty text/);
  assert.throws(() => validate('t', [{ type: 'insert', old: 'a', new: 'b' }]), /new text only/);
});

test('scoring: expected pages must be explicit when the text is on no page or on several', () => {
  const a = model(makeDoc('a', pagesOf(3)));
  assert.throws(() => expectedPages('t', { type: 'replace', old: 'contractor', new: 'supplier' }, a, a), /pages 1, 2, 3 of the old file/);
  assert.throws(() => expectedPages('t', { type: 'insert', new: 'not in the document' }, a, a), /no page/);
  assert.deepEqual(expectedPages('t', { type: 'replace', old: 'contractor', new: 'schedule 2', oldPage: 2 }, a, a), { old: [2], new: [2] });
});

test('scoring: a header truth counts as disclosed only when the ignored differences contain its text', () => {
  const head = (s: string) => ({ header: () => `Maintenance Agreement ${s}`, footer: (p: number, n: number) => `Page ${p} of ${n}` });
  const t: Truth = { type: 'furniture', old: 'DRAFT', new: 'FINAL' };
  let a = model(makeDoc('a', pagesOf(3), head('DRAFT')));
  let b = model(makeDoc('b', pagesOf(3), head('FINAL')));
  let r = compareDocs(a, b);
  assert.equal(r.changes.length, 0);
  assert.deepEqual(score('t', [t], [], a, b, changeLensMatch, furnitureDisclosure(r, a, b)).found, 1);
  // Only the page count in the footer differs: ignored differences exist, but not this one.
  a = model(makeDoc('a', pagesOf(3), head('DRAFT')));
  b = model(makeDoc('b', [...pagesOf(3), words(9)], head('DRAFT')));
  r = compareDocs(a, b);
  assert.ok(r.ignored.furniture > 0);
  assert.equal(score('t', [t], [], a, b, changeLensMatch, furnitureDisclosure(r, a, b)).found, 0);
  // Reported as changes: once is the truth, a repeat on every page is noise, and
  // an item already explained by a body truth is not subtracted twice.
  const header = (p: number) => change('replace', side(p, 'DRAFT'), side(p, 'FINAL'));
  const s = score('t', [t], [1, 2, 3].map(header), a, a, changeLensMatch);
  assert.deepEqual([s.found, s.extra], [1, 2]);
  const body: Truth = { type: 'replace', old: 'Status: DRAFT', new: 'Status: FINAL', oldPage: 1, newPage: 1 };
  const items = [change('replace', side(1, 'Status: DRAFT'), side(1, 'Status: FINAL')), change('insert', side(null), side(1, 'noise'))];
  assert.equal(score('t', [body, t], items, a, a, changeLensMatch).extra, 1);
});

test('case selection: blind cases are skipped unless --blind; --cases and --exclude filter by id', { skip: !(await canRender()) && 'no canvas', timeout: 180_000 }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'cl-cases-'));
  const src = new URL('../eval/cases/identical/', import.meta.url).pathname;
  const caseDir = (id: string, meta?: object | string) => {
    mkdirSync(join(dir, id));
    for (const f of ['before.pdf', 'after.pdf']) copyFileSync(join(src, f), join(dir, id, f));
    if (meta !== undefined) writeFileSync(join(dir, id, 'truth.json'), typeof meta === 'string' ? meta : JSON.stringify(meta));
  };
  caseDir('x-open', { description: 'x-open', set: 'tuning', truth: [] });
  caseDir('x-blind', { description: 'x-blind', blind: true, truth: [] }); // a blind case without a set
  caseDir('x-new', { description: 'x-new', set: 'held-out-9', blind: true, truth: [] }); // a set run.ts does not know
  caseDir('x-wip'); // still being written: no truth.json yet
  caseDir('x-cut', '{"description": "x-cut", "truth": ['); // half written
  symlinkSync(join(dir, 'x-open'), join(dir, 'x-link')); // a case folder linked in
  const outDir = mkdtempSync(join(tmpdir(), 'cl-results-'));
  let n = 0;
  const ids = (...extra: string[]) => {
    const out = join(outDir, `r${n++}.json`);
    const r = spawnSync(process.execPath, [new URL('../eval/run.ts', import.meta.url).pathname, '--dir', dir, '--json', out, ...extra], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    const j = JSON.parse(readFileSync(out, 'utf8'));
    return { ids: Object.keys(j.results), sets: Object.fromEntries(Object.entries(j.results).map(([id, v]) => [id, (v as { set: string }).set])), skipped: j.skipped, stdout: r.stdout, stderr: r.stderr };
  };
  // A folder still being written does not stop the others, and is named.
  const plain = ids('--cases', 'x-*');
  assert.deepEqual(plain.ids, ['x-link', 'x-open']);
  assert.match(plain.stdout, /2 blind case\(s\) not scored/);
  assert.deepEqual(Object.keys(plain.skipped), ['x-cut', 'x-wip']);
  assert.match(plain.stderr, /Skipped x-wip: ENOENT/);
  assert.match(plain.stderr, /Skipped x-cut: .*JSON/);
  // Excluded or not selected: their truth is not even read.
  assert.deepEqual(ids('--cases', 'x-open,x-link,x-wip', '--exclude', 'x-wip').skipped, {});
  // --blind: a blind case without a set is not summed into the tuning set, a
  // new set name is reported as it is, and the default selection is summed too.
  const blind = ids('--cases', 'x-open,x-blind,x-new', '--blind');
  assert.deepEqual(blind.ids, ['x-blind', 'x-new', 'x-open']);
  assert.deepEqual(blind.sets, { 'x-blind': 'blind', 'x-new': 'held-out-9', 'x-open': 'tuning' });
  assert.match(blind.stdout, /\| Blind cases without a set \(first run\) \| 1 \|/);
  assert.match(blind.stdout, /\| held-out-9 \| 1 \|/);
  assert.match(blind.stdout, /\| Not marked blind \(the default selection\) \| 1 \|/);
  assert.deepEqual(ids('--cases', 'x-blind,x-open', '--blind', '--exclude', 'x-open').ids, ['x-blind']);
  // A selection that matches nothing is an error, not an empty table.
  const none = spawnSync(process.execPath, [new URL('../eval/run.ts', import.meta.url).pathname, '--dir', dir, '--cases', 'x-opne'], { encoding: 'utf8' });
  assert.equal(none.status, 1);
  assert.match(none.stderr, /No case to score/);
});

// ------------------------------------------------- rules decided in round 3 --

const snippetItem = (kind: Change['kind'], before: string, old: string, nu: string, after: string, extra: Partial<Change> = {}): Item =>
  change(kind, old ? side(1, old) : side(null), nu ? side(1, nu) : side(null), { contextBefore: before, contextAfter: after, ...extra });

test('context rule: a change narrower than the truth snippet counts when the excerpt shows the rest around it', () => {
  const a = model(makeDoc('a', pagesOf(1)));
  const vote: Truth = { type: 'number', old: 'For 7', new: 'For 6', oldPage: 1, newPage: 1 };
  const num = { numeric: { from: '7', to: '6', fromValue: 7, toValue: 6 } } as Partial<Change>;
  const seven = snippetItem('replace', 'Resolution 1: For', '7', '6', 'Against 0 Abstain 2', num);
  assert.equal(score('t', [vote], [seven], a, a, changeLensMatch).found, 1);
  // The rule of the recorded blind runs: the reported text must contain the snippet.
  assert.equal(score('t', [vote], [seven], a, a, (t, it) => changeLensMatch(t, it, STRICT_RULES)).found, 0);
  // The snippet is found only in the context, next to another change (the
  // second 7 → 6 of "For 7 Against 7"): it does not count.
  const against = snippetItem('replace', 'Resolution 1: For 6 Against', '7', '6', 'Abstain 0', num);
  assert.equal(score('t', [vote], [against], a, a, changeLensMatch).found, 0);
  // Every side the truth has must match: here the new side does, the old one does not.
  const other = snippetItem('replace', 'Resolution 1: For', '5', '6', 'Against 0', num);
  assert.equal(score('t', [vote], [other], a, a, changeLensMatch).found, 0);
  // Chinese text has no space between the context and the change; a closing bracket neither.
  const days: Truth = { type: 'number', old: '30个日历日', new: '45个日历日', oldPage: 1, newPage: 1 };
  assert.equal(score('t', [days], [snippetItem('replace', '交货期为签约后', '30', '45', '个日历日内', num)], a, a, changeLensMatch).found, 1);
  const terms: Truth = { type: 'replace', old: 'DAP (Delivered at Place)', new: 'FCA (Free Carrier)', oldPage: 1, newPage: 1 };
  assert.equal(score('t', [terms], [snippetItem('replace', 'Incoterm:', 'DAP (Delivered at Place', 'FCA (Free Carrier', ') Rotterdam')], a, a, changeLensMatch).found, 1);
  // A reported text longer than the snippet on one side and shorter on the other: no.
  assert.equal(coversInContext('For 7', 'For', '7 Against 0', ''), false);
  // An empty reported side never lies "inside" a snippet.
  assert.equal(coversInContext('For 7', 'For 7', '', ''), false);
  // A move shows no context in the report, so it gets none here either.
  const moved = snippetItem('move', 'Resolution 1:', 'For 7', 'For 7', '');
  assert.equal(score('t', [{ type: 'move', old: 'Resolution 1: For 7', new: 'Resolution 1: For 7', oldPage: 1, newPage: 1 }], [moved], a, a, changeLensMatch).found, 0);
  // The text baseline gets the same rule with the lines next to its hunk.
  const hunk: Item = { oldText: ' 7', newText: ' 6', oldPages: [1], newPages: [1], shown: { before: 'For', old: ' 7', new: ' 6', after: 'Against 0' } };
  assert.equal(textMatch(vote, hunk, 'context'), true);
  assert.equal(textMatch(vote, hunk), false);
});

test('format truth: whatever the UI labels Format counts, including a strikethrough found visually', () => {
  const a = model(makeDoc('a', pagesOf(1)));
  const truth: Truth = { type: 'format', old: 'written log', new: 'written log', oldPage: 1, newPage: 1 };
  const struck = change('graphic', side(1, 'written log'), side(1, 'written log'), { format: { appearanceChanged: true, decoration: { line: 'strike', added: true } } });
  assert.equal(kindLabel('en', struck.change!), t('en', 'kind_format'));
  assert.equal(score('t', [truth], [struck], a, a, changeLensMatch).found, 1);
  const bold = change('format', side(1, 'written log'), side(1, 'written log'), { format: { boldAdded: true } });
  assert.equal(score('t', [truth], [bold], a, a, changeLensMatch).found, 1);
  // A graphic labelled Graphic does not.
  const drawn = change('graphic', side(1, 'written log'), side(1, 'written log'));
  assert.equal(kindLabel('en', drawn.change!), t('en', 'kind_graphic'));
  assert.equal(score('t', [truth], [drawn], a, a, changeLensMatch).found, 0);
});

test('a caret right before the first text of a page also stands for the end of the previous page', () => {
  const doc = model(makeDoc('a', pagesOf(3)));
  const body = (p: number) => doc.tokens.filter((tk) => tk.page === p && !tk.furniture);
  const first = body(2)[0].rects[0];
  const last = body(0).at(-1)!.rects.at(-1)!;
  assert.deepEqual(caretPages({ page: 2, x: first.x, y: first.y, h: first.h }, doc), [1, 2]);
  assert.deepEqual(caretPages({ page: 0, x: last.x + last.w, y: last.y, h: last.h }, doc), [0, 1]);
  // Anywhere else on the page: that page only.
  const mid = body(2)[3].rects[0];
  assert.deepEqual(caretPages({ page: 2, x: mid.x, y: mid.y, h: mid.h }, doc), [2]);
  // A whole page pasted in between old p. 2 and p. 3, shown before old p. 3.
  const pasted = {
    id: 'c',
    kind: 'insert',
    category: 'text',
    old: { pages: [2], rects: [], text: '', caret: { page: 2, x: first.x, y: first.y, h: first.h } },
    new: { pages: [2], rects: [{ page: 2, rect: first }], text: 'Section 9 covers the maintenance' },
    size: 5,
    cjk: false,
    contextBefore: '',
    contextAfter: '',
    order: 0,
  } as Change;
  const truth: Truth = { type: 'insert', new: 'Section 9 covers the maintenance', oldPage: 2, newPage: 3 };
  assert.equal(score('t', [truth], [changeItem(pasted, doc, doc)], doc, doc, changeLensMatch).located, 1);
  // The rule of the recorded blind runs (--strict-carets): its own page only.
  assert.equal(score('t', [truth], [changeItem(pasted)], doc, doc, changeLensMatch).located, 0);
});

test('recorded blind run of round 3: the strict rules reproduce it exactly; the rules decided after it are scored apart', () => {
  // The ChangeLens items of that run (run.ts --items at the engine of 622d2db),
  // so that this holds whatever the engine does later.
  const rec = JSON.parse(readFileSync(new URL('./fixtures/holdout3-recorded-items.json', import.meta.url), 'utf8')) as Record<string, RecordedCase>;
  const asRun = JSON.parse(readFileSync(new URL('../eval/results-holdout3-blind.json', import.meta.url), 'utf8')) as { results: Record<string, { changelens: Record<string, number> }> };
  assert.deepEqual(Object.keys(rec).sort(), Object.keys(asRun.results).sort());
  const truth = (id: string) => (JSON.parse(readFileSync(new URL(`../eval/cases/${id}/truth.json`, import.meta.url), 'utf8')) as CaseMeta).truth;
  const keys = ['found', 'located', 'separate', 'total', 'extra', 'items'] as const;
  const totals = (snippets: 'strict' | 'context', boundaryCarets: boolean, afterRound4 = false) => {
    const sum = Object.fromEntries(keys.map((k) => [k, 0])) as Record<(typeof keys)[number], number>;
    for (const id of Object.keys(rec)) {
      const s = rescoreCase(truth(id), rec[id], { snippets, boundaryCarets, afterRound4 });
      if (snippets === 'strict' && !boundaryCarets && !afterRound4) assert.deepEqual(Object.fromEntries(keys.map((k) => [k, s[k]])), Object.fromEntries(keys.map((k) => [k, asRun.results[id].changelens[k]])), id);
      for (const k of keys) sum[k] += s[k];
    }
    return [sum.found, sum.located, sum.extra, sum.separate];
  };
  // As recorded (eval/results-holdout3-blind.txt): 55 / 54 / 38 (55).
  assert.deepEqual(totals('strict', false), [55, 54, 38, 55]);
  // Decided after seeing that run, so reported separately.
  assert.deepEqual(totals('context', false), [68, 67, 25, 68]);
  assert.deepEqual(totals('strict', true), [55, 55, 38, 55]);
  assert.deepEqual(totals('context', true), [68, 68, 25, 68]);
  // The rules decided after round 4 change nothing in round 3. Its recording
  // holds the header/footer lines they need, computed afterwards with the
  // engine of that run (622d2db): the three header/footer items it disclosed
  // under the registered rule are disclosed by their lines too.
  assert.deepEqual(totals('context', true, true), [68, 68, 25, 68]);
  const byHunk = Object.entries(rec).flatMap(([id, c]) => c.disclosed.flatMap((d, k) => (d ? [`${id} #${k + 1}`] : [])));
  const byLines = Object.entries(rec).flatMap(([id, c]) => truth(id).flatMap((t, k) => (furnitureLinesDisclosed(t, c.exp[k], c.furniture!) ? [`${id} #${k + 1}`] : [])));
  assert.deepEqual(byHunk, ['holdout3-c-en-interim-financials #1', 'holdout3-c-en-supply-agreement-move #1', 'holdout3-c-zh-purchase-contract-reflow #1']);
  assert.deepEqual(byLines, byHunk);
});

// ------------------------------------------------- rules decided in round 4 --
// Decided after the blind run of round 4 (eval/results-holdout4-analysis.md,
// the items classified scorer-or-truth), so they are off in the registered
// rules (--registered-rules) and in the strict rules of the earlier runs.

const under = (rules: MatchRules) => (t: Truth, it: Item) => changeLensMatch(t, it, rules);

test('one-sided regions: an added stamp or tick, or a deletion, is matched by the side it has', () => {
  const a = model(makeDoc('a', pagesOf(2)));
  // The truth author gives the same rect on both sides for "added here".
  const stamp: Truth = { type: 'graphic', oldPage: 1, newPage: 1, oldRect: [417.3, 22, 138, 42], newRect: [417.3, 22, 138, 42] };
  const added = change('graphic', side(null), side(1, '', { x: 416, y: 20, w: 140, h: 44 }));
  let s = score('t', [stamp], [added], a, a, under(CURRENT_RULES));
  assert.deepEqual([s.found, s.located, s.extra], [1, 1, 0]);
  // As registered for round 4: a rect is needed on every side the truth gives one.
  s = score('t', [stamp], [added], a, a, under(REGISTERED_ROUND4_RULES));
  assert.deepEqual([s.found, s.extra], [0, 1]);
  // A removed graphic likewise.
  const removed = change('graphic', side(1, '', { x: 416, y: 20, w: 140, h: 44 }), side(null));
  assert.equal(score('t', [stamp], [removed], a, a, under(CURRENT_RULES)).found, 1);
  // The side it has must overlap the truth's rect on that side.
  const elsewhere = change('graphic', side(null), side(1, '', { x: 56, y: 400, w: 40, h: 40 }));
  assert.equal(score('t', [stamp], [elsewhere], a, a, under(CURRENT_RULES)).found, 0);
  // A change with rects on both sides must still overlap on both.
  const both = change('graphic', side(1, '', { x: 56, y: 400, w: 40, h: 40 }), side(1, '', { x: 416, y: 20, w: 140, h: 44 }));
  assert.equal(score('t', [stamp], [both], a, a, under(CURRENT_RULES)).found, 0);
  // A truth with a rect on one side only needs a rect on that side.
  const onlyNew: Truth = { type: 'graphic', oldPage: 1, newPage: 1, newRect: [417.3, 22, 138, 42] };
  assert.equal(score('t', [onlyNew], [removed], a, a, under(CURRENT_RULES)).found, 0);
  // A deleted watermark: the new side of a deletion is a caret, without a rect.
  const watermark: Truth = { type: 'delete', old: 'DRAFT', oldPage: 1, newPage: 1, oldRect: [103.5, 221.5, 373.5, 395.5], newRect: [103.5, 221.5, 373.5, 395.5] };
  const body = a.tokens.filter((tk) => tk.page === 1 && !tk.furniture)[0].rects[0];
  const deleted = change('delete', side(1, 'DRAFT', { x: 75.5, y: 199, w: 446, h: 446 }), { pages: [1], rects: [], text: '', caret: { page: 1, x: body.x, y: body.y, h: body.h } } as ReturnType<typeof side>);
  assert.equal(score('t', [watermark], [deleted], a, a, under(CURRENT_RULES)).found, 1);
  assert.equal(score('t', [watermark], [deleted], a, a, under(REGISTERED_ROUND4_RULES)).found, 0);
});

test('part of a replace: 每年 → 每半年 is met by "Added 半" where the context shows both texts', () => {
  const a = model(makeDoc('a', pagesOf(1)));
  const often: Truth = { type: 'replace', old: '每年', new: '每半年', oldPage: 1, newPage: 1 };
  const half = snippetItem('insert', '全設備依法每', '', '半', '年辦理一次檢');
  let s = score('t', [often], [half], a, a, under(CURRENT_RULES));
  assert.deepEqual([s.found, s.located, s.separate, s.extra], [1, 1, 1, 0]);
  assert.equal(score('t', [often], [half], a, a, under(REGISTERED_ROUND4_RULES)).found, 0);
  // It reads the context, so the strict snippet rule does not have it.
  assert.equal(score('t', [often], [half], a, a, under({ snippets: 'strict', afterRound4: true })).found, 0);
  // The same insertion at another place: the context does not show the old text.
  assert.equal(score('t', [often], [snippetItem('insert', '本會每', '', '半', '月召開')], a, a, under(CURRENT_RULES)).found, 0);
  // An insertion that also replaced some of the old text: the context alone does not show it.
  assert.equal(score('t', [often], [snippetItem('insert', '全設備依法', '', '每半', '年辦理')], a, a, under(CURRENT_RULES)).found, 0);
  // English, with spaces between the context and the insertion.
  const english: Truth = { type: 'replace', old: 'every year', new: 'every half year', oldPage: 1, newPage: 1 };
  assert.equal(score('t', [english], [snippetItem('insert', 'The lifts are inspected every', '', 'half', 'year by the')], a, a, under(CURRENT_RULES)).found, 1);
  // A deletion meets a replace whose old text is its new text with something inserted.
  const less: Truth = { type: 'replace', old: '每半年', new: '每年', oldPage: 1, newPage: 1 };
  assert.equal(score('t', [less], [snippetItem('delete', '全設備依法每', '半', '', '年辦理一次檢')], a, a, under(CURRENT_RULES)).found, 1);
  // …but not one whose new text is longer, and an insertion does not meet that one.
  assert.equal(score('t', [often], [snippetItem('delete', '全設備依法每', '半', '', '年辦理一次檢')], a, a, under(CURRENT_RULES)).found, 0);
  assert.equal(score('t', [less], [half], a, a, under(CURRENT_RULES)).found, 0);
  // A replace of one word by another is not "something inserted".
  const city: Truth = { type: 'replace', old: 'Hamburg', new: 'Bremen', oldPage: 1, newPage: 1 };
  assert.equal(score('t', [city], [snippetItem('insert', 'delivered to', '', 'Bremen', 'Hamburg')], a, a, under(CURRENT_RULES)).found, 0);
  assert.deepEqual([oneInsertion('每年', '每半年'), oneInsertion('年', '半年'), oneInsertion('每年', '每年'), oneInsertion('Hamburg', 'Bremen')], [true, true, false, false]);
  assert.deepEqual([spansGap('每年', '依法每', '年辦理'), spansGap('每年', '依法', '每年'), spansGap('每年', '每年依法', '辦理'), spansGap('每年', '', '')], [true, true, false, false]);
});

test('overflow by region: content cut off at a page edge is matched by place, not by the text it lost', () => {
  const a = model(makeDoc('a', pagesOf(1)));
  // "Budget (EUR)" in the truth; the cut version's text layer holds only "Budget (EU".
  const cut: Truth = { type: 'overflow', old: 'Budget (EUR)', new: 'Budget (EUR)', oldPage: 1, newPage: 1, maxItems: 5, oldRect: [511, 142.9, 58.1, 75], newRect: [511, 142.9, 44.3, 75] };
  const edge = change('overflow', side(null), side(1, 'EU 4,8 2,3 6,9 3,1', { x: 544.9, y: 144.4, w: 10.4, h: 71.6 }));
  let s = score('t', [cut], [edge], a, a, under(CURRENT_RULES));
  assert.deepEqual([s.found, s.located, s.extra], [1, 1, 0]);
  assert.equal(score('t', [cut], [edge], a, a, under(REGISTERED_ROUND4_RULES)).found, 0);
  // Outside the region, or not an overflow, it is not.
  assert.equal(score('t', [cut], [change('overflow', side(null), side(1, 'EU', { x: 56, y: 600, w: 10, h: 10 }))], a, a, under(CURRENT_RULES)).found, 0);
  assert.equal(score('t', [cut], [change('replace', side(1, 'EUR)', { x: 540, y: 144.4, w: 20, h: 10 }), side(1, 'EU', { x: 540, y: 144.4, w: 15, h: 10 }))], a, a, under(CURRENT_RULES)).found, 0);
  // Without a region the text is still compared.
  const noRegion: Truth = { type: 'overflow', old: 'Budget (EUR)', new: 'Budget (EUR)', oldPage: 1, newPage: 1 };
  s = score('t', [noRegion], [edge], a, a, under(CURRENT_RULES));
  assert.equal(s.found, 0);
});

test('header/footer lines: a footer edit split into hunks at an unchanged "·" is disclosed; text outside the differing lines is not', () => {
  const head = (status: string, page = (_p: number) => status) => ({ header: (p: number) => `${page(p)} · Synthetic sample · Page ${p}` });
  const v31 = 'Version 3.1 · Approved 14 May 2025';
  const v32 = 'Version 3.2 · Draft with tracked changes · 12 October 2026';
  const t: Truth = { type: 'furniture', old: v31, new: v32, oldPage: 1, newPage: 1, maxItems: 3 };
  const a = model(makeDoc('a', pagesOf(3), head(v31)));
  const b = model(makeDoc('b', pagesOf(3), head(v32)));
  const r = compareDocs(a, b);
  assert.deepEqual([r.changes.length, r.ignored.furniture], [0, 3]);
  // The lines are those the notice counts.
  const runs = furnitureRuns(r, a, b);
  assert.equal(runs.reduce((n, run) => n + Math.max(run.old.length, run.new.length), 0), r.ignored.furniture);
  const found = (truth: Truth, rules: Rules, x = a, y = b, res = r) => score('t', [truth], [], x, y, under(rules), disclosureUnder(rules, res, x, y)).found;
  assert.equal(found(t, CURRENT_RULES), 1);
  // As registered for round 4: no one hunk of the comparison with headers and footers holds the text.
  const hunks = compareDocs(a, b, { ...r.options, ignoreFurniture: false }).changes;
  assert.ok(hunks.length >= 2 && !hunks.some((c) => textMatch(t, changeItem(c))));
  assert.equal(found(t, REGISTERED_ROUND4_RULES), 0);
  // Still strict: the old text must lie in a line that differs, on its pages…
  assert.equal(found({ type: 'furniture', old: 'Synthetic sample', new: 'Draft with tracked changes', oldPage: 1, newPage: 1 }, CURRENT_RULES), 1);
  assert.equal(found({ type: 'furniture', old: 'Version 3.1', new: 'Version 3.0', oldPage: 1, newPage: 1 }, CURRENT_RULES), 0);
  // …and not when only the page count of a header differs, although both texts are in both lines.
  const pageCount = (p: number, n: number) => `${v31} · Page ${p} of ${n}`;
  const a2 = model(makeDoc('a', pagesOf(3), { header: pageCount }));
  const b2 = model(makeDoc('b', [...pagesOf(3), words(9)], { header: pageCount }));
  const r2 = compareDocs(a2, b2);
  assert.ok(r2.ignored.furniture > 0);
  assert.equal(found({ type: 'furniture', old: 'Approved 14 May 2025', new: 'Approved 14 May 2025 ·', oldPage: 1, newPage: 1 }, CURRENT_RULES, a2, b2, r2), 0);
  // Changed from page 3 on: a truth on page 1 is not disclosed, one on page 3 is.
  const a4 = model(makeDoc('a', pagesOf(4), head(v31)));
  const b4 = model(makeDoc('b', pagesOf(4), head(v31, (p) => (p >= 3 ? v32 : v31))));
  const r4 = compareDocs(a4, b4);
  assert.deepEqual([r4.changes.length, r4.ignored.furniture], [0, 2]);
  assert.equal(found(t, CURRENT_RULES, a4, b4, r4), 0);
  assert.equal(found({ ...t, oldPage: 3, newPage: 3 }, CURRENT_RULES, a4, b4, r4), 1);
});

test('recorded blind run of round 4: the registered rules reproduce it exactly, the strict rules its strict rescore; the later rules are scored apart', () => {
  // The fixture is the recorded items (eval/results-holdout4-blind-items.json)
  // with the header/footer lines that differ, computed afterwards with the
  // engine of that run (src unchanged since 6cd041b at the time).
  const rec = JSON.parse(readFileSync(new URL('./fixtures/holdout4-recorded-items.json', import.meta.url), 'utf8')) as Record<string, RecordedCase>;
  const official = JSON.parse(readFileSync(new URL('../eval/results-holdout4-blind-items.json', import.meta.url), 'utf8')) as Record<string, RecordedCase>;
  assert.deepEqual(Object.keys(rec), Object.keys(official));
  for (const [id, { furniture, ...rest }] of Object.entries(rec)) {
    assert.deepEqual(rest, official[id], id);
    assert.ok(Array.isArray(furniture), id);
  }
  const asRun = JSON.parse(readFileSync(new URL('../eval/results-holdout4-blind.json', import.meta.url), 'utf8')) as { results: Record<string, { changelens: Record<string, number> }> };
  // The strict rescore as recorded: | case | truth | found / located / extra (separate) |
  const strictTxt = readFileSync(new URL('../eval/results-holdout4-blind-strict.txt', import.meta.url), 'utf8');
  const asStrict = Object.fromEntries([...strictTxt.matchAll(/^\| (holdout4-\S+) \| (\d+) \| (\d+) \/ (\d+) \/ (\d+) \((\d+)\) \|$/gm)].map((m) => [m[1], [3, 4, 5, 6].map((i) => Number(m[i]))]));
  assert.equal(Object.keys(asStrict).length, Object.keys(rec).length);
  const truth = (id: string) => (JSON.parse(readFileSync(new URL(`../eval/cases/${id}/truth.json`, import.meta.url), 'utf8')) as CaseMeta).truth;
  const keys = ['found', 'located', 'separate', 'total', 'extra', 'items'] as const;
  const totals = (rules: Rules) => {
    const sum = [0, 0, 0, 0];
    for (const id of Object.keys(rec)) {
      const s = rescoreCase(truth(id), rec[id], rules);
      if (rules === REGISTERED_ROUND4_RULES) assert.deepEqual(Object.fromEntries(keys.map((k) => [k, s[k]])), Object.fromEntries(keys.map((k) => [k, asRun.results[id].changelens[k]])), id);
      if (rules === STRICT_RULES) assert.deepEqual([s.found, s.located, s.extra, s.separate], asStrict[id], id);
      [s.found, s.located, s.extra, s.separate].forEach((v, i) => (sum[i] += v));
    }
    return sum;
  };
  // As recorded (eval/results-holdout4-blind.txt and -strict.txt).
  assert.deepEqual(totals(REGISTERED_ROUND4_RULES), [104, 104, 175, 104]);
  assert.deepEqual(totals(STRICT_RULES), [88, 87, 191, 88]);
  // Decided after that run: 10 of the 11 misses and 7 of the 13 extra items
  // classified scorer-or-truth are credited; the engine is the same.
  assert.deepEqual(totals(CURRENT_RULES), [114, 114, 168, 114]);
  // The recording without the header/footer lines is not scored with the later rules.
  const id = 'holdout4-e-docx-retention-redline';
  assert.throws(() => rescoreCase(truth(id), official[id], CURRENT_RULES), /header\/footer lines/);
  assert.equal(rescoreCase(truth(id), official[id], REGISTERED_ROUND4_RULES).found, 6);
});

test('run.ts --rescore: --registered-rules and the strict flags reproduce the recorded round 4, the default applies the later rules', () => {
  const run = (...args: string[]) => spawnSync(process.execPath, [new URL('../eval/run.ts', import.meta.url).pathname, '--cases', 'holdout4-*', '--blind', '--rescore', ...args], { encoding: 'utf8' });
  const total = (out: string) => /\| \*\*Total\*\* \| 119 \| \*\*(.+?)\*\* \|/.exec(out)?.[1];
  const fixture = new URL('./fixtures/holdout4-recorded-items.json', import.meta.url).pathname;
  const official = new URL('../eval/results-holdout4-blind-items.json', import.meta.url).pathname;
  assert.equal(total(run(fixture).stdout), '114 / 114 / 168 (114)');
  assert.equal(total(run(fixture, '--registered-rules').stdout), '104 / 104 / 175 (104)');
  assert.equal(total(run(fixture, '--strict-snippets', '--strict-carets').stdout), '88 / 87 / 191 (88)');
  assert.equal(total(run(official, '--registered-rules').stdout), '104 / 104 / 175 (104)');
  const refused = run(official);
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /holdout4-e-docx-retention-redline .*header\/footer lines/);
  assert.match(run(fixture, '--strict-carets').stdout, /rules decided after round 4 .* off \(implied by a strict flag\)/);
});
