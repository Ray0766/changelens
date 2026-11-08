/**
 * Identity of a picked PDF. The key decides whether an already loaded
 * document can be reused, and under which name reviews and manual page pairs
 * are stored, so it must cover every byte of the file: two files that differ
 * anywhere (even past the first megabytes, with the same length) must get
 * different keys. It is the file's SHA-256, also shown in the report.
 */
export interface FileIdentity {
  /** Hex SHA-256 of the whole file (the report's file identity). */
  sha256: string;
  /** Full-content key: the SHA-256. */
  key: string;
}

const hex = (words: ArrayLike<number>) => Array.from(words, (w) => (w >>> 0).toString(16).padStart(8, '0')).join('');

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  // crypto.subtle only exists in secure contexts (https, localhost). A
  // static build served over plain http (an intranet server) computes the
  // same digest in JavaScript, so the report still names the exact files.
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    try {
      // digest() needs an ArrayBuffer-backed view; copy only if it is not one.
      const view = bytes.buffer instanceof ArrayBuffer ? (bytes as Uint8Array<ArrayBuffer>) : (bytes.slice() as Uint8Array<ArrayBuffer>);
      const d = new DataView(await subtle.digest('SHA-256', view));
      return hex(Array.from({ length: 8 }, (_, i) => d.getUint32(i * 4)));
    } catch {
      /* fall back to the JavaScript implementation */
    }
  }
  return sha256Js(bytes);
}

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

/** SHA-256 (FIPS 180-4) in plain JavaScript, for pages without Web Crypto. */
export function sha256Js(bytes: Uint8Array): string {
  const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const W = new Uint32Array(64);
  // The last block(s): the remaining bytes, 0x80, zeros, the bit length.
  const full = bytes.length - (bytes.length % 64);
  const tail = new Uint8Array(bytes.length % 64 < 56 ? 64 : 128);
  tail.set(bytes.subarray(full));
  tail[bytes.length - full] = 0x80;
  const bits = new DataView(tail.buffer);
  bits.setUint32(tail.length - 8, Math.floor(bytes.length / 0x20000000));
  bits.setUint32(tail.length - 4, (bytes.length * 8) >>> 0);
  const block = (src: Uint8Array, at: number) => {
    for (let i = 0; i < 16; i++) {
      const j = at + i * 4;
      W[i] = (src[j] << 24) | (src[j + 1] << 16) | (src[j + 2] << 8) | src[j + 3];
    }
    for (let i = 16; i < 64; i++) {
      const a = W[i - 15];
      const b = W[i - 2];
      const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
      const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
      W[i] = W[i - 16] + s0 + W[i - 7] + s1;
    }
    let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const t1 = (h + S1 + ((e & f) ^ (~e & g)) + K[i] + W[i]) | 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const t2 = (S0 + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      h = g;
      g = f;
      f = e;
      e = (d + t1) | 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) | 0;
    }
    H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
  };
  for (let at = 0; at < full; at += 64) block(bytes, at);
  for (let at = 0; at < tail.length; at += 64) block(tail, at);
  return hex(H);
}

export async function fileIdentity(bytes: Uint8Array): Promise<FileIdentity> {
  const sha256 = await sha256Hex(bytes);
  return { sha256, key: sha256 };
}

/**
 * The cached document when it was loaded from exactly the same bytes, with
 * the name of the newly picked file (the same content may arrive under
 * another name); otherwise undefined, and the file must be loaded afresh.
 */
export function reuseLoaded<T extends { key: string; name: string }>(prev: T | undefined, key: string, name: string): T | undefined {
  return prev && prev.key === key ? { ...prev, name } : undefined;
}
