"use client";

import { useState } from "react";
import type { RoomState } from "@/lib/game/view";
import type { GameAction } from "@/lib/server/gameService";
import { TimerBar } from "./TimerBar";

export function FakeAnswerScreen({
  state,
  dispatch,
}: {
  state: RoomState;
  dispatch: (action: GameAction) => Promise<boolean>;
}) {
  const [fakeAnswer, setFakeAnswer] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const game = state.game!;
  const q = game.question!;
  const isOwner = game.my.isOwner;
  const myExisting = game.my.submission;
  const isSubmitted = !!myExisting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fakeAnswer.trim() || submitting) return;
    setSubmitting(true);
    await dispatch({
      type: "fakeAnswer",
      questionId: q.id,
      text: fakeAnswer.trim(),
    });
    setSubmitting(false);
  };

  return (
    <div className="flex flex-col flex-1 items-center justify-between w-full max-w-md mx-auto p-4 gap-4">
      {/* Header */}
      <div className="w-full flex justify-between items-center text-xs">
        <span className="px-3 py-1 bg-indigo-500/20 text-indigo-300 rounded-full font-bold border border-indigo-500/30">
          Soru {game.round} / {game.totalRounds}
        </span>
        <span className="text-slate-400 font-medium">{q.categoryLabel}</span>
      </div>

      <TimerBar deadline={game.phaseDeadline} />

      {/* Target Question */}
      <div className="w-full glass-card p-5 rounded-3xl border border-indigo-500/20 text-center glow-primary my-auto">
        <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider block mb-1">
          {q.ownerNickname} Hakkında Soru
        </span>
        <p className="text-lg font-bold text-white leading-relaxed">
          {q.text}
        </p>
      </div>

      {/* Submissions counter status */}
      <div className="w-full flex items-center justify-between px-2 text-xs text-slate-400">
        <span>Cevap Verenler</span>
        <span className="font-bold text-indigo-300">
          {game.progress.submittedIds.length} / {game.progress.requiredIds.length}
        </span>
      </div>

      {/* Action Area */}
      <div className="w-full">
        {isOwner ? (
          <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-2xl text-center text-sm text-slate-300">
            Sen sorunun sahibisin. Diğer oyuncular senin için blöf cevapları yazıyor!
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <div className="flex justify-between items-center text-xs">
                <label className="font-bold text-slate-300">
                  Uydurma Bir Yanlış Cevap Yaz:
                </label>
                {isSubmitted && (
                  <span className="text-emerald-400 font-semibold text-[11px]">
                    ✓ Cevabın kaydedildi (değiştirebilirsin)
                  </span>
                )}
              </div>
              <input
                type="text"
                maxLength={80}
                value={fakeAnswer || (myExisting && !fakeAnswer ? myExisting : "")}
                onChange={(e) => setFakeAnswer(e.target.value)}
                placeholder="İnandırıcı bir yalan uydur..."
                className="w-full px-4 py-3 bg-slate-900/90 border border-indigo-500/40 rounded-2xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-400 text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={!(fakeAnswer.trim() || myExisting) || submitting}
              className="w-full py-3.5 bg-gradient-to-r from-pink-500 to-indigo-600 rounded-2xl font-bold text-white text-sm hover:brightness-110 active:scale-95 disabled:opacity-50 transition glow-accent"
            >
              {submitting
                ? "Gönderiliyor..."
                : isSubmitted
                  ? "Cevabımı Güncelle"
                  : "Blöfümü Gönder"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
