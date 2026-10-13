/**
 * Server-authoritative room & game service.
 *
 * Every mutation runs inside ONE database transaction that first locks the
 * room row (`SELECT … FOR UPDATE`). This serialises all state changes of a
 * room, making phase transitions atomic: if two requests try to advance the
 * same phase, the second one sees the already-updated phase and does nothing.
 */
import { randomUUID } from "node:crypto";
import { GAME_CONFIG, getDurations } from "../config";
import { distributeOwners } from "../game/distribution";
import { randomString } from "../game/random";
import { buildOptions, scoreRound } from "../game/scoring";
import { assertTransition } from "../game/stateMachine";
import { nicknameKey, validateAnswerText, validateNickname } from "../game/text";
import type { GamePhase, RoomStatus } from "../game/types";
import { fallbackPlan, generateQuestionPlan, type QuestionPlan } from "../questions/generator";
import { getDb, type Db, type Sql } from "./db";
import { AppError } from "./errors";
import { consumeRateLimit } from "./rateLimit";
import { publishRoomUpdate } from "./realtime";
import { issueSession, sessionHashMatches, verifySessionToken, type SessionClaims } from "./session";

/* --------------------------------- rows --------------------------------- */

export interface RoomRow {
  id: string;
  code: string;
  host_player_id: string | null;
  status: RoomStatus;
  current_game_id: string | null;
  current_round: number;
  max_players: number;
  version: number | string;
}

export interface PlayerRow {
  id: string;
  room_id: string;
  nickname: string;
  seat_order: number;
  is_ready: boolean;
  total_score: number;
  left_at: Date | null;
  session_hash: string;
  connected: boolean;
}

export interface GameRow {
  id: string;
  room_id: string;
  status: "active" | "finished" | "aborted";
  phase: GamePhase;
  total_rounds: number;
  current_round: number;
  phase_started_at: Date;
  phase_deadline: Date | null;
  question_source: string | null;
  expired: boolean;
}

export interface QuestionRow {
  id: string;
  game_id: string;
  round_number: number;
  owner_player_id: string;
  question_text: string;
  category: string;
  status: "pending" | "answering" | "voting" | "revealed" | "skipped";
  scored_at: Date | null;
}

const CONN = GAME_CONFIG.connectionTimeoutSeconds;
export const ROOM_COLS = `id, code, host_player_id, status, current_game_id, current_round, max_players, version`;
export const PLAYER_COLS = `id, room_id, nickname, seat_order, is_ready, total_score, left_at, session_hash,
  (last_seen_at > now() - make_interval(secs => ${CONN})) as connected`;
export const GAME_COLS = `id, room_id, status, phase, total_rounds, current_round, phase_started_at, phase_deadline,
  question_source, (phase_deadline is not null and phase_deadline <= now()) as expired`;
export const QUESTION_COLS = `id, game_id, round_number, owner_player_id, question_text, category, status, scored_at`;

const CODE_RE = /^[A-HJKMNP-Z2-9]{6}$/;

export function normalizeRoomCode(raw: unknown): string {
  const code = typeof raw === "string" ? raw.trim().toUpperCase() : "";
  if (!CODE_RE.test(code)) throw new AppError("BAD_REQUEST", "Geçersiz oda kodu. Kod 6 karakterden oluşur.");
  return code;
}

function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "23505";
}

/* ------------------------------ transactions ----------------------------- */

interface Ctx {
  sql: Sql;
  room: RoomRow;
  bumped: boolean;
  deleted: boolean;
}

/**
 * Run `fn` with the room row locked. Bumps the room version and publishes a
 * realtime signal after commit if anything changed. AppErrors thrown by `fn`
 * do NOT roll back maintenance work done before validation (actions validate
 * before writing), they are re-thrown after commit.
 */
async function mutateRoom<T>(code: string, fn: (ctx: Ctx) => Promise<T>): Promise<T> {
  const db = await getDb();
  let appError: AppError | null = null;
  let publish: { roomId: string; version: number } | null = null;
  const result = await db.tx(async (sql) => {
    const rooms = await sql.query<RoomRow>(`select ${ROOM_COLS} from rooms where code = $1 for update`, [code]);
    const room = rooms[0];
    if (!room) throw new AppError("ROOM_NOT_FOUND", "Bu kodla bir oda bulunamadı. Kodu kontrol et.");
    const ctx: Ctx = { sql, room, bumped: false, deleted: false };
    let out: T | undefined;
    try {
      out = await fn(ctx);
    } catch (e) {
      if (e instanceof AppError) appError = e;
      else throw e;
    }
    if (ctx.bumped && !ctx.deleted) {
      const r = await sql.query<{ version: number | string }>(
        `update rooms set version = version + 1, updated_at = now(), last_activity_at = now()
         where id = $1 returning version`,
        [room.id],
      );
      publish = { roomId: room.id, version: Number(r[0].version) };
    }
    return out as T;
  });
  if (publish) {
    const p = publish as { roomId: string; version: number };
    await publishRoomUpdate(p.roomId, p.version);
  }
  if (appError) throw appError;
  return result;
}

