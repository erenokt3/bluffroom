import { cryptoRng, shuffle, type Rng } from "./random";

/**
 * Decide who owns each of the `rounds` questions.
 *
 * - n <= rounds: every player owns at least one question; the remainder is
 *   spread so counts differ by at most 1.
 * - n > rounds (11–12 players with 10 questions): it is mathematically
 *   impossible for everyone to own one, so `rounds` distinct players are
 *   picked at random.
 * - The same player never owns two consecutive questions (when n >= 2).
 */
export function distributeOwners(
  playerIds: readonly string[],
  rounds = 10,
  rng: Rng = cryptoRng,
): string[] {
  const n = playerIds.length;
  if (n === 0) throw new Error("No players");
  if (n === 1) return Array.from({ length: rounds }, () => playerIds[0]);

  const order = shuffle(playerIds, rng);
  const remaining = new Map<string, number>();
  if (n >= rounds) {
    order.slice(0, rounds).forEach((id) => remaining.set(id, 1));
  } else {
    const base = Math.floor(rounds / n);
    const extra = rounds % n;
    order.forEach((id, i) => remaining.set(id, base + (i < extra ? 1 : 0)));
  }

  const result: string[] = [];
  for (let r = 0; r < rounds; r++) {
    const prev = result[result.length - 1];
    const candidates = [...remaining.entries()].filter(([id, c]) => c > 0 && id !== prev);
    const pool = candidates.length > 0 ? candidates : [...remaining.entries()].filter(([, c]) => c > 0);
    const max = Math.max(...pool.map(([, c]) => c));
    const best = pool.filter(([, c]) => c === max).map(([id]) => id);
    const pick = best[Math.floor(rng() * best.length)];
    result.push(pick);
    remaining.set(pick, remaining.get(pick)! - 1);
  }
  return result;
}
