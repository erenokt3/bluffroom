/** Random helpers. `Rng` returns a float in [0, 1). Injectable for tests. */
export type Rng = () => number;

export const cryptoRng: Rng = () => {
  const buf = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buf);
  return buf[0] / 0x1_0000_0000;
};

export function shuffle<T>(items: readonly T[], rng: Rng = cryptoRng): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function randomString(length: number, alphabet: string, rng: Rng = cryptoRng): string {
  let out = "";
  for (let i = 0; i < length; i++) out += alphabet[Math.floor(rng() * alphabet.length)];
  return out;
}

const OPAQUE_ALPHABET = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Opaque, non-sequential id that reveals nothing about authorship. */
export function opaqueId(rng: Rng = cryptoRng): string {
  return randomString(12, OPAQUE_ALPHABET, rng);
}

/** Simple deterministic PRNG for tests. */
export function seededRng(seed: number): Rng {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 1_000_000) / 1_000_000;
  };
}