async function logEvent(ctx: Ctx, gameId: string | null, type: string, payload: Record<string, unknown> = {}) {
  await ctx.sql.query(`insert into game_events (room_id, game_id, type, payload) values ($1, $2, $3, $4::jsonb)`, [
    ctx.room.id,
    gameId,
    type,
    JSON.stringify(payload),
  ]);
}

async function requirePlayer(ctx: Ctx, claims: SessionClaims): Promise<PlayerRow> {
  if (claims.roomId !== ctx.room.id) throw new AppError("UNAUTHORIZED", "Bu odaya ait bir oturumun yok.");
  const rows = await ctx.sql.query<PlayerRow>(`select ${PLAYER_COLS} from players where id = $1 and room_id = $2`, [
    claims.playerId,
    ctx.room.id,
  ]);
  const me = rows[0];
  if (!me || !sessionHashMatches(claims.sid, me.session_hash)) {
    throw new AppError("UNAUTHORIZED", "Oturumun doğrulanamadı. Lütfen odaya yeniden katıl.");
  }
  if (me.left_at) throw new AppError("UNAUTHORIZED", "Bu odadan ayrıldın. Tekrar katılmak için yeniden giriş yap.");
  return me;
}

async function loadCurrentGame(ctx: Ctx): Promise<GameRow | null> {
  if (!ctx.room.current_game_id) return null;
  const rows = await ctx.sql.query<GameRow>(`select ${GAME_COLS} from games where id = $1`, [ctx.room.current_game_id]);
  return rows[0] ?? null;
}

async function loadQuestion(sql: Sql, gameId: string, round: number): Promise<QuestionRow | null> {
  if (round < 1) return null;
  const rows = await sql.query<QuestionRow>(
    `select ${QUESTION_COLS} from questions where game_id = $1 and round_number = $2`,
    [gameId, round],
  );
  return rows[0] ?? null;
}

interface ParticipantRow {
  player_id: string;
  left_at: Date | null;
  connected: boolean;
  seat_order: number;
}

async function loadParticipants(sql: Sql, gameId: string): Promise<ParticipantRow[]> {
  return sql.query<ParticipantRow>(
    `select gp.player_id, p.left_at, p.seat_order,
            (p.last_seen_at > now() - make_interval(secs => ${CONN})) as connected
       from game_players gp join players p on p.id = gp.player_id
      where gp.game_id = $1 order by p.seat_order`,
    [gameId],
  );
}

async function activePlayers(ctx: Ctx): Promise<PlayerRow[]> {
  return ctx.sql.query<PlayerRow>(
    `select ${PLAYER_COLS} from players where room_id = $1 and left_at is null order by seat_order`,
    [ctx.room.id],
  );
}

/* ------------------------------ transitions ------------------------------ */

async function setPhase(ctx: Ctx, game: GameRow, to: GamePhase, seconds: number | null) {
  assertTransition(game.phase, to);
  await ctx.sql.query(
    `update games set phase = $2, phase_started_at = now(),
       phase_deadline = case when $3::int is null then null else now() + make_interval(secs => $3::int) end
     where id = $1`,
    [game.id, to, seconds],
  );
  await logEvent(ctx, game.id, "phase", { from: game.phase, to, round: game.current_round });
  game.phase = to;
  ctx.bumped = true;
}

async function insertPlanAndBegin(ctx: Ctx, game: GameRow, plan: QuestionPlan) {
  const existing = await ctx.sql.query<{ n: number }>(`select count(*)::int as n from questions where game_id = $1`, [
    game.id,
  ]);
  if (Number(existing[0].n) === 0) {
    const participants = (await loadParticipants(ctx.sql, game.id)).filter((p) => !p.left_at);
    const owners = distributeOwners(
      participants.map((p) => p.player_id),
      game.total_rounds,
    );
    for (let i = 0; i < game.total_rounds; i++) {
      const q = plan.questions[i] ?? fallbackPlan(game.total_rounds).questions[i];
      await ctx.sql.query(
        `insert into questions (game_id, round_number, owner_player_id, question_text, category, source)
         values ($1, $2, $3, $4, $5, $6)`,
        [game.id, i + 1, owners[i], q.text, q.category, q.source],
      );
    }
    await ctx.sql.query(`update games set question_source = $2 where id = $1`, [game.id, plan.source]);
    await logEvent(ctx, game.id, "questions_generated", { source: plan.source, aiError: plan.aiError ?? null });
  }
  await beginRound(ctx, game, 1);
}

async function beginRound(ctx: Ctx, game: GameRow, round: number) {
  await ctx.sql.query(`update games set current_round = $2 where id = $1`, [game.id, round]);
  await ctx.sql.query(`update rooms set current_round = $2 where id = $1`, [ctx.room.id, round]);
  await ctx.sql.query(
    `update questions set status = 'answering' where game_id = $1 and round_number = $2 and status = 'pending'`,
    [game.id, round],
  );
  game.current_round = round;
  await setPhase(ctx, game, "QUESTION_INTRO", getDurations().trueAnswer);
}

