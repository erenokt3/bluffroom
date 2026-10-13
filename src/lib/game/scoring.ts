import { normalizeAnswer } from "./text";
import { opaqueId, shuffle, type Rng, cryptoRng } from "./random";
import type { OptionForScoring, PlayerRoundScore, VoteForScoring } from "./types";

export interface FakeSubmission {
  playerId: string;
  text: string;
  /** ISO timestamp or epoch ms – used for deterministic ordering. */
  createdAt: string | number | Date;
}

export interface BuiltOption {
  opaqueId: string;
  text: string;
  normalized: string;
  isCorrect: boolean;
  /** Authors of this option (empty for the correct answer). */
  authorIds: string[];
  displayOrder: number;
}

function ts(v: string | number | Date): number {
  return v instanceof Date ? v.getTime() : typeof v === "number" ? v : Date.parse(v);
}

/**
 * Merge the true answer and fake answers into a single shuffled option list.
 *
 * Duplicate handling (deterministic):
 * - Fakes identical (after normalisation) to the true answer are discarded
 *   (the server already rejects them on submission; this is defence in depth).
 * - Fakes identical to each other are merged into ONE option. Every author of
 *   the merged option receives +1 for each vote it gets. The displayed text is
 *   the earliest submission's text (ties broken by player id).
 */
export function buildOptions(
  correctText: string,
  fakes: readonly FakeSubmission[],
  rng: Rng = cryptoRng,
): BuiltOption[] {
  const correctNorm = normalizeAnswer(correctText);
  const sorted = [...fakes].sort(
    (a, b) => ts(a.createdAt) - ts(b.createdAt) || a.playerId.localeCompare(b.playerId),
  );
  const groups = new Map<string, { text: string; authorIds: string[] }>();
  for (const f of sorted) {
    const norm = normalizeAnswer(f.text);
    if (!norm || norm === correctNorm) continue;
    const g = groups.get(norm);
    if (g) {
      if (!g.authorIds.includes(f.playerId)) g.authorIds.push(f.playerId);
    } else {
      groups.set(norm, { text: f.text, authorIds: [f.playerId] });
    }
  }
  const raw: Omit<BuiltOption, "displayOrder" | "opaqueId">[] = [
    { text: correctText, normalized: correctNorm, isCorrect: true, authorIds: [] },
    ...[...groups.entries()].map(([normalized, g]) => ({
      text: g.text,
      normalized,
      isCorrect: false,
      authorIds: g.authorIds,
    })),
  ];
  const ids = new Set<string>();
  return shuffle(raw, rng).map((o, i) => {
    let id = opaqueId(rng);
    while (ids.has(id)) id = opaqueId(rng);
    ids.add(id);
    return { ...o, opaqueId: id, displayOrder: i };
  });
}

export type VoteRejection =
  | "OWNER_CANNOT_VOTE"
  | "NOT_ELIGIBLE"
  | "UNKNOWN_OPTION"
  | "OWN_ANSWER";

/** Validate a single vote against the round's rules. */
export function validateVote(
  vote: VoteForScoring,
  ctx: { ownerId: string; eligibleVoterIds: readonly string[]; options: readonly OptionForScoring[] },
): VoteRejection | null {
  if (vote.voterId === ctx.ownerId) return "OWNER_CANNOT_VOTE";
  if (!ctx.eligibleVoterIds.includes(vote.voterId)) return "NOT_ELIGIBLE";
  const opt = ctx.options.find((o) => o.id === vote.optionId);
  if (!opt) return "UNKNOWN_OPTION";
  if (opt.authorIds.includes(vote.voterId)) return "OWN_ANSWER";
  return null;
}

/**
 * Pure scoring function for a single round.
 * - Each valid vote for the correct option: +1 to the voter.
 * - Each valid vote for a fake option: +1 to every author of that option.
 * - Invalid votes (owner, ineligible, unknown option, own answer) are ignored.
 * - Only the first vote per voter counts (the DB also enforces uniqueness).
 * The question owner never earns points in their own round.
 */
export function scoreRound(input: {
  ownerId: string;
  participantIds: readonly string[];
  eligibleVoterIds: readonly string[];
  options: readonly OptionForScoring[];
  votes: readonly VoteForScoring[];
}): PlayerRoundScore[] {
  const result = new Map<string, PlayerRoundScore>();
  for (const id of input.participantIds) {
    result.set(id, { playerId: id, points: 0, correctGuess: false, fooledPoints: 0 });
  }
  const get = (id: string) => {
    let r = result.get(id);
    if (!r) {
      r = { playerId: id, points: 0, correctGuess: false, fooledPoints: 0 };
      result.set(id, r);
    }
    return r;
  };
  const seen = new Set<string>();
  for (const vote of input.votes) {
    if (seen.has(vote.voterId)) continue;
    if (validateVote(vote, input) !== null) continue;
    seen.add(vote.voterId);
    const opt = input.options.find((o) => o.id === vote.optionId)!;
    if (opt.isCorrect) {
      const r = get(vote.voterId);
      r.points += 1;
      r.correctGuess = true;
    } else {
      for (const authorId of opt.authorIds) {
        if (authorId === input.ownerId) continue;
        const r = get(authorId);
        r.points += 1;
        r.fooledPoints += 1;
      }
    }
  }
  return [...result.values()];
}
