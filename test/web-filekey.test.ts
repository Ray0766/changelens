import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { contentHash, fileIdentity, reuseLoaded } from '../src/web/filekey.ts';

// Two "re-exported" versions of a large file: same length, identical except
// for one byte far past the first 4 MB (where the old prefix hash stopped).
function bigPair(): [Uint8Array, Uint8Array] {
  const a = new Uint8Array(6_000_000);
  for (let i = 0; i < a.length; i++) a[i] = (i * 7919) & 0xff;
  const b = a.slice();
  b[5_999_000] ^= 0x01;
  return [a, b];
}

test('file identity covers every byte: a late one-byte edit gives another key', async () => {
  const [a, b] = bigPair();
  const ia = await fileIdentity(a);
  const ib = await fileIdentity(b);
  assert.notEqual(ia.key, ib.key);
  assert.equal(ia.sha256, createHash('sha256').update(a).digest('hex'));
  assert.equal(ib.sha256, createHash('sha256').update(b).digest('hex'));
  assert.equal((await fileIdentity(a.slice())).key, ia.key, 'same content, same key');
});

test('fallback content hash (no Web Crypto, e.g. plain http) also covers every byte', () => {
  const [a, b] = bigPair();
  assert.notEqual(contentHash(a), contentHash(b));
  assert.equal(contentHash(a), contentHash(a.slice()));
  // Same bytes, different length: never equal.
  assert.notEqual(contentHash(new Uint8Array(10)), contentHash(new Uint8Array(11)));
});

test('a cached document is reused only for identical bytes, under the new name', async () => {
  const [a, b] = bigPair();
  const cached = { key: (await fileIdentity(a)).key, name: 'contract.pdf', model: 'v1' };
  assert.equal(reuseLoaded(cached, (await fileIdentity(b)).key, 'contract.pdf'), undefined, 'edited file must be loaded afresh');
  const again = reuseLoaded(cached, (await fileIdentity(a.slice())).key, 'contract (copy).pdf');
  assert.equal(again?.model, 'v1');
  assert.equal(again?.name, 'contract (copy).pdf');
  assert.equal(reuseLoaded(undefined, cached.key, 'x.pdf'), undefined);
});