async function skipQuestion(ctx: Ctx, game: GameRow, q: QuestionRow | null, reason: string) {
  if (q) {
    await ctx.sql.query(`update questions set status = 'skipped' where id = $1 and status in ('pending','answering')`, [
      q.id,
    ]);
  }
  await logEvent(ctx, game.id, "question_skipped", { round: game.current_round, reason });
  await setPhase(ctx, game, "SCOREBOARD", getDurations().scoreboard);
}

interface SubmissionRow {
  id: string;
  player_id: string;
  answer_text: string;
  normalized_text: string;
  is_correct: boolean;
  created_at: Date;
}

async function openVoting(ctx: Ctx, game: GameRow, q: QuestionRow) {
  const subs = await ctx.sql.query<SubmissionRow>(
    `select s.id, s.player_id, s.answer_text, s.normalized_text, s.is_correct, s.created_at
       from submissions s join game_players gp on gp.player_id = s.player_id and gp.game_id = $2
      where s.question_id = $1`,
    [q.id, game.id],
  );
  const correct = subs.find((s) => s.is_correct);
  if (!correct) return skipQuestion(ctx, game, q, "no_true_answer");
  const existing = await ctx.sql.query<{ n: number }>(
    `select count(*)::int as n from answer_options where question_id = $1`,
    [q.id],
  );
  if (Number(existing[0].n) === 0) {
    const fakes = subs.filter((s) => !s.is_correct && s.player_id !== q.owner_player_id);
    const built = buildOptions(
      correct.answer_text,
      fakes.map((f) => ({ playerId: f.player_id, text: f.answer_text, createdAt: f.created_at })),
    );
    for (const o of built) {
      const rows = await ctx.sql.query<{ id: string }>(
        `insert into answer_options (question_id, opaque_id, display_order, option_text, normalized_text, is_correct)
         values ($1, $2, $3, $4, $5, $6) returning id`,
        [q.id, o.opaqueId, o.displayOrder, o.text, o.normalized, o.isCorrect],
      );
      for (const authorId of o.authorIds) {
        const sub = fakes.find((f) => f.player_id === authorId)!;
        await ctx.sql.query(`insert into option_authors (option_id, submission_id, player_id) values ($1, $2, $3)`, [
          rows[0].id,
          sub.id,
          authorId,
        ]);
      }
    }
  }
  await ctx.sql.query(`update questions set status = 'voting' where id = $1`, [q.id]);
  await setPhase(ctx, game, "VOTING", getDurations().voting);
}

/**
 * Score the round exactly once. `scored_at is null` claim + unique
 * (question_id, player_id) on round_results make this idempotent.
 */
export async function scoreQuestionOnce(sql: Sql, game: { id: string }, q: QuestionRow): Promise<boolean> {
  const claimed = await sql.query<{ id: string }>(
    `update questions set scored_at = now(), status = 'revealed' where id = $1 and scored_at is null returning id`,
    [q.id],
  );
  if (claimed.length === 0) return false;
  const options = await sql.query<{ id: string; is_correct: boolean }>(
    `select id, is_correct from answer_options where question_id = $1`,
    [q.id],
  );
  const authors = await sql.query<{ option_id: string; player_id: string }>(
    `select a.option_id, a.player_id from option_authors a join answer_options o on o.id = a.option_id
      where o.question_id = $1`,
    [q.id],
  );
  const votes = await sql.query<{ voter_player_id: string; answer_option_id: string }>(
    `select voter_player_id, answer_option_id from votes where question_id = $1 order by created_at, voter_player_id`,
    [q.id],
  );
  const participants = await sql.query<{ player_id: string }>(`select player_id from game_players where game_id = $1`, [
    game.id,
  ]);
  const participantIds = participants.map((p) => p.player_id);
  const scores = scoreRound({
    ownerId: q.owner_player_id,
    participantIds,
    eligibleVoterIds: participantIds.filter((id) => id !== q.owner_player_id),
    options: options.map((o) => ({
      id: o.id,
      isCorrect: o.is_correct,
      authorIds: authors.filter((a) => a.option_id === o.id).map((a) => a.player_id),
    })),
    votes: votes.map((v) => ({ voterId: v.voter_player_id, optionId: v.answer_option_id })),
  });
  for (const s of scores) {
    if (!participantIds.includes(s.playerId)) continue;
    const inserted = await sql.query<{ id: string }>(
      `insert into round_results (game_id, question_id, player_id, points_earned, correct_guess, fooled_points)
       values ($1, $2, $3, $4, $5, $6) on conflict (question_id, player_id) do nothing returning id`,
      [game.id, q.id, s.playerId, s.points, s.correctGuess, s.fooledPoints],
    );
    if (inserted.length === 0) continue;
    await sql.query(
      `update game_players set score = score + $3, correct_count = correct_count + $4, fooled_points = fooled_points + $5
        where game_id = $1 and player_id = $2`,
      [game.id, s.playerId, s.points, s.correctGuess ? 1 : 0, s.fooledPoints],
    );
    await sql.query(
      `update players set total_score = (select score from game_players where game_id = $1 and player_id = $2)
        where id = $2`,
      [game.id, s.playerId],
    );
  }
  return true;
}

