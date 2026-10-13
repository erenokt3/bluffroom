/**
 * Central game configuration. All durations are in seconds and are enforced
 * by the server (phase deadlines are stored in the database). The client only
 * uses them for display.
 */
export const GAME_CONFIG = {
  totalRounds: 10,
  minPlayers: 4,
  maxPlayers: 12,
  roomCodeLength: 6,
  /** Unambiguous characters only: no 0/O, 1/I/L. */
  roomCodeAlphabet: "ABCDEFGHJKMNPQRSTUVWXYZ23456789",
  nickname: { min: 2, max: 16 },
  answer: { min: 1, max: 80 },
  durations: {
    generatingQuestions: 40,
    trueAnswer: 60,
    fakeAnswers: 75,
    voting: 45,
    reveal: 12,
    scoreboard: 15,
  },
  /** A player is considered disconnected if not seen for this many seconds. */
  connectionTimeoutSeconds: 25,
  /** Host is transferred if the host has been disconnected this long. */
  hostTransferAfterSeconds: 45,
  /** Rooms with no activity for this long are deleted by cleanup. */
  abandonedRoomSeconds: 2 * 60 * 60,
  /** Finished rooms are cleaned sooner. */
  finishedRoomSeconds: 60 * 60,
  ai: { timeoutMs: 12_000 },
} as const;

/** Optional override for automated tests: shorten all timers. */
export function getDurations() {
  const scale = Number(process.env.BLUFFROOM_TIMER_SCALE ?? "1");
  const s = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const d = GAME_CONFIG.durations;
  return {
    generatingQuestions: Math.max(1, Math.round(d.generatingQuestions * s)),
    trueAnswer: Math.max(1, Math.round(d.trueAnswer * s)),
    fakeAnswers: Math.max(1, Math.round(d.fakeAnswers * s)),
    voting: Math.max(1, Math.round(d.voting * s)),
    reveal: Math.max(1, Math.round(d.reveal * s)),
    scoreboard: Math.max(1, Math.round(d.scoreboard * s)),
  };
}
