// Moves: what changed inside a moved passage is reported, located in both
// versions, and moved text is not mistaken for new content.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareDocs } from '../src/core/compare.ts';
import { describeChange, excerpt, notices } from '../src/core/describe.ts';
import { makeDoc, model } from './helpers.ts';

const P1 = ['This agreement sets out the terms under which the provider delivers services to the client.'];
const P3 = ['Either party may terminate this agreement with thirty days written notice to the other party.'];
const P4 = ['All notices must be delivered in writing to the addresses listed in the schedule below.'];
const list = (r: ReturnType<typeof compareDocs>) => r.changes.map((c) => `${c.kind}: ${describeChange('en', c)}`);

test('a figure changed inside a moved paragraph is reported in both versions', () => {
  const fee = (n: number) => [`The monthly service fee is ${n} dollars per seat and is payable in advance each month.`];
  const a = model(makeDoc('a', [[P1, fee(100), P3, P4]]));
  const b = model(makeDoc('b', [[P1, P3, P4, fee(900)]]));
  const r = compareDocs(a, b);
  assert.deepEqual(list(r), ['move: Moved and edited a paragraph', 'replace: Number changed: 100 → 900 (+800%)']);
  const [move, num] = r.changes;
  assert.equal(move.moveEdits, 1);
  assert.equal(num.inMove, move.id);
  // The old wording is available for display next to the new one.
  assert.ok(excerpt(move).old.includes('100 dollars'));
  assert.ok(excerpt(move).new.includes('900 dollars'));
  assert.equal(describeChange('zh', move), '移动并修改了一段');
  // The figure is located inside the paragraph's old and new positions.
  const within = (inner: { rect: { y: number } }[], outer: { rect: { y: number; h: number } }[]) =>
    inner.every((r) => outer.some((o) => r.rect.y >= o.rect.y - 1 && r.rect.y <= o.rect.y + o.rect.h));
  assert.equal(a.tokens[num.old.start!].text, '100');
  assert.equal(b.tokens[num.new.start!].text, '900');
  assert.ok(within(num.old.rects, move.old.rects));
  assert.ok(within(num.new.rects, move.new.rects));
  // An unchanged move is still just a move.
  const same = compareDocs(model(makeDoc('a', [[P1, fee(100), P3, P4]])), model(makeDoc('b', [[P1, P3, P4, fee(100)]])));
  assert.deepEqual(list(same), ['move: Moved a paragraph']);
});

test('swapped parties and an added negation in a moved clause are each listed', () => {
  const a = model(makeDoc('a', [[P1, ['The Buyer shall indemnify the Seller against all claims arising from the use of the goods.'], P3, P4]]));
  const b = model(makeDoc('b', [[P1, P3, P4, ['The Seller shall not indemnify the Buyer against all claims arising from the use of the goods.']]]));
  const r = compareDocs(a, b);
  assert.deepEqual(list(r), [
    'move: Moved and edited a paragraph',
    'replace: Changed “Buyer” → “Seller”',
    'insert: Added “not”',
    'replace: Changed “Seller” → “Buyer”',
  ]);
  const move = r.changes[0];
  assert.ok(r.changes.slice(1).every((c) => c.inMove === move.id));
  // The edit ids survive renumbering (as after the visual stage).
  assert.equal(move.moveEdits, 3);
});

test('a passage with its words reordered is not paired as a move', () => {
  const words = 'Delivery dates, payment terms and warranty periods are agreed separately for every individual order'.split(' ');
  const a = model(makeDoc('a', [[P1, [words.join(' ')], P3, P4]]));
  const b = model(makeDoc('b', [[P1, P3, P4, [[...words].reverse().join(' ')]]]));
  const kinds = compareDocs(a, b).changes.map((c) => c.kind);
  assert.ok(!kinds.includes('move'), kinds.join());
});

test('a page that only received moved content is not flagged as new', () => {
  const page = (n: number) =>
    [1, 2, 3, 4, 5].map((k) => [`Section ${n}.${k} explains how the ${['supplier', 'buyer', 'agent', 'carrier', 'insurer'][k - 1]} handles item ${n * 10 + k}.`]);
  const r = compareDocs(model(makeDoc('a', [page(1), page(2), page(3), page(4)])), model(makeDoc('b', [page(1), page(3), page(2), page(4)])));
  assert.deepEqual(list(r), ['move: Moved 5 paragraphs']);
  assert.deepEqual(r.coverage.new.uncertain, []);
  assert.ok(!notices('en', r).some((n) => n.text.includes('mostly new content')));
});

test('a paragraph moved right after a deleted sentence is still a move', () => {
  // The deleted sentence and the moved paragraph share the word "every";
  // that coincidence must not turn the move into two rewrites.
  const P2 = ['Routine inspections take place every quarter. During each inspection the technician checks filters, belts and drains and records meter readings for the energy report.'];
  const kept = 'Faults reported by phone are answered on the same day by the duty technician on call.';
  const cut = 'Certificates are renewed every year and a copy is sent to the facilities manager without being asked.';
  const a = model(makeDoc('a', [[P2, P1, P3, P4, [`${kept} ${cut}`]]]));
  const b = model(makeDoc('b', [[P1, P3, P4, [kept], P2]]));
  const r = compareDocs(a, b);
  // (Synthetic lines can also stick out of the page: only text changes count here.)
  assert.deepEqual(r.changes.filter((c) => c.category === 'text').map((c) => c.kind).sort(), ['delete', 'move']);
  const del = r.changes.find((c) => c.kind === 'delete')!;
  assert.ok(del.old.text.startsWith('Certificates are renewed every year'), del.old.text);
  const move = r.changes.find((c) => c.kind === 'move')!;
  assert.equal(move.moveEdits, undefined, 'the full stop next to the moved paragraph is not an edit');
});