async function revealRound(ctx: Ctx, game: GameRow, q: QuestionRow) {
  await scoreQuestionOnce(ctx.sql, game, q);
  await logEvent(ctx, game.id, "round_scored", { round: game.current_round });
  await setPhase(ctx, game, "REVEAL", getDurations().reveal);
}

async function nextRoundOrFinish(ctx: Ctx, game: GameRow) {
  if (game.current_round >= game.total_rounds) return finishGame(ctx, game, "completed");
  return beginRound(ctx, game, game.current_round + 1);
}

async function finishGame(ctx: Ctx, game: GameRow, reason: string) {
  await setPhase(ctx, game, "FINAL_RESULTS", null);
  await ctx.sql.query(`update games set status = 'finished', finished_at = now() where id = $1`, [game.id]);
  await ctx.sql.query(`update rooms set status = 'finished' where id = $1`, [ctx.room.id]);
  await ctx.sql.query(`update players set is_ready = false where room_id = $1`, [ctx.room.id]);
  ctx.room.status = "finished";
  game.status = "finished";
  await logEvent(ctx, game.id, "game_finished", { reason });
}

async function onTimeout(ctx: Ctx, game: GameRow, q: QuestionRow | null) {
  switch (game.phase) {
    case "GENERATING_QUESTIONS":
      return insertPlanAndBegin(ctx, game, fallbackPlan(game.total_rounds));
    case "QUESTION_INTRO":
      return skipQuestion(ctx, game, q, "owner_timeout");
    case "ANSWER_SUBMISSION":
      return q ? openVoting(ctx, game, q) : skipQuestion(ctx, game, q, "missing_question");
    case "VOTING":
      return q ? revealRound(ctx, game, q) : skipQuestion(ctx, game, q, "missing_question");
    case "REVEAL":
      return setPhase(ctx, game, "SCOREBOARD", getDurations().scoreboard);
    case "SCOREBOARD":
      return nextRoundOrFinish(ctx, game);
    case "FINAL_RESULTS":
      return;
  }
}

function requiredIds(participants: ParticipantRow[], ownerId: string): string[] {
  return participants.filter((p) => !p.left_at && p.connected && p.player_id !== ownerId).map((p) => p.player_id);
}

/** Apply at most one automatic transition. Returns true if something changed. */
async function stepOnce(ctx: Ctx, game: GameRow): Promise<boolean> {
  if (game.status !== "active") return false;
  const participants = await loadParticipants(ctx.sql, game.id);
  const active = participants.filter((p) => !p.left_at);
  if (active.length < 3) {
    await finishGame(ctx, game, "not_enough_players");
    return true;
  }
  const q = await loadQuestion(ctx.sql, game.id, game.current_round);
  if (game.expired) {
    await onTimeout(ctx, game, q);
    return true;
  }
  if (!q) return false;
  if (game.phase === "QUESTION_INTRO") {
    const owner = participants.find((p) => p.player_id === q.owner_player_id);
    if (!owner || owner.left_at) {
      await skipQuestion(ctx, game, q, "owner_left");
      return true;
    }
  }
  if (game.phase === "ANSWER_SUBMISSION" || game.phase === "VOTING") {
    const required = requiredIds(participants, q.owner_player_id);
    if (required.length === 0) return false;
    const done =
      game.phase === "ANSWER_SUBMISSION"
        ? await ctx.sql.query<{ player_id: string }>(
            `select player_id from submissions where question_id = $1 and is_correct = false`,
            [q.id],
          )
        : await ctx.sql.query<{ player_id: string }>(
            `select voter_player_id as player_id from votes where question_id = $1`,
            [q.id],
          );
    const doneSet = new Set(done.map((d) => d.player_id));
    if (required.every((id) => doneSet.has(id))) {
      if (game.phase === "ANSWER_SUBMISSION") await openVoting(ctx, game, q);
      else await revealRound(ctx, game, q);
      return true;
    }
  }
  return false;
}

async function autoProgress(ctx: Ctx) {
  for (let i = 0; i < 6; i++) {
    const game = await loadCurrentGame(ctx);
    if (!game) return;
    if (!(await stepOnce(ctx, game))) return;
  }
}

