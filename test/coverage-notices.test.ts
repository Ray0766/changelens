// What the coverage notices promise: only text that really could not be
// compared is a warning (which makes `--fail-on-change` report "incomplete").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareDocs } from '../src/core/compare.ts';
import { notices } from '../src/core/describe.ts';
import { makeDoc, model } from './helpers.ts';

const doc = (s: string) => model(makeDoc('a', [[[s, 'The second sentence of the paragraph stays the same in both versions.']]]));

test('private-use characters are compared and only noted; U+FFFD is a warning', () => {
  // A font's alternate dash mapped to a private-use code (as Chromium writes for Inter).
  const pua = compareDocs(doc('Synthetic sample  not a real document.'), doc('Synthetic sample  not a real document.'));
  const n1 = notices('en', pua);
  assert.equal(pua.changes.length, 0);
  assert.ok(n1.some((n) => n.level === 'info' && n.text.includes('font’s own code')), JSON.stringify(n1));
  assert.ok(!n1.some((n) => n.level === 'warn'), JSON.stringify(n1));
  // A changed private-use glyph is still found.
  assert.equal(compareDocs(doc('Synthetic sample  not a real document.'), doc('Synthetic sample  not a real document.')).changes.length, 1);
  // U+FFFD stands for any unmapped glyph: changes to it can be missed.
  const lost = compareDocs(doc('Amount �� paid.'), doc('Amount �� paid.'));
  assert.ok(notices('en', lost).some((n) => n.level === 'warn' && n.text.includes('could not be read')));
});
