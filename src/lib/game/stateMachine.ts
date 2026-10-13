import type { GamePhase, Phase } from "./types";

/**
 * Allowed phase transitions. The same table is enforced by a database trigger
 * (see supabase/migrations) as defence in depth.
 */
export const TRANSITIONS: Record<Phase, readonly Phase[]> = {
  LOBBY: ["GENERATING_QUESTIONS"],
  GENERATING_QUESTIONS: ["QUESTION_INTRO", "FINAL_RESULTS"],
  // Owner answered -> ANSWER_SUBMISSION. Owner missing -> question skipped -> SCOREBOARD.
  QUESTION_INTRO: ["ANSWER_SUBMISSION", "SCOREBOARD", "FINAL_RESULTS"],
  ANSWER_SUBMISSION: ["VOTING", "FINAL_RESULTS"],
  VOTING: ["REVEAL", "FINAL_RESULTS"],
  REVEAL: ["SCOREBOARD", "FINAL_RESULTS"],
  SCOREBOARD: ["QUESTION_INTRO", "FINAL_RESULTS"],
  FINAL_RESULTS: [],
};

export function canTransition(from: Phase, to: Phase): boolean {
  return TRANSITIONS[from].includes(to);
}

export class InvalidTransitionError extends Error {
  constructor(public from: Phase, public to: Phase) {
    super(`Invalid phase transition ${from} -> ${to}`);
  }
}

export function assertTransition(from: Phase, to: Phase): void {
  if (!canTransition(from, to)) throw new InvalidTransitionError(from, to);
}

export type ActionType =
  | "join"
  | "ready"
  | "start"
  | "trueAnswer"
  | "fakeAnswer"
  | "vote"
  | "advance"
  | "leave";

/** Which player actions are accepted in which phase. */
export const ALLOWED_ACTIONS: Record<Phase, readonly ActionType[]> = {
  LOBBY: ["join", "ready", "start", "leave"],
  GENERATING_QUESTIONS: ["leave"],
  QUESTION_INTRO: ["trueAnswer", "advance", "leave"],
  ANSWER_SUBMISSION: ["fakeAnswer", "advance", "leave"],
  VOTING: ["vote", "advance", "leave"],
  REVEAL: ["advance", "leave"],
  SCOREBOARD: ["advance", "leave"],
  FINAL_RESULTS: ["join", "ready", "start", "leave"],
};

export function isActionAllowed(phase: Phase, action: ActionType): boolean {
  return ALLOWED_ACTIONS[phase].includes(action);
}

/** Phase that follows when the current phase's deadline expires. */
export function timeoutTarget(
  phase: GamePhase,
  ctx: { round: number; totalRounds: number },
): GamePhase | null {
  switch (phase) {
    case "GENERATING_QUESTIONS":
      return "QUESTION_INTRO"; // with fallback questions
    case "QUESTION_INTRO":
      return "SCOREBOARD"; // owner did not answer -> skip
    case "ANSWER_SUBMISSION":
      return "VOTING";
    case "VOTING":
      return "REVEAL";
    case "REVEAL":
      return "SCOREBOARD";
    case "SCOREBOARD":
      return ctx.round >= ctx.totalRounds ? "FINAL_RESULTS" : "QUESTION_INTRO";
    case "FINAL_RESULTS":
      return null;
  }
}