/** Transfer host if missing, left, or disconnected for too long. */
async function ensureHost(ctx: Ctx) {
  const rows = await ctx.sql.query<{ id: string; left_at: Date | null; stale: boolean }>(
    `select id, left_at, (last_seen_at < now() - make_interval(secs => ${GAME_CONFIG.hostTransferAfterSeconds})) as stale
       from players where id = $1`,
    [ctx.room.host_player_id],
  );
  const host = rows[0];
  if (host && !host.left_at && !host.stale) return;
  const candidates = await ctx.sql.query<{ id: string }>(
    `select id from players where room_id = $1 and left_at is null
         and last_seen_at > now() - make_interval(secs => ${CONN})
         and id <> coalesce($2::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
       order by seat_order limit 1`,
    [ctx.room.id, host?.id ?? null],
  );
  const next = candidates[0];
  if (!next) return;
  await ctx.sql.query(`update rooms set host_player_id = $2 where id = $1`, [ctx.room.id, next.id]);
  ctx.room.host_player_id = next.id;
  await logEvent(ctx, ctx.room.current_game_id, "host_transferred", { from: host?.id ?? null, to: next.id });
  ctx.bumped = true;
}

async function maintain(ctx: Ctx) {
  await ensureHost(ctx);
  await autoProgress(ctx);
}

/* ------------------------------ public API ------------------------------- */

export interface SessionResult {
  code: string;
  roomId: string;
  playerId: string;
  token: string;
}

export async function createRoom(input: { nickname: unknown; ip: string }): Promise<SessionResult> {
  const nick = validateNickname(input.nickname, GAME_CONFIG.nickname.min, GAME_CONFIG.nickname.max);
  if (!nick.ok) throw new AppError("BAD_REQUEST", nick.error);
  const db = await getDb();
  await consumeRateLimit(db, `create:${input.ip}`, 6, 60);
  if (Math.random() < 0.05) void runCleanup(db).catch(() => {});
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = randomString(GAME_CONFIG.roomCodeLength, GAME_CONFIG.roomCodeAlphabet);
    try {
      return await db.tx(async (sql) => {
        const rooms = await sql.query<{ id: string }>(
          `insert into rooms (code, max_players) values ($1, $2) returning id`,
          [code, GAME_CONFIG.maxPlayers],
        );
        const roomId = rooms[0].id;
        const playerId = randomUUID();
        const { token, sessionHash } = await issueSession(playerId, roomId);
        await sql.query(
          `insert into players (id, room_id, nickname, nickname_key, session_hash, seat_order) values ($1, $2, $3, $4, $5, 0)`,
          [playerId, roomId, nick.value, nicknameKey(nick.value), sessionHash],
        );
        await sql.query(`update rooms set host_player_id = $2 where id = $1`, [roomId, playerId]);
        await sql.query(`insert into game_events (room_id, type, payload) values ($1, 'room_created', '{}'::jsonb)`, [
          roomId,
        ]);
        return { code, roomId, playerId, token };
      });
    } catch (e) {
      if (isUniqueViolation(e)) continue; // room code collision -> retry
      throw e;
    }
  }
  throw new AppError("INTERNAL", "Oda kodu oluşturulamadı. Lütfen tekrar dene.");
}

export async function joinRoom(input: { code: unknown; nickname: unknown; ip: string }): Promise<SessionResult> {
  const code = normalizeRoomCode(input.code);
  const nick = validateNickname(input.nickname, GAME_CONFIG.nickname.min, GAME_CONFIG.nickname.max);
  if (!nick.ok) throw new AppError("BAD_REQUEST", nick.error);
  const db = await getDb();
  await consumeRateLimit(db, `join:${input.ip}`, 20, 60);
  return mutateRoom(code, async (ctx) => {
    if (ctx.room.status === "playing") {
      throw new AppError("GAME_IN_PROGRESS", "Bu odada oyun devam ediyor. Oyun bitince katılabilirsin.");
    }
    const active = await activePlayers(ctx);
    if (active.length >= ctx.room.max_players) {
      throw new AppError("ROOM_FULL", `Oda dolu (en fazla ${ctx.room.max_players} oyuncu).`);
    }
    const key = nicknameKey(nick.value);
    const taken = await ctx.sql.query(
      `select 1 from players where room_id = $1 and nickname_key = $2 and left_at is null`,
      [ctx.room.id, key],
    );
    if (taken.length > 0) {
      throw new AppError("NICKNAME_TAKEN", "Bu takma ad bu odada kullanılıyor. Başka bir isim seç.");
    }
    const seat = await ctx.sql.query<{ s: number }>(
      `select coalesce(max(seat_order), -1)::int + 1 as s from players where room_id = $1`,
      [ctx.room.id],
    );
    const playerId = randomUUID();
    const { token, sessionHash } = await issueSession(playerId, ctx.room.id);
    await ctx.sql.query(
      `insert into players (id, room_id, nickname, nickname_key, session_hash, seat_order) values ($1, $2, $3, $4, $5, $6)`,
      [playerId, ctx.room.id, nick.value, key, sessionHash, Number(seat[0].s)],
    );
    if (!ctx.room.host_player_id) {
      await ctx.sql.query(`update rooms set host_player_id = $2 where id = $1`, [ctx.room.id, playerId]);
    }
    await logEvent(ctx, null, "player_joined", { playerId });
    ctx.bumped = true;
    return { code, roomId: ctx.room.id, playerId, token };
  });
}

