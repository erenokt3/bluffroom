"use client";

import { useState } from "react";
import type { RoomState } from "@/lib/game/view";
import type { GameAction } from "@/lib/server/gameService";
import { TimerBar } from "./TimerBar";

export function ScoreboardScreen({
  state,
  dispatch,
}: {
  state: RoomState;
  dispatch: (action: GameAction) => Promise<boolean>;
}) {
  const [advancing, setAdvancing] = useState(false);
  const game = state.game!;
  const standings = game.standings;
  const isHost = state.me.isHost;
  const isLastRound = game.round >= game.totalRounds;

  const handleNext = async () => {
    if (advancing || !isHost) return;
    setAdvancing(true);
    await dispatch({
      type: "advance",
      fromPhase: "SCOREBOARD",
      round: game.round,
    });
    setAdvancing(false);
  };

  return (
    <div className="flex flex-col flex-1 items-center justify-between w-full max-w-md mx-auto p-4 gap-4">
      {/* Header */}
      <div className="w-full flex justify-between items-center text-xs">
        <span className="px-3 py-1 bg-indigo-500/20 text-indigo-300 rounded-full font-bold border border-indigo-500/30">
          Tur {game.round} / {game.totalRounds} Tamamlandı
        </span>
        <span className="text-amber-400 font-bold">Puan Tablosu</span>
      </div>

      <TimerBar deadline={game.phaseDeadline} />

      {/* Standings list */}
      <div className="w-full flex-1 flex flex-col gap-2.5 overflow-y-auto max-h-[55vh] pr-1">
        {standings.map((s) => {
          const isTop3 = s.rank <= 3;
          const isMe = s.playerId === state.me.id;

          return (
            <div
              key={s.playerId}
              className={`p-3.5 rounded-2xl border transition flex items-center justify-between ${
                isTop3
                  ? s.rank === 1
                    ? "bg-amber-950/30 border-amber-500/50 glow-gold"
                    : "bg-indigo-950/30 border-indigo-500/40"
                  : "bg-slate-900/60 border-slate-800"
              }`}
            >
              <div className="flex items-center gap-3">
                <span
                  className={`w-7 h-7 rounded-full flex items-center justify-center font-black text-xs ${
                    s.rank === 1
                      ? "bg-amber-400 text-slate-950"
                      : s.rank === 2
                        ? "bg-slate-300 text-slate-950"
                        : s.rank === 3
                          ? "bg-amber-700 text-white"
                          : "bg-slate-800 text-slate-400"
                  }`}
                >
                  #{s.rank}
                </span>

                <div className="flex flex-col">
                  <span className="font-bold text-sm text-white flex items-center gap-1.5">
                    {s.nickname}
                    {isMe && <span className="text-[10px] text-indigo-400">(Sen)</span>}
                  </span>
                  <span className="text-[11px] text-slate-400">
                    {s.correctCount} Doğru • {s.fooledPoints} Kandırma Puanı
                  </span>
                </div>
              </div>

              <div className="text-right">
                <span className="text-lg font-black text-white">{s.score}</span>
                <span className="text-[10px] text-slate-400 block -mt-1">Puan</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Advance button */}
      <div className="w-full">
        {isHost ? (
          <button
            onClick={handleNext}
            disabled={advancing}
            className="w-full py-4 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl font-bold text-white text-sm hover:brightness-110 active:scale-95 transition glow-primary cursor-pointer"
          >
            {advancing
              ? "İlerleniyor..."
              : isLastRound
                ? "Final Sonuçlarını Göster 🏆"
                : "Sonraki Soruya Geç ➔"}
          </button>
        ) : (
          <div className="w-full py-3 text-center text-xs text-slate-400">
            {isLastRound
              ? "Final sonuçları bekleniyor..."
              : "Oda sahibinin sonraki soruya geçmesi bekleniyor..."}
          </div>
        )}
      </div>
    </div>
  );
}
