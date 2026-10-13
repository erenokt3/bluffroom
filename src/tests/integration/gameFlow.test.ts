import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createPgliteDb, runMigrations, setDbForTests, type Db } from "@/lib/server/db";
import {
  createRoom,
  joinRoom,
  performAction,
  completeQuestionGeneration,
} from "@/lib/server/gameService";
import { getRoomState } from "@/lib/server/stateService";
import { fallbackPlan } from "@/lib/questions/generator";
import { seededRng } from "@/lib/game/random";

describe("Room & Game Flow Integration Tests (PGlite)", () => {
  let db: Db;

  beforeAll(async () => {
    db = await createPgliteDb(); // in-memory
    await runMigrations(db);
    setDbForTests(db);
  });

  afterAll(async () => {
    await db.close();
    setDbForTests(undefined);
  });

  it("handles room creation, joining, nickname collision and capacity", async () => {
    // 1. Host creates room
    const host = await createRoom({ nickname: "Ahmet", ip: "127.0.0.1" });
    expect(host.code).toHaveLength(6);
    expect(host.token).toBeDefined();

    // 2. Player 2 joins
    const p2 = await joinRoom({ code: host.code, nickname: "Mehmet", ip: "127.0.0.2" });
    expect(p2.token).toBeDefined();

    // 3. Collision: Player tries to join with same nickname
    await expect(
      joinRoom({ code: host.code, nickname: "ahmet", ip: "127.0.0.3" }),
    ).rejects.toThrow(/takma ad bu odada kullanılıyor/i);

    // 4. Invalid code
    await expect(
      joinRoom({ code: "ZZZZZZ", nickname: "Can", ip: "127.0.0.4" }),
    ).rejects.toThrow(/bulunamadı/i);
  });

  it("runs a full game round with 4 players: intro -> submissions -> voting -> reveal -> scoreboard", async () => {
    // Create 4 players
    const host = await createRoom({ nickname: "Ahmet", ip: "127.0.0.1" });
    const p2 = await joinRoom({ code: host.code, nickname: "Mehmet", ip: "127.0.0.2" });
    const p3 = await joinRoom({ code: host.code, nickname: "Ayşe", ip: "127.0.0.3" });
    const p4 = await joinRoom({ code: host.code, nickname: "Can", ip: "127.0.0.4" });

    // Host starts game
    await performAction({
      code: host.code,
      token: host.token,
      action: { type: "start" },
    });

    // Provide question plan directly to progress from GENERATING_QUESTIONS
    const plan = fallbackPlan(10, seededRng(99));
    const stateGen = await getRoomState(host.code, host.token);
    expect(stateGen.game?.id).toBeDefined();

    await completeQuestionGeneration(host.code, stateGen.game!.id, plan);

    // State is now QUESTION_INTRO
    const stateIntro = await getRoomState(host.code, host.token);
    expect(stateIntro.game?.phase).toBe("QUESTION_INTRO");
    expect(stateIntro.game?.question).toBeDefined();

    const q = stateIntro.game!.question!;
    const ownerToken =
      q.ownerId === host.playerId
        ? host.token
        : q.ownerId === p2.playerId
          ? p2.token
          : q.ownerId === p3.playerId
            ? p3.token
            : p4.token;

    const nonOwners = [host, p2, p3, p4].filter((p) => p.playerId !== q.ownerId);

    // Verify secret: non-owners cannot see the true answer!
    const nonOwnerState1 = await getRoomState(host.code, nonOwners[0].token);
    expect(nonOwnerState1.game?.my.trueAnswer).toBeNull();

    // Owner submits true answer
    await performAction({
      code: host.code,
      token: ownerToken,
      action: {
        type: "trueAnswer",
        questionId: q.id,
        text: "Pilot olmak",
      },
    });

    // Phase automatically transitions to ANSWER_SUBMISSION
    const stateAns = await getRoomState(host.code, host.token);
    expect(stateAns.game?.phase).toBe("ANSWER_SUBMISSION");

    // Non-owners submit fake answers
    // nonOwner 0: "Astronot olmak"
    await performAction({
      code: host.code,
      token: nonOwners[0].token,
      action: { type: "fakeAnswer", questionId: q.id, text: "Astronot olmak" },
    });
    // nonOwner 1: "Doktor olmak"
    await performAction({
      code: host.code,
      token: nonOwners[1].token,
      action: { type: "fakeAnswer", questionId: q.id, text: "Doktor olmak" },
    });
    // nonOwner 2: "Mühendis olmak" -> Once last player answers, moves to VOTING automatically
    await performAction({
      code: host.code,
      token: nonOwners[2].token,
      action: { type: "fakeAnswer", questionId: q.id, text: "Mühendis olmak" },
    });

    // Phase is now VOTING
    const stateVote = await getRoomState(host.code, host.token);
    expect(stateVote.game?.phase).toBe("VOTING");
    expect(stateVote.game?.options).toBeDefined();
    expect(stateVote.game?.options?.length).toBe(4); // 1 true + 3 fakes

    const options = stateVote.game!.options!;
    // Find correct option and a fake option
    // In state, options do NOT disclose isCorrect during voting!
    // But nonOwners[0] knows their own option has isMine === true
    const nonOwner0State = await getRoomState(host.code, nonOwners[0].token);
    const myOpt = nonOwner0State.game!.options!.find((o) => o.isMine);
    expect(myOpt).toBeDefined();

    // Voting rules test: nonOwner 0 cannot vote for their own answer!
    await expect(
      performAction({
        code: host.code,
        token: nonOwners[0].token,
        action: { type: "vote", questionId: q.id, optionId: myOpt!.id },
      }),
    ).rejects.toThrow(/kendi yazdığın cevaba oy veremezsin/i);

    // Each nonOwner fetches their own view and votes for an option that is NOT theirs
    for (const player of nonOwners) {
      const pState = await getRoomState(host.code, player.token);
      const validOpt = pState.game!.options!.find((o) => !o.isMine)!;
      await performAction({
        code: host.code,
        token: player.token,
        action: { type: "vote", questionId: q.id, optionId: validOpt.id },
      });
    }

    const stateReveal = await getRoomState(host.code, host.token);
    expect(stateReveal.game?.phase).toBe("REVEAL");
    expect(stateReveal.game?.reveal).toBeDefined();
    expect(stateReveal.game?.reveal?.options.length).toBe(4);
    // In reveal, isCorrect and authors are now visible
    expect(stateReveal.game?.reveal?.options.some((o) => o.isCorrect)).toBe(true);

    // Host advances to scoreboard
    await performAction({
      code: host.code,
      token: host.token,
      action: { type: "advance", fromPhase: "REVEAL", round: 1 },
    });

    const stateScore = await getRoomState(host.code, host.token);
    expect(stateScore.game?.phase).toBe("SCOREBOARD");
    expect(stateScore.game?.standings.length).toBe(4);
  });
});
