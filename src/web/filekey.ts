/**
 * Identity of a picked PDF. The key decides whether an already loaded
 * document can be reused, and under which name reviews and manual page pairs
 * are stored, so it must cover every byte of the file: two files that differ
 * anywhere (even past the first megabytes, with the same length) must get
 * different keys.
 */
export interface FileIdentity {
  /** Hex SHA-256 of the whole file, or '' where Web Crypto is unavailable. */
  sha256: string;
  /** Full-content key: the SHA-256, or a 53-bit content hash as fallback. */
  key: string;
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  try {
    // digest() needs an ArrayBuffer-backed view; copy only if it is not one.
    const view = bytes.buffer instanceof ArrayBuffer ? (bytes as Uint8Array<ArrayBuffer>) : (bytes.slice() as Uint8Array<ArrayBuffer>);
    const d = await crypto.subtle.digest('SHA-256', view);
    return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    // crypto.subtle only exists in secure contexts (https, localhost).
    return '';
  }
}

/**
 * Non-cryptographic hash of every byte (two 32-bit multiply-xor lanes mixed
 * at the end, after bryc's public-domain cyrb53). Used as the key when
 * Web Crypto is unavailable, e.g. when the app is served over plain http on
 * an intranet. Accidental collisions are negligible; it is not meant to
 * resist deliberately crafted files.
 */
export function contentHash(bytes: Uint8Array): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    h1 = Math.imul(h1 ^ b, 2654435761);
    h2 = Math.imul(h2 ^ b, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const n = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return `h53-${n.toString(16).padStart(14, '0')}-${bytes.length}`;
}

export async function fileIdentity(bytes: Uint8Array): Promise<FileIdentity> {
  const sha256 = await sha256Hex(bytes);
  return { sha256, key: sha256 || contentHash(bytes) };
}

/**
 * The cached document when it was loaded from exactly the same bytes, with
 * the name of the newly picked file (the same content may arrive under
 * another name); otherwise undefined, and the file must be loaded afresh.
 */
export function reuseLoaded<T extends { key: string; name: string }>(prev: T | undefined, key: string, name: string): T | undefined {
  return prev && prev.key === key ? { ...prev, name } : undefined;
}
