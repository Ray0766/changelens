// Regression guard for the evaluation corpus (eval/cases + eval/extra-cases.json,
// blind cases excluded): every truth item must be found as an item of its own on
// the right page, with no extra items — except the known misses listed below.
// See docs/EVALUATION.md for what this does and does not prove.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { canRender } from '../src/node/render.ts';
import { compareDocs } from '../src/core/compare.ts';
import type { Change } from '../src/core/types.ts';
import { changeItem, changeLensMatch, expectedPages, furnitureDisclosure, score, textMatch, validate, type Item, type Truth } from '../eval/score.ts';
import { makeDoc, model } from './helpers.ts';

/**
 * Truth items ChangeLens gets wrong at this commit ("<case> #<truth item>"),
 * with the reason. Remove an entry when a fix makes it pass; the test fails
 * until the list matches, so it cannot silently go stale.
 */
const expectedMisses: Record<string, string> = {
  'small-graphics-second-box #1': 'A tick in the second checkbox is classified as a minor shift of lines or graphics (≤ 4 pt) and hidden; it is only counted in the notice.',
};
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

test('case selection: blind cases are skipped unless --blind; --cases and --exclude filter by id', { skip: !(await canRender()) && 'no canvas', timeout: 120_000 }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'cl-cases-'));
  const src = new URL('../eval/cases/identical/', import.meta.url).pathname;
  for (const [id, blind] of [['x-open', false], ['x-blind', true]] as const) {
    mkdirSync(join(dir, id));
    for (const f of ['before.pdf', 'after.pdf']) copyFileSync(join(src, f), join(dir, id, f));
    writeFileSync(join(dir, id, 'truth.json'), JSON.stringify({ description: id, set: 'tuning', blind, truth: [] }));
  }
  const outDir = mkdtempSync(join(tmpdir(), 'cl-results-'));
  const ids = (...extra: string[]) => {
    const out = join(outDir, `r${extra.length}.json`);
    const stdout = execFileSync(process.execPath, [new URL('../eval/run.ts', import.meta.url).pathname, '--dir', dir, '--cases', 'x-*', '--json', out, ...extra], { encoding: 'utf8' });
    return { ids: Object.keys(JSON.parse(readFileSync(out, 'utf8')).results), stdout };
  };
  const plain = ids();
  assert.deepEqual(plain.ids, ['x-open']);
  assert.match(plain.stdout, /1 blind case\(s\) not scored/);
  assert.deepEqual(ids('--blind').ids, ['x-blind', 'x-open']);
  assert.deepEqual(ids('--blind', '--exclude', 'x-open').ids, ['x-blind']);
});
