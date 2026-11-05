// Fix round 8, final pass: the JSON export and the CLI help name every
// kind of coverage gap that the notices name (id F3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { compareDocs } from '../src/core/compare.ts';
import { buildJson } from '../src/core/report.ts';
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
