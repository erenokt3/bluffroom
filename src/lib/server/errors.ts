/** Typed application error with a user-facing Turkish message. */
export type ErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "ROOM_NOT_FOUND"
  | "ROOM_FULL"
  | "NICKNAME_TAKEN"
  | "GAME_IN_PROGRESS"
  | "NOT_ENOUGH_PLAYERS"
  | "NOT_HOST"
  | "WRONG_PHASE"
  | "PHASE_CLOSED"
  | "STALE_QUESTION"
  | "MATCHES_TRUTH"
  | "OWNER_CANNOT_VOTE"
  | "OWN_ANSWER"
  | "INVALID_OPTION"
  | "NOT_PARTICIPANT"
  | "RATE_LIMITED"
  | "SERVER_MISCONFIGURED"
  | "INTERNAL";

const STATUS: Record<ErrorCode, number> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  ROOM_NOT_FOUND: 404,
  ROOM_FULL: 409,
  NICKNAME_TAKEN: 409,
  GAME_IN_PROGRESS: 409,
  NOT_ENOUGH_PLAYERS: 409,
  NOT_HOST: 403,
  WRONG_PHASE: 409,
  PHASE_CLOSED: 409,
  STALE_QUESTION: 409,
  MATCHES_TRUTH: 422,
  OWNER_CANNOT_VOTE: 403,
  OWN_ANSWER: 422,
  INVALID_OPTION: 422,
  NOT_PARTICIPANT: 403,
  RATE_LIMITED: 429,
  SERVER_MISCONFIGURED: 500,
  INTERNAL: 500,
};

export class AppError extends Error {
  readonly status: number;
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.status = STATUS[code];
  }
}

export const isAppError = (e: unknown): e is AppError => e instanceof AppError;
