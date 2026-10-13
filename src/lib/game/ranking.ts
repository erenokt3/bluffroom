export interface RankInput {
  playerId: string;
  nickname: string;
  score: number;
}

export interface Ranked<T extends RankInput> {
  rank: number;
  item: T;
}

/**
 * Standard competition ranking ("1224"): tied scores share a rank. Sorted by
 * score desc, then nickname (Turkish collation) for a stable display order
 * that is identical on every device.
 */
export function rankPlayers<T extends RankInput>(players: readonly T[]): Ranked<T>[] {
  const sorted = [...players].sort(
    (a, b) => b.score - a.score || a.nickname.localeCompare(b.nickname, "tr") || a.playerId.localeCompare(b.playerId),
  );
  const out: Ranked<T>[] = [];
  sorted.forEach((item, i) => {
    const rank = i > 0 && sorted[i - 1].score === item.score ? out[i - 1].rank : i + 1;
    out.push({ rank, item });
  });
  return out;
}

export function winners<T extends RankInput>(players: readonly T[]): T[] {
  return rankPlayers(players).filter((r) => r.rank === 1).map((r) => r.item);
}