export type GameAction =
  | { type: "ready"; ready: boolean }
  | { type: "start" }
  | { type: "backToLobby" }
  | { type: "trueAnswer"; questionId: string; text: string }
  | { type: "fakeAnswer"; questionId: string; text: string }
  | { type: "vote"; questionId: string; optionId: string }
  | { type: "advance"; fromPhase: GamePhase; round: number }
  | { type: "leave" };

function requireActive(game: GameRow | null): GameRow {
  if (!game || game.status !== "active") throw new AppError("WRONG_PHASE", "Şu anda devam eden bir oyun yok.");
  return game;
}

async function requireCurrentQuestion(ctx: Ctx, game: GameRow, questionId: string): Promise<QuestionRow> {
  const q = await loadQuestion(ctx.sql, game.id, game.current_round);
  if (!q || q.id !== questionId) throw new AppError("STALE_QUESTION", "Bu soru artık aktif değil.");
  return q;
}

async function requireParticipant(ctx: Ctx, game: GameRow, playerId: string) {
  const rows = await ctx.sql.query(`select 1 from game_players where game_id = $1 and player_id = $2`, [
    game.id,
    playerId,
  ]);
  if (rows.length === 0) throw new AppError("NOT_PARTICIPANT", "Bu oyunda oyuncu değilsin; sadece izleyebilirsin.");
}

function requireHost(ctx: Ctx, me: PlayerRow) {
  if (ctx.room.host_player_id !== me.id) throw new AppError("NOT_HOST", "Bu işlemi yalnızca oda sahibi yapabilir.");
}

