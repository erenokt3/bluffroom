/**
 * Shared, framework-agnostic game types. These are used by the pure game
 * logic, the server services and the client (for the public state shape).
 */

export const PHASES = [
  "LOBBY",
  "GENERATING_QUESTIONS",
  "QUESTION_INTRO",
  "ANSWER_SUBMISSION",
  "VOTING",
  "REVEAL",
  "SCOREBOARD",
  "FINAL_RESULTS",
] as const;

export type Phase = (typeof PHASES)[number];

/** Phases that a persisted `games.phase` row may hold (LOBBY is room-level). */
export type GamePhase = Exclude<Phase, "LOBBY">;

export type RoomStatus = "lobby" | "playing" | "finished";

export interface OptionForScoring {
  id: string;
  isCorrect: boolean;
  /** Players that wrote this (fake) answer. Empty for the correct answer. */
  authorIds: string[];
}

export interface VoteForScoring {
  voterId: string;
  optionId: string;
}

export interface PlayerRoundScore {
  playerId: string;
  points: number;
  correctGuess: boolean;
  /** Points earned by fooling other players in this round. */
  fooledPoints: number;
}
