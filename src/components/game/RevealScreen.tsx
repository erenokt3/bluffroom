"use client";

import { useState } from "react";
import type { RoomState } from "@/lib/game/view";
import type { GameAction } from "@/lib/server/gameService";
import { TimerBar } from "./TimerBar";

export function RevealScreen({
  state,
  dispatch,
}: {
  state: RoomState;
  dispatch: (action: GameAction) => Promise<boolean>;
}) {
  const [advancing, setAdvancing] = useState(false);
  const game = state.game!;
  const q = game.question!;
  const reveal = game.reveal;
  const isHost = state.me.isHost;

  const handleAdvance = async () => {
    if (advancing || !isHost) return;
    setAdvancing(true);
    await dispatch({
      type: "advance",
      fromPhase: "REVEAL",
      round: game.round,
    });
    setAdvancing(false);
  };

  return (
    <div className="flex flex-col flex-1 items-center justify-between w-full max-w-md mx-auto p-4 gap-4">
      <div className="w-full flex justify-between items-center text-xs">
        <span className="px-3 py-1 bg-indigo-500/20 text-indigo-300 rounded-full font-bold border border-indigo-500/30">
          Soru {game.round} / {game.totalRounds}
        </span>
        <span className="text-emerald-400 font-bold">Sonuçlar Açıklandı!</span>
      </div>

      <TimerBar deadline={game.phaseDeadline} />

      {/* Target Question */}
      <div className="w-full glass-card p-3 rounded-2xl border border-slate-800 text-center">
        <p className="text-sm font-semibold text-slate-300">
          {q.text}
        </p>
      </div>

      {/* Revealed Options */}
      <div className="w-full flex-1 flex flex-col gap-2.5 overflow-y-auto max-h-[52vh] pr-1">
        {reveal?.options.map((opt) => {
          const voteCount = opt.voterIds.length;
          const isCorrect = opt.isCorrect;

          return (
            <div
              key={opt.id}
              className={`p-3.5 rounded-2xl border transition flex flex-col gap-2 ${
                isCorrect
                  ? "bg-emerald-950/40 border-emerald-500/60 shadow-[0_0_20px_rgba(16,185,129,0.25)]"
                  : "bg-slate-900/80 border-slate-800"
              }`}
            >
              <div className="flex justify-between items-start gap-2">
                <span className="font-bold text-sm text-white">{opt.text}</span>
                {isCorrect ? (
                  <span className="px-2 py-0.5 bg-emerald-500 text-slate-950 text-[10px] font-black uppercase rounded-md tracking-wider">
                    GERÇEK CEVAP
                  </span>
                ) : (
                  <span className="text-[11px] font-semibold text-slate-400">
                    {opt.authors.map((a) => a.nickname).join(", ")}
                  </span>
                )}
              </div>

              {/* Votes details */}
              <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-800/80">
                <span className="text-slate-400">
                  {voteCount > 0 ? `${voteCount} Oy Aldı` : "Hiç oy almadı"}
                </span>
                {voteCount > 0 && !isCorrect && (
                  <span className="text-pink-400 font-bold">
                    +{voteCount} Puan kazandırdı!
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Advance button for Host or hint */}
      <div className="w-full">
        {isHost ? (
          <button
            onClick={handleAdvance}
            disabled={advancing}
            className="w-full py-3.5 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl font-bold text-white text-sm hover:brightness-110 active:scale-95 transition glow-primary"
          >
            {advancing ? "İlerleniyor..." : "Puan Tablosuna Geç"}
          </button>
        ) : (
          <div className="w-full py-2.5 text-center text-xs text-slate-400">
            Puan tablosu hazırlanıyor...
          </div>
        )}
      </div>
    </div>
  );
}
