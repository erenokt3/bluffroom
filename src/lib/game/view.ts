/**
 * Shape of the personalised state returned by GET /api/rooms/[code]/state.
 * Everything in here has already been filtered by the server for the
 * requesting player and current phase – secret data never appears early.
 */
import type { GamePhase, RoomStatus } from "./types";

export interface PlayerView {
  id: string;
  nickname: string;
  isHost: boolean;
  isReady: boolean;
  isConnected: boolean;
  hasLeft: boolean;
  score: number;
  seat: number;
}

export interface OptionView {
  id: string;
  text: string;
  /** True only for the requesting player's own (fake) answer. */
  isMine: boolean;
}

export interface RevealOptionView {
  id: string;
  text: string;
  isCorrect: boolean;
  authors: { id: string; nickname: string }[];
  voterIds: string[];
}

export interface RoundPointsView {
  playerId: string;
  points: number;
  correctGuess: boolean;
  fooledPoints: number;
}

export interface StandingView {
  playerId: string;
  nickname: string;
  rank: number;
  score: number;
  correctCount: number;
  fooledPoints: number;
  hasLeft: boolean;
}

export interface QuestionView {
  id: string;
  round: number;
  text: string;
  category: string;
  categoryLabel: string;
  ownerId: string;
  ownerNickname: string;
  status: "pending" | "answering" | "voting" | "revealed" | "skipped";
}

export interface GameView {
  id: string;
  status: "active" | "finished" | "aborted";
  phase: GamePhase;
  round: number;
  totalRounds: number;
  phaseStartedAt: string;
  phaseDeadline: string | null;
  questionSource: string | null;
  question: QuestionView | null;
  participantIds: string[];
  progress: {
    ownerAnswered: boolean;
    submittedIds: string[];
    votedIds: string[];
    requiredIds: string[];
  };
  my: {
    isParticipant: boolean;
    isOwner: boolean;
    canSubmitTrueAnswer: boolean;
    canSubmitFake: boolean;
    canVote: boolean;
    trueAnswer: string | null;
    submission: string | null;
    voteOptionId: string | null;
  };
  options: OptionView[] | null;
  reveal: {
    skipped: boolean;
    options: RevealOptionView[];
    points: RoundPointsView[];
  } | null;
  standings: StandingView[];
}

export interface RoomState {
  serverTime: string;
  version: number;
  realtime: { mode: "supabase" | "local"; topic: string };
  room: {
    id: string;
    code: string;
    status: RoomStatus;
    hostPlayerId: string | null;
    maxPlayers: number;
    minPlayers: number;
  };
  me: { id: string; nickname: string; isHost: boolean };
  players: PlayerView[];
  game: GameView | null;
}
