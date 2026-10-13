import { describe, it, expect } from "vitest";
import { scoreRound, buildOptions, validateVote } from "@/lib/game/scoring";
import { distributeOwners } from "@/lib/game/distribution";
import { rankPlayers } from "@/lib/game/ranking";
import { canTransition, assertTransition, InvalidTransitionError } from "@/lib/game/stateMachine";
import { normalizeAnswer, validateNickname, validateAnswerText } from "@/lib/game/text";
import { seededRng } from "@/lib/game/random";
import { validateQuestionTemplate, isSafeQuestion } from "@/lib/questions/validate";

describe("Pure Game Logic Unit Tests", () => {
  describe("Scoring Engine (User Spec Scenario)", () => {
    it("correctly handles 6 players: Ahmet owner, 2 correct guesses, 3 fooling Mehmet", () => {
      // 6 players: Ahmet (owner), Mehmet, Ayse, Can, Zeynep, Burak
      const ownerId = "ahmet";
      const participants = ["ahmet", "mehmet", "ayse", "can", "zeynep", "burak"];
      const eligibleVoters = ["mehmet", "ayse", "can", "zeynep", "burak"];

      const options = [
        { id: "opt-correct", isCorrect: true, authorIds: [] },
        { id: "opt-mehmet", isCorrect: false, authorIds: ["mehmet"] },
        { id: "opt-ayse", isCorrect: false, authorIds: ["ayse"] },
        { id: "opt-can", isCorrect: false, authorIds: ["can"] },
      ];

      // Votes:
      // Ayse & Can vote correct (+1 each)
      // Zeynep, Burak & Mehmet vote for Mehmet's answer? Wait! Can Mehmet vote for own answer?
      // Spec: Mehmet cannot vote for own answer. Let's test that rule!
      const votes = [
        { voterId: "ayse", optionId: "opt-correct" },
        { voterId: "can", optionId: "opt-correct" },
        { voterId: "zeynep", optionId: "opt-mehmet" },
        { voterId: "burak", optionId: "opt-mehmet" },
        // Suppose another player "deniz" also voted for Mehmet
      ];

      const scores = scoreRound({
        ownerId,
        participantIds: participants,
        eligibleVoterIds: eligibleVoters,
        options,
        votes,
      });

      const scoreMap = new Map(scores.map((s) => [s.playerId, s]));

      expect(scoreMap.get("ayse")?.points).toBe(1);
      expect(scoreMap.get("ayse")?.correctGuess).toBe(true);

      expect(scoreMap.get("can")?.points).toBe(1);
      expect(scoreMap.get("can")?.correctGuess).toBe(true);

      expect(scoreMap.get("mehmet")?.points).toBe(2);
      expect(scoreMap.get("mehmet")?.fooledPoints).toBe(2);

      // Ahmet (owner) gets 0
      expect(scoreMap.get("ahmet")?.points).toBe(0);
      expect(scoreMap.get("zeynep")?.points).toBe(0);
      expect(scoreMap.get("burak")?.points).toBe(0);
    });

    it("prevents owner from voting and rejects own answer voting", () => {
      const ctx = {
        ownerId: "ahmet",
        eligibleVoterIds: ["mehmet", "ayse"],
        options: [
          { id: "opt-1", isCorrect: true, authorIds: [] },
          { id: "opt-2", isCorrect: false, authorIds: ["mehmet"] },
        ],
      };

      // Owner trying to vote
      expect(validateVote({ voterId: "ahmet", optionId: "opt-1" }, ctx)).toBe("OWNER_CANNOT_VOTE");

      // Player voting for own fake answer
      expect(validateVote({ voterId: "mehmet", optionId: "opt-2" }, ctx)).toBe("OWN_ANSWER");

      // Valid vote
      expect(validateVote({ voterId: "ayse", optionId: "opt-2" }, ctx)).toBeNull();
    });

    it("handles merged duplicate fake answers by awarding +1 to all authors", () => {
      const options = [
        { id: "opt-correct", isCorrect: true, authorIds: [] },
        { id: "opt-merged", isCorrect: false, authorIds: ["player1", "player2"] },
      ];

      const votes = [{ voterId: "player3", optionId: "opt-merged" }];

      const scores = scoreRound({
        ownerId: "owner",
        participantIds: ["owner", "player1", "player2", "player3"],
        eligibleVoterIds: ["player1", "player2", "player3"],
        options,
        votes,
      });

      const s1 = scores.find((s) => s.playerId === "player1");
      const s2 = scores.find((s) => s.playerId === "player2");
      expect(s1?.points).toBe(1);
      expect(s2?.points).toBe(1);
    });
  });

  describe("Option Building and Deduplication", () => {
    it("merges duplicate fake answers and discards fakes matching truth", () => {
      const rng = seededRng(42);
      const built = buildOptions(
        "Pilot olmak",
        [
          { playerId: "p1", text: "Doktor", createdAt: 100 },
          { playerId: "p2", text: "doktor!", createdAt: 200 }, // same normalized as p1
          { playerId: "p3", text: "pilot olmak.", createdAt: 300 }, // matches truth!
          { playerId: "p4", text: "Astronot", createdAt: 400 },
        ],
        rng,
      );

      // Should have: 1 correct ("Pilot olmak"), 1 merged "Doktor" (p1, p2), 1 "Astronot" (p4)
      expect(built.length).toBe(3);

      const doctorOpt = built.find((b) => b.normalized === "doktor");
      expect(doctorOpt).toBeDefined();
      expect(doctorOpt?.authorIds).toContain("p1");
      expect(doctorOpt?.authorIds).toContain("p2");

      const correctOpt = built.find((b) => b.isCorrect);
      expect(correctOpt?.text).toBe("Pilot olmak");
    });
  });

  describe("Balanced Owner Distribution", () => {
    it("distributes 10 rounds fairly across 4-12 players with no consecutive rounds for same player", () => {
      for (let n = 4; n <= 12; n++) {
        const players = Array.from({ length: n }, (_, i) => `p${i + 1}`);
        const owners = distributeOwners(players, 10, seededRng(1234 + n));

        expect(owners.length).toBe(10);

        // No consecutive rounds for same owner
        for (let i = 0; i < owners.length - 1; i++) {
          expect(owners[i]).not.toBe(owners[i + 1]);
        }

        // When n <= 10, every player should own at least one
        if (n <= 10) {
          const uniqueOwners = new Set(owners);
          expect(uniqueOwners.size).toBe(n);
        }
      }
    });
  });

  describe("Ranking and Ties", () => {
    it("properly calculates shared ranks for tied scores", () => {
      const players = [
        { playerId: "p1", nickname: "Ali", score: 10 },
        { playerId: "p2", nickname: "Veli", score: 10 },
        { playerId: "p3", nickname: "Can", score: 5 },
        { playerId: "p4", nickname: "Deniz", score: 2 },
      ];

      const ranked = rankPlayers(players);
      expect(ranked[0].rank).toBe(1);
      expect(ranked[1].rank).toBe(1); // Shared 1st place
      expect(ranked[2].rank).toBe(3); // 3rd place
      expect(ranked[3].rank).toBe(4); // 4th place
    });
  });

  describe("State Machine Transitions", () => {
    it("allows valid transitions and rejects invalid ones", () => {
      expect(canTransition("LOBBY", "GENERATING_QUESTIONS")).toBe(true);
      expect(canTransition("QUESTION_INTRO", "ANSWER_SUBMISSION")).toBe(true);
      expect(canTransition("ANSWER_SUBMISSION", "VOTING")).toBe(true);
      expect(canTransition("VOTING", "REVEAL")).toBe(true);
      expect(canTransition("REVEAL", "SCOREBOARD")).toBe(true);
      expect(canTransition("SCOREBOARD", "QUESTION_INTRO")).toBe(true);
      expect(canTransition("SCOREBOARD", "FINAL_RESULTS")).toBe(true);

      // Invalid transitions
      expect(canTransition("LOBBY", "VOTING")).toBe(false);
      expect(canTransition("VOTING", "LOBBY")).toBe(false);
      expect(() => assertTransition("LOBBY", "VOTING")).toThrow(InvalidTransitionError);
    });
  });

  describe("Text Normalization and Validation", () => {
    it("normalizes Turkish characters correctly", () => {
      expect(normalizeAnswer("IŞIK")).toBe("ışık");
      expect(normalizeAnswer("İSTANBUL!")).toBe("istanbul");
      expect(normalizeAnswer("   Pilot    olmak...  ")).toBe("pilot olmak");
    });

    it("validates nicknames", () => {
      expect(validateNickname("Ahmet").ok).toBe(true);
      expect(validateNickname("A").ok).toBe(false);
      expect(validateNickname("ÇokUzunBirTakmaAdOlamaz123").ok).toBe(false);
      expect(validateNickname("<script>alert(1)</script>").ok).toBe(false);
    });

    it("validates answers", () => {
      expect(validateAnswerText("Astronot olmak").ok).toBe(true);
      expect(validateAnswerText("").ok).toBe(false);
      expect(validateAnswerText("   ...!?  ").ok).toBe(false);
    });
  });

  describe("Question Safety and Validation", () => {
    it("identifies safe and unsafe question contents", () => {
      expect(isSafeQuestion("Ahmet çocukken ne olmak isterdi?")).toBe(true);
      expect(isSafeQuestion("Ahmet'in kredi kartı şifresi ne?")).toBe(false);
      expect(isSafeQuestion("Ahmet siyaset hakkında ne düşünüyor?")).toBe(false);
      expect(isSafeQuestion("Ahmet cinsel hayatında ne yapar?")).toBe(false);
    });

    it("validates question template structure", () => {
      const valid = validateQuestionTemplate({
        text: "{isim} küçükken ne olmak isterdi?",
        category: "cocukluk",
      });
      expect(valid.ok).toBe(true);

      const missingToken = validateQuestionTemplate({
        text: "Küçükken ne olmak isterdi?",
        category: "cocukluk",
      });
      expect(missingToken.ok).toBe(false);

      const notQuestion = validateQuestionTemplate({
        text: "{isim} küçükken pilot olmak isterdi.",
        category: "cocukluk",
      });
      expect(notQuestion.ok).toBe(false);
    });
  });
});
