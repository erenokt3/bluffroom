"use client";

import { useState } from "react";
import type { RoomState } from "@/lib/game/view";
import type { GameAction } from "@/lib/server/gameService";
import { TimerBar } from "./TimerBar";

export function QuestionIntroScreen({
  state,
  dispatch,
}: {
  state: RoomState;
  dispatch: (action: GameAction) => Promise<boolean>;
}) {
  const [answer, setAnswer] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const game = state.game!;
  const q = game.question!;
  const isOwner = game.my.isOwner;
  const alreadyAnswered = game.progress.ownerAnswered;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!answer.trim() || submitting) return;
    setSubmitting(true);
    await dispatch({
      type: "trueAnswer",
      questionId: q.id,
      text: answer.trim(),
    });
    setSubmitting(false);
  };

  return (
    <div className="flex flex-col flex-1 items-center justify-between w-full max-w-md mx-auto p-4 gap-4">
      {/* Round & category pill */}
      <div className="w-full flex justify-between items-center text-xs">
        <span className="px-3 py-1 bg-indigo-500/20 text-indigo-300 rounded-full font-bold border border-indigo-500/30">
          Soru {game.round} / {game.totalRounds}
        </span>
        <span className="text-slate-400 font-medium">{q.categoryLabel}</span>
      </div>

      <TimerBar deadline={game.phaseDeadline} />

      {/* Target owner spotlight */}
      <div className="w-full text-center my-2">
        <span className="text-xs uppercase font-extrabold tracking-widest text-indigo-400">
          Sıradaki Kişi
        </span>
        <h1 className="text-2xl font-black text-white mt-1">
          {q.ownerNickname}
        </h1>
      </div>

      {/* The Question Card */}
      <div className="w-full glass-card p-6 rounded-3xl border border-indigo-500/20 text-center glow-primary my-auto">
        <p className="text-lg md:text-xl font-bold text-white leading-relaxed">
          {q.text}
        </p>
      </div>

      {/* Bottom Area: Owner input OR other players waiting message */}
      <div className="w-full">
        {isOwner ? (
          alreadyAnswered ? (
            <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl text-center text-sm font-semibold text-emerald-300">
              ✓ Gerçek cevabın gizlice kaydedildi! Diğer oyuncular bekleniyor...
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-slate-300">
                  Senin Gerçek Cevabın Ne? (Sadece sen biliyorsun)
                </label>
                <input
                  type="text"
                  maxLength={80}
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  placeholder="Gerçek cevabını buraya yaz..."
                  className="w-full px-4 py-3 bg-slate-900/90 border border-indigo-500/40 rounded-2xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-400 text-sm"
                  autoFocus
                />
              </div>
              <button
                type="submit"
                disabled={!answer.trim() || submitting}
                className="w-full py-3.5 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl font-bold text-white text-sm hover:brightness-110 active:scale-95 disabled:opacity-50 transition glow-primary"
              >
                {submitting ? "Kaydediliyor..." : "Gizli Cevabı Gönder"}
              </button>
            </form>
          )
        ) : (
          <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-2xl text-center text-sm text-slate-400 flex flex-col items-center gap-2">
            <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            <span>{q.ownerNickname} gizli cevabını yazıyor...</span>
          </div>
        )}
      </div>
    </div>
  );
}
