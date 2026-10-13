/**
 * Generates the personalised RoomState response for GET /api/rooms/[code]/state.
 * Secret fields (true answers, answer authors, votes) are scrubbed depending
 * on the requesting player and phase.
 */
import { CATEGORY_LABELS } from "../questions/categories";
import { renderQuestion } from "../questions/categories";
import { rankPlayers } from "../game/ranking";
import type {
  GameView,
  OptionView,
  PlayerView,
  QuestionView,
  RevealOptionView,
  RoomState,
  RoundPointsView,
  StandingView,
} from "../game/view";
import { getDb } from "./db";
import { AppError } from "./errors";
import {
  GAME_COLS,
  PLAYER_COLS,
  QUESTION_COLS,
  ROOM_COLS,
  touchAndMaintain,
  type GameRow,
  type PlayerRow,
  type QuestionRow,
  type RoomRow,
} from "./gameService";
import { realtimeMode, roomTopic } from "./realtime";
import { verifySessionToken } from "./session";

export async function getRoomState(code: string, token: string | null): Promise<RoomState> {
  const claims = await verifySessionToken(token);
  const db = await getDb();
  await touchAndMaintain(db, code, claims);

  const rooms = await db.query<RoomRow>(`select ${ROOM_COLS} from rooms where code = $1`, [code]);
  const room = rooms[0];
  if (!room) throw new AppError("ROOM_NOT_FOUND", "Oda bulunamadı.");

  const allPlayers = await db.query<PlayerRow>(
    `select ${PLAYER_COLS} from players where room_id = $1 order by seat_order`,
    [room.id],
  );
  const me = allPlayers.find((p) => p.id === claims.playerId);
  if (!me) throw new AppError("UNAUTHORIZED", "Oturumun bu odada bulunamadı.");

  const playersView: PlayerView[] = allPlayers
    .filter((p) => !p.left_at)
    .map((p) => ({
      id: p.id,
      nickname: p.nickname,
      isHost: p.id === room.host_player_id,
      isReady: p.is_ready,
      isConnected: p.connected,
      hasLeft: !!p.left_at,
      score: p.total_score,
      seat: p.seat_order,
    }));

  let gameView: GameView | null = null;
  if (room.current_game_id) {
    const games = await db.query<GameRow>(`select ${GAME_COLS} from games where id = $1`, [
      room.current_game_id,
    ]);
    const game = games[0];
    if (game) {
      const gamePlayers = await db.query<{
        player_id: string;
        score: number;
        correct_count: number;
        fooled_points: number;
      }>(`select player_id, score, correct_count, fooled_points from game_players where game_id = $1`, [
        game.id,
      ]);
      const participantIds = gamePlayers.map((gp) => gp.player_id);
      const isParticipant = participantIds.includes(me.id);

      // Current question
      let qView: QuestionView | null = null;
      let questionRow: QuestionRow | null = null;
      if (game.current_round >= 1) {
        const questions = await db.query<QuestionRow>(
          `select ${QUESTION_COLS} from questions where game_id = $1 and round_number = $2`,
          [game.id, game.current_round],
        );
        questionRow = questions[0] ?? null;
        if (questionRow) {
          const ownerPlayer = allPlayers.find((p) => p.id === questionRow!.owner_player_id);
          const ownerNick = ownerPlayer?.nickname ?? "Biri";
          qView = {
            id: questionRow.id,
            round: questionRow.round_number,
            text: renderQuestion(questionRow.question_text, ownerNick),
            category: questionRow.category,
            categoryLabel:
              CATEGORY_LABELS.tr[questionRow.category as keyof typeof CATEGORY_LABELS.tr] ??
              questionRow.category,
            ownerId: questionRow.owner_player_id,
            ownerNickname: ownerNick,
            status: questionRow.status,
          };
        }
      }

      const isOwner = !!questionRow && questionRow.owner_player_id === me.id;

      // Submissions for this question
      let ownerAnswered = false;
      const submittedIds: string[] = [];
      let mySubmission: string | null = null;
      let myTrueAnswer: string | null = null;

      if (questionRow) {
        const subs = await db.query<{
          id: string;
          player_id: string;
          answer_text: string;
          is_correct: boolean;
        }>(`select id, player_id, answer_text, is_correct from submissions where question_id = $1`, [
          questionRow.id,
        ]);

        for (const s of subs) {
          if (s.is_correct) {
            ownerAnswered = true;
            if (isOwner) myTrueAnswer = s.answer_text;
          } else {
            submittedIds.push(s.player_id);
            if (s.player_id === me.id) {
              mySubmission = s.answer_text;
            }
          }
        }
      }

      // Votes
      const votedIds: string[] = [];
      let myVoteOptionId: string | null = null;
      if (questionRow) {
        const votes = await db.query<{ voter_player_id: string; opaque_id: string }>(
          `select v.voter_player_id, ao.opaque_id
             from votes v
             join answer_options ao on ao.id = v.answer_option_id
            where v.question_id = $1`,
          [questionRow.id],
        );
        for (const v of votes) {
          votedIds.push(v.voter_player_id);
          if (v.voter_player_id === me.id) {
            myVoteOptionId = v.opaque_id;
          }
        }
      }

      const requiredForSub = participantIds.filter(
        (id) => id !== questionRow?.owner_player_id,
      );

      // Options view (during VOTING phase or later)
      let optionsView: OptionView[] | null = null;
      if (
        questionRow &&
        (game.phase === "VOTING" ||
          game.phase === "REVEAL" ||
          game.phase === "SCOREBOARD" ||
          game.phase === "FINAL_RESULTS")
      ) {
        const opts = await db.query<{
          id: string;
          opaque_id: string;
          option_text: string;
          display_order: number;
        }>(
          `select id, opaque_id, option_text, display_order
             from answer_options
            where question_id = $1
            order by display_order asc`,
          [questionRow.id],
        );

        // Check which options were authored by me
        const myAuthoredOptionIds = new Set<string>();
        if (opts.length > 0) {
          const authored = await db.query<{ option_id: string }>(
            `select option_id from option_authors where option_id in (
               select id from answer_options where question_id = $1
             ) and player_id = $2`,
            [questionRow.id, me.id],
          );
          authored.forEach((a) => myAuthoredOptionIds.add(a.option_id));
        }

        optionsView = opts.map((o) => ({
          id: o.opaque_id,
          text: o.option_text,
          isMine: myAuthoredOptionIds.has(o.id),
        }));
      }

      // Reveal & results view (REVEAL, SCOREBOARD, FINAL_RESULTS)
      let revealView: GameView["reveal"] = null;
      if (
        questionRow &&
        (game.phase === "REVEAL" ||
          game.phase === "SCOREBOARD" ||
          game.phase === "FINAL_RESULTS")
      ) {
        if (questionRow.status === "skipped") {
          revealView = {
            skipped: true,
            options: [],
            points: [],
          };
        } else {
          const optsWithDetails = await db.query<{
            id: string;
            opaque_id: string;
            option_text: string;
            is_correct: boolean;
            display_order: number;
          }>(
            `select id, opaque_id, option_text, is_correct, display_order
               from answer_options
              where question_id = $1
              order by display_order asc`,
            [questionRow.id],
          );

          const authorsRows = await db.query<{
            option_id: string;
            player_id: string;
            nickname: string;
          }>(
            `select oa.option_id, p.id as player_id, p.nickname
               from option_authors oa
               join players p on p.id = oa.player_id
               join answer_options ao on ao.id = oa.option_id
              where ao.question_id = $1`,
            [questionRow.id],
          );

          const votesRows = await db.query<{
            answer_option_id: string;
            voter_player_id: string;
          }>(`select answer_option_id, voter_player_id from votes where question_id = $1`, [
            questionRow.id,
          ]);

          const revealOptions: RevealOptionView[] = optsWithDetails.map((o) => {
            const authors = authorsRows
              .filter((a) => a.option_id === o.id)
              .map((a) => ({ id: a.player_id, nickname: a.nickname }));
            const voters = votesRows
              .filter((v) => v.answer_option_id === o.id)
              .map((v) => v.voter_player_id);
            return {
              id: o.opaque_id,
              text: o.option_text,
              isCorrect: o.is_correct,
              authors,
              voterIds: voters,
            };
          });

          const roundPoints = await db.query<{
            player_id: string;
            points_earned: number;
            correct_guess: boolean;
            fooled_points: number;
          }>(
            `select player_id, points_earned, correct_guess, fooled_points
               from round_results
              where question_id = $1`,
            [questionRow.id],
          );

          const pointsView: RoundPointsView[] = roundPoints.map((rp) => ({
            playerId: rp.player_id,
            points: rp.points_earned,
            correctGuess: rp.correct_guess,
            fooledPoints: rp.fooled_points,
          }));

          revealView = {
            skipped: false,
            options: revealOptions,
            points: pointsView,
          };
        }
      }

      // Standings
      const ranked = rankPlayers(
        gamePlayers.map((gp) => {
          const p = allPlayers.find((pl) => pl.id === gp.player_id);
          return {
            playerId: gp.player_id,
            nickname: p?.nickname ?? "Bilinmeyen",
            score: gp.score,
            correctCount: gp.correct_count,
            fooledPoints: gp.fooled_points,
            hasLeft: !!p?.left_at,
          };
        }),
      );

      const standings: StandingView[] = ranked.map((r) => ({
        playerId: r.item.playerId,
        nickname: r.item.nickname,
        rank: r.rank,
        score: r.item.score,
        correctCount: r.item.correctCount,
        fooledPoints: r.item.fooledPoints,
        hasLeft: r.item.hasLeft,
      }));

      gameView = {
        id: game.id,
        status: game.status,
        phase: game.phase,
        round: game.current_round,
        totalRounds: game.total_rounds,
        phaseStartedAt: game.phase_started_at.toISOString(),
        phaseDeadline: game.phase_deadline ? game.phase_deadline.toISOString() : null,
        questionSource: game.question_source,
        question: qView,
        participantIds,
        progress: {
          ownerAnswered,
          submittedIds,
          votedIds,
          requiredIds: requiredForSub,
        },
        my: {
          isParticipant,
          isOwner,
          canSubmitTrueAnswer:
            isParticipant && isOwner && game.phase === "QUESTION_INTRO" && !ownerAnswered,
          canSubmitFake:
            isParticipant && !isOwner && game.phase === "ANSWER_SUBMISSION",
          canVote:
            isParticipant && !isOwner && game.phase === "VOTING",
          trueAnswer: myTrueAnswer,
          submission: mySubmission,
          voteOptionId: myVoteOptionId,
        },
        options: optionsView,
        reveal: revealView,
        standings,
      };
    }
  }

  const now = new Date().toISOString();
  return {
    serverTime: now,
    version: Number(room.version),
    realtime: {
      mode: realtimeMode(),
      topic: roomTopic(room.id),
    },
    room: {
      id: room.id,
      code: room.code,
      status: room.status,
      hostPlayerId: room.host_player_id,
      maxPlayers: room.max_players,
      minPlayers: 4,
    },
    me: {
      id: me.id,
      nickname: me.nickname,
      isHost: me.id === room.host_player_id,
    },
    players: playersView,
    game: gameView,
  };
}