async function applyAction(ctx: Ctx, me: PlayerRow, action: GameAction): Promise<{ startedGameId?: string }> {
  const d = getDurations();
  switch (action.type) {
    case "ready": {
      if (ctx.room.status === "playing") throw new AppError("WRONG_PHASE", "Oyun zaten başladı.");
      await ctx.sql.query(`update players set is_ready = $2 where id = $1`, [me.id, action.ready]);
      ctx.bumped = true;
      return {};
    }
    case "backToLobby": {
      requireHost(ctx, me);
      if (ctx.room.status !== "finished") return {};
      await ctx.sql.query(`update rooms set status = 'lobby', current_game_id = null, current_round = 0 where id = $1`, [
        ctx.room.id,
      ]);
      await ctx.sql.query(`update players set total_score = 0, is_ready = false where room_id = $1`, [ctx.room.id]);
      ctx.bumped = true;
      return {};
    }
    case "start": {
      requireHost(ctx, me);
      if (ctx.room.status === "playing") throw new AppError("GAME_IN_PROGRESS", "Oyun zaten başladı.");
      const players = await activePlayers(ctx);
      if (players.length < GAME_CONFIG.minPlayers) {
        throw new AppError(
          "NOT_ENOUGH_PLAYERS",
          `Oyunu başlatmak için en az ${GAME_CONFIG.minPlayers} oyuncu gerekli (şu an ${players.length}).`,
        );
      }
      if (players.length > ctx.room.max_players) throw new AppError("ROOM_FULL", "Oyuncu sayısı sınırı aşıldı.");
      const games = await ctx.sql.query<{ id: string }>(
        `insert into games (room_id, phase, phase_deadline)
         values ($1, 'GENERATING_QUESTIONS', now() + make_interval(secs => $2::int)) returning id`,
        [ctx.room.id, d.generatingQuestions],
      );
      const gameId = games[0].id;
      for (const p of players) {
        await ctx.sql.query(`insert into game_players (game_id, player_id) values ($1, $2)`, [gameId, p.id]);
      }
      // A new game never inherits the previous game's scores.
      await ctx.sql.query(`update players set total_score = 0, is_ready = false where room_id = $1`, [ctx.room.id]);
      await ctx.sql.query(
        `update rooms set status = 'playing', current_game_id = $2, current_round = 0 where id = $1`,
        [ctx.room.id, gameId],
      );
      ctx.room.status = "playing";
      ctx.room.current_game_id = gameId;
      await logEvent(ctx, gameId, "game_started", { players: players.length });
      ctx.bumped = true;
      return { startedGameId: gameId };
    }
    case "trueAnswer": {
      const game = requireActive(await loadCurrentGame(ctx));
      const q = await requireCurrentQuestion(ctx, game, action.questionId);
      if (q.owner_player_id !== me.id) {
        throw new AppError("FORBIDDEN", "Bu sorunun gerçek cevabını yalnızca soru sahibi yazabilir.");
      }
      if (game.phase !== "QUESTION_INTRO") {
        const mine = await ctx.sql.query(`select 1 from submissions where question_id = $1 and player_id = $2`, [
          q.id,
          me.id,
        ]);
        if (mine.length > 0) return {}; // idempotent retry
        throw new AppError("PHASE_CLOSED", "Gerçek cevap aşaması kapandı.");
      }
      if (game.expired) throw new AppError("PHASE_CLOSED", "Süre doldu.");
      const v = validateAnswerText(action.text, GAME_CONFIG.answer.max);
      if (!v.ok) throw new AppError("BAD_REQUEST", v.error);
      await ctx.sql.query(
        `insert into submissions (question_id, player_id, answer_text, normalized_text, is_correct)
         values ($1, $2, $3, $4, true) on conflict (question_id, player_id) do nothing`,
        [q.id, me.id, v.value, v.normalized],
      );
      await setPhase(ctx, game, "ANSWER_SUBMISSION", d.fakeAnswers);
      return {};
    }
    case "fakeAnswer": {
      const game = requireActive(await loadCurrentGame(ctx));
      const q = await requireCurrentQuestion(ctx, game, action.questionId);
      if (game.phase === "QUESTION_INTRO") {
        throw new AppError("WRONG_PHASE", "Soru sahibi henüz gerçek cevabını yazmadı.");
      }
      if (game.phase !== "ANSWER_SUBMISSION" || game.expired) {
        throw new AppError("PHASE_CLOSED", "Cevap aşaması kapandı.");
      }
      await requireParticipant(ctx, game, me.id);
      if (q.owner_player_id === me.id) {
        throw new AppError("FORBIDDEN", "Bu soru senin hakkında; gerçek cevabını zaten yazdın.");
      }
      const v = validateAnswerText(action.text, GAME_CONFIG.answer.max);
      if (!v.ok) throw new AppError("BAD_REQUEST", v.error);
      const correct = await ctx.sql.query<{ normalized_text: string }>(
        `select normalized_text from submissions where question_id = $1 and is_correct`,
        [q.id],
      );
      if (correct[0] && correct[0].normalized_text === v.normalized) {
        throw new AppError("MATCHES_TRUTH", "Bu cevap gerçek cevabın ta kendisi! Başka bir yalan uydur.");
      }
      await ctx.sql.query(
        `insert into submissions (question_id, player_id, answer_text, normalized_text, is_correct)
         values ($1, $2, $3, $4, false)
         on conflict (question_id, player_id) do update
           set answer_text = excluded.answer_text, normalized_text = excluded.normalized_text, updated_at = now()
           where submissions.is_correct = false`,
        [q.id, me.id, v.value, v.normalized],
      );
      ctx.bumped = true;
      return {};
    }
    case "vote": {
      const game = requireActive(await loadCurrentGame(ctx));
      const q = await requireCurrentQuestion(ctx, game, action.questionId);
      if (game.phase !== "VOTING" || game.expired) throw new AppError("PHASE_CLOSED", "Oylama kapandı.");
      await requireParticipant(ctx, game, me.id);
      if (q.owner_player_id === me.id) throw new AppError("OWNER_CANNOT_VOTE", "Kendi sorunda oy kullanamazsın.");
      const opts = await ctx.sql.query<{ id: string }>(
        `select id from answer_options where question_id = $1 and opaque_id = $2`,
        [q.id, action.optionId],
      );
      if (!opts[0]) throw new AppError("INVALID_OPTION", "Geçersiz seçenek.");
      const own = await ctx.sql.query(`select 1 from option_authors where option_id = $1 and player_id = $2`, [
        opts[0].id,
        me.id,
      ]);
      if (own.length > 0) throw new AppError("OWN_ANSWER", "Kendi yazdığın cevaba oy veremezsin.");
      await ctx.sql.query(
        `insert into votes (question_id, voter_player_id, answer_option_id) values ($1, $2, $3)
         on conflict (question_id, voter_player_id) do update
           set answer_option_id = excluded.answer_option_id, updated_at = now()`,
        [q.id, me.id, opts[0].id],
      );
      ctx.bumped = true;
      return {};
    }
    case "advance": {
      requireHost(ctx, me);
      const game = requireActive(await loadCurrentGame(ctx));
      // Idempotency: a double click / retry for an already-left phase is a no-op.
      if (game.phase !== action.fromPhase || game.current_round !== action.round) return {};
      const q = await loadQuestion(ctx.sql, game.id, game.current_round);
      switch (game.phase) {
        case "QUESTION_INTRO":
          await skipQuestion(ctx, game, q, "host_skipped");
          break;
        case "ANSWER_SUBMISSION":
          if (q) await openVoting(ctx, game, q);
          break;
        case "VOTING":
          if (q) await revealRound(ctx, game, q);
          break;
        case "REVEAL":
          await setPhase(ctx, game, "SCOREBOARD", d.scoreboard);
          break;
        case "SCOREBOARD":
          await nextRoundOrFinish(ctx, game);
          break;
        default:
          break;
      }
      return {};
    }
    case "leave": {
      await ctx.sql.query(`update players set left_at = now(), is_ready = false where id = $1`, [me.id]);
      await logEvent(ctx, ctx.room.current_game_id, "player_left", { playerId: me.id });
      const remaining = await activePlayers(ctx);
      if (remaining.length === 0) {
        await ctx.sql.query(`delete from rooms where id = $1`, [ctx.room.id]);
        ctx.deleted = true;
        return {};
      }
      if (ctx.room.host_player_id === me.id) {
        const next = remaining.find((p) => p.connected) ?? remaining[0];
        await ctx.sql.query(`update rooms set host_player_id = $2 where id = $1`, [ctx.room.id, next.id]);
        ctx.room.host_player_id = next.id;
        await logEvent(ctx, ctx.room.current_game_id, "host_transferred", { from: me.id, to: next.id });
      }
      ctx.bumped = true;
      return {};
    }
  }
}

