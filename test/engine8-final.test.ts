// Fix round 8, final pass: the JSON export and the CLI help name every
// kind of coverage gap that the notices name (id F3); a word deleted after a
// figure re-set shorter at a new page edge is not taken for cut (T-V1).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { compareDocs } from '../src/core/compare.ts';
import { buildJson } from '../src/core/report.ts';
import { describeChange } from '../src/core/describe.ts';
import { openPdf } from '../src/node/pdf.ts';
import { extractText } from '../src/pdf/extract.ts';
import { buildDocModel } from '../src/core/tokenize.ts';
import { makeDoc, model } from './helpers.ts';

const P = [['Applicant name and department are filled in below.', 'The form is returned to the office by the end of the month.']];

test('F3: the JSON coverage lists words compared only in part and form fields not read as text, with 1-based pages', () => {
  const a = model(makeDoc('a', [P, P]));
  const b = model(makeDoc('b', [P, P]));
  b.pages[1].fieldsUnread = 2;
  const r = compareDocs(a, b);
  // As the visual stage records it (see partlyCompared in visual.ts).
  r.coverage.new.partlyCompared = [{ page: 1, count: 4, words: ['Applicant', 'name', 'and'] }];
  const j = buildJson({ result: r, lang: 'en', oldName: 'a.pdf', newName: 'b.pdf' }) as {
    complete: boolean;
    coverage: { new: { partlyCompared?: { page: number; count: number; words: string[] }[]; fieldsUnread?: { page: number; count: number }[] } };
  };
  assert.equal(j.complete, false);
  assert.deepEqual(j.coverage.new.partlyCompared, [{ page: 2, count: 4, words: ['Applicant', 'name', 'and'] }]);
  assert.deepEqual(j.coverage.new.fieldsUnread, [{ page: 2, count: 2 }]);
  // The core result stays 0-based.
  assert.equal(r.coverage.new.partlyCompared[0].page, 1);
});

test('F3: the CLI help for exit code 3 names words compared only in part and form fields', () => {
  const cli = new URL('../src/cli/cli.ts', import.meta.url).pathname;
  const h = spawnSync(process.execPath, [cli, '--help'], { encoding: 'utf8' });
  assert.equal(h.status, 0);
  const three = h.stdout.slice(h.stdout.indexOf('\n  3  '), h.stdout.indexOf('\nExamples'));
  assert.match(three.replace(/\s+/g, ' '), /compared only in part/);
  assert.match(three.replace(/\s+/g, ' '), /form field values/);
});

const fixtures = new URL('./fixtures/', import.meta.url).pathname;
async function pdfs(before: string, after: string) {
  const a = buildDocModel(await extractText(await openPdf(`${fixtures}probe8-${before}.pdf`), 'before.pdf'));
  const b = buildDocModel(await extractText(await openPdf(`${fixtures}probe8-${after}.pdf`), 'after.pdf'));
  return compareDocs(a, b);
}

test('T-V1: a word deleted after a figure re-set shorter stays listed where a kept one would stand inside the new page', async () => {
  // SYNTHETIC (reportlab, pypdf for the page box; verify9-text C6): "fee
  // of all services: 11,250.00 CR" re-set as "1,250.00" with "CR" deleted,
  // on a page cropped at 561 pt. By the page's shift "CR" (562–577 pt) lies
  // wholly past the edge, and the figure's start kept its place, so the
  // deletion was folded into "Content is cut off". A "CR" kept after the
  // shorter figure would start at 556 pt, inside the page.
  const r = await pdfs('T-V1-before', 'T-V1-deleted');
  const d = r.changes.map((c) => describeChange('en', c));
  assert.ok(d.includes('Number changed: 11,250.00 → 1,250.00 (-89%)'), d.join(' | '));
  assert.ok(d.includes('Deleted “CR”'), d.join(' | '));
  const cutOff = r.changes.filter((c) => c.kind === 'overflow');
  assert.ok(!cutOff.some((c) => c.old.text.includes('CR')), JSON.stringify(cutOff.map((c) => c.old.text)));
  // Control: the same figure edit with "CR" kept and the page cropped right
  // after the shorter figure (555 pt): "CR" is cut, folded as before.
  const c = await pdfs('T-V1-before', 'T-V1-cut');
  const e = c.changes.map((x) => describeChange('en', x));
  assert.ok(e.includes('Number changed: 11,250.00 → 1,250.00 (-89%)'), e.join(' | '));
  assert.ok(!e.some((x) => /CR/.test(x)), e.join(' | '));
  assert.ok(c.changes.some((x) => x.kind === 'overflow' && /CR/.test(x.old.text)), e.join(' | '));
});
