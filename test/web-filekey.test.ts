import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileIdentity, reuseLoaded, sha256Js } from '../src/web/filekey.ts';

// Two "re-exported" versions of a large file: same length, identical except
// for one byte far past the first 4 MB (where the old prefix hash stopped).
function bigPair(): [Uint8Array, Uint8Array] {
  const a = new Uint8Array(6_000_000);
  for (let i = 0; i < a.length; i++) a[i] = (i * 7919) & 0xff;
  const b = a.slice();
  b[5_999_000] ^= 0x01;
  return [a, b];
}

const nodeSha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

/** Run `fn` as on a page served over plain http: no crypto.subtle. */
async function withoutWebCrypto<T>(fn: () => Promise<T>): Promise<T> {
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  Object.defineProperty(globalThis, 'crypto', { value: { getRandomValues: (a: Uint8Array) => a }, configurable: true, writable: true });
  try {
    assert.equal(globalThis.crypto.subtle, undefined);
    return await fn();
  } finally {
    if (saved) Object.defineProperty(globalThis, 'crypto', saved);
  }
}

test('file identity covers every byte: a late one-byte edit gives another key', async () => {
  const [a, b] = bigPair();
  const ia = await fileIdentity(a);
  const ib = await fileIdentity(b);
  assert.notEqual(ia.key, ib.key);
  assert.equal(ia.sha256, nodeSha(a));
  assert.equal(ib.sha256, nodeSha(b));
  assert.equal((await fileIdentity(a.slice())).key, ia.key, 'same content, same key');
});

test('without Web Crypto (plain http) the file SHA-256 is still computed, and is the same', async () => {
  const [a, b] = bigPair();
  const ia = await withoutWebCrypto(() => fileIdentity(a));
  const ib = await withoutWebCrypto(() => fileIdentity(b));
  // The report and JSON name the files by this digest; it used to be ''.
  assert.equal(ia.sha256, nodeSha(a));
  assert.equal(ib.sha256, nodeSha(b));
  assert.notEqual(ia.key, ib.key);
  assert.equal(ia.key, (await fileIdentity(a)).key, 'same key on secure and plain-http pages');
});

test('JavaScript SHA-256 matches node:crypto at every padding boundary', () => {
  const data = new Uint8Array(300);
  for (let i = 0; i < data.length; i++) data[i] = (i * 31 + 7) & 0xff;
  for (const n of [0, 1, 3, 55, 56, 57, 63, 64, 65, 119, 120, 127, 128, 129, 300]) {
    const b = data.subarray(0, n);
    assert.equal(sha256Js(b), nodeSha(b), `length ${n}`);
  }
  assert.equal(sha256Js(new TextEncoder().encode('abc')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  // A view into a larger buffer (as PDF bytes may be).
  const big = new Uint8Array(1000).fill(9);
  assert.equal(sha256Js(big.subarray(10, 210)), nodeSha(big.subarray(10, 210)));
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