export async function performAction(input: { code: unknown; token: string | null; action: GameAction }) {
  const code = normalizeRoomCode(input.code);
  const claims = await verifySessionToken(input.token);
  const db = await getDb();
  await consumeRateLimit(db, `act:${claims.playerId}`, 40, 10);
  const result = await mutateRoom(code, async (ctx) => {
    const me = await requirePlayer(ctx, claims);
    await ctx.sql.query(`update players set last_seen_at = now() where id = $1`, [me.id]);
    await maintain(ctx);
    const r = await applyAction(ctx, me, input.action);
    if (!ctx.deleted) await autoProgress(ctx);
    return r;
  });
  if (result.startedGameId) {
    await completeQuestionGeneration(code, result.startedGameId);
  }
  return { ok: true as const };
}

/**
 * Generate questions OUTSIDE the room lock (the AI call can take seconds),
 * then atomically store them and start round 1. If this never completes
 * (crash, timeout), the GENERATING_QUESTIONS deadline makes any later request
 * fall back to the curated pool – the game cannot get stuck here.
 */
export async function completeQuestionGeneration(code: string, gameId: string, plan?: QuestionPlan) {
  const p = plan ?? (await generateQuestionPlan());
  await mutateRoom(code, async (ctx) => {
    const game = await loadCurrentGame(ctx);
    if (!game || game.id !== gameId || game.phase !== "GENERATING_QUESTIONS" || game.status !== "active") return;
    await insertPlanAndBegin(ctx, game, p);
  });
}

/**
 * Heartbeat + lazy, idempotent deadline processing. Called on every state
 * fetch, so timers advance based on server time even if nobody clicks.
 */
export async function touchAndMaintain(db: Db, code: string, claims: SessionClaims) {
  const rows = await db.query<{
    id: string;
    session_hash: string;
    left_at: Date | null;
    was_connected: boolean;
    code: string;
  }>(
    `select p.id, p.session_hash, p.left_at, r.code,
            (p.last_seen_at > now() - make_interval(secs => ${CONN})) as was_connected
       from players p join rooms r on r.id = p.room_id
      where p.id = $1 and p.room_id = $2`,
    [claims.playerId, claims.roomId],
  );
  const me = rows[0];
  if (!me || me.code !== code || !sessionHashMatches(claims.sid, me.session_hash)) {
    throw new AppError("UNAUTHORIZED", "Oturumun doğrulanamadı. Lütfen odaya yeniden katıl.");
  }
  if (me.left_at) throw new AppError("UNAUTHORIZED", "Bu odadan ayrıldın. Tekrar katılmak için yeniden giriş yap.");
  await db.query(`update players set last_seen_at = now() where id = $1`, [me.id]);
  await db.query(
    `update rooms set last_activity_at = now() where id = $1 and last_activity_at < now() - interval '60 seconds'`,
    [claims.roomId],
  );
  const flags = await db.query<{ needs: boolean }>(
    `select (
        r.host_player_id is null
        or exists (select 1 from players h where h.id = r.host_player_id and (h.left_at is not null
              or h.last_seen_at < now() - make_interval(secs => ${GAME_CONFIG.hostTransferAfterSeconds})))
        or exists (select 1 from games g where g.id = r.current_game_id and g.status = 'active'
              and (g.phase_deadline <= now() or g.phase in ('ANSWER_SUBMISSION', 'VOTING', 'QUESTION_INTRO')))
      ) as needs
     from rooms r where r.id = $1`,
    [claims.roomId],
  );
  if (flags[0]?.needs || !me.was_connected) {
    await mutateRoom(code, async (ctx) => {
      if (!me.was_connected) ctx.bumped = true; // let others see the reconnect
      await maintain(ctx);
    });
  }
}

/** Delete abandoned rooms (cascade removes all game data) and old rate-limit rows. */
export async function runCleanup(db?: Db): Promise<{ rooms: number }> {
  const d = db ?? (await getDb());
  const deleted = await d.query<{ id: string }>(
    `delete from rooms
      where last_activity_at < now() - make_interval(secs => ${GAME_CONFIG.abandonedRoomSeconds})
         or (status = 'finished' and last_activity_at < now() - make_interval(secs => ${GAME_CONFIG.finishedRoomSeconds}))
         or not exists (select 1 from players p where p.room_id = rooms.id and p.left_at is null)
            and created_at < now() - interval '10 minutes'
      returning id`,
  );
  await d.query(`delete from rate_limits where window_start < now() - interval '1 hour'`);
  return { rooms: deleted.length };
}
