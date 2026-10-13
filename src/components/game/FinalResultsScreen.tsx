"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { RoomState } from "@/lib/game/view";
import type { GameAction } from "@/lib/server/gameService";

export function FinalResultsScreen({
  state,
  dispatch,
}: {
  state: RoomState;
  dispatch: (action: GameAction) => Promise<boolean>;
}) {
  const router = useRouter();
  const [restarting, setRestarting] = useState(false);
  const game = state.game!;
  const standings = game.standings;
  const isHost = state.me.isHost;

  const winner = standings.find((s) => s.rank === 1);

  const handlePlayAgain = async () => {
    if (restarting || !isHost) return;
    setRestarting(true);
    await dispatch({ type: "backToLobby" });
    setRestarting(false);
  };

  return (
    <div className="flex flex-col flex-1 items-center justify-between w-full max-w-md mx-auto p-4 gap-6">
      {/* Celebration Header */}
      <div className="w-full text-center flex flex-col items-center">
        <span className="text-4xl mb-2 animate-bounce">👑</span>
        <span className="text-xs uppercase font-extrabold tracking-widest text-amber-400">
          Oyun Bitti! Şampiyon
        </span>
        <h1 className="text-3xl font-black text-white mt-1">
          {winner?.nickname ?? "Biri"}
        </h1>
        <p className="text-sm font-semibold text-amber-300 mt-1">
          {winner?.score} Toplam Puan
        </p>
      </div>

      {/* Full Leaderboard */}
      <div className="w-full flex-1 glass-card p-5 rounded-3xl border border-slate-800 flex flex-col">
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
          Final Sıralaması
        </h2>

        <div className="flex-1 overflow-y-auto space-y-2.5 max-h-[46vh] pr-1">
          {standings.map((s) => {
            const isMe = s.playerId === state.me.id;

            return (
              <div
                key={s.playerId}
                className={`p-3 rounded-2xl border transition flex items-center justify-between ${
                  s.rank === 1
                    ? "bg-amber-950/40 border-amber-500/60 shadow-[0_0_20px_rgba(245,158,11,0.25)]"
                    : s.rank === 2
                      ? "bg-slate-800/60 border-slate-700"
                      : s.rank === 3
                        ? "bg-amber-950/20 border-amber-900/60"
                        : "bg-slate-900/60 border-slate-800/80"
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
                  <div>
                    <span className="font-bold text-sm text-white flex items-center gap-1.5">
                      {s.nickname}
                      {isMe && <span className="text-[10px] text-indigo-400 font-normal">(Sen)</span>}
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
      </div>

      {/* Play Again options */}
      <div className="w-full flex flex-col gap-2.5">
        {isHost ? (
          <button
            onClick={handlePlayAgain}
            disabled={restarting}
            className="w-full py-4 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl font-bold text-white text-base hover:brightness-110 active:scale-95 transition glow-primary cursor-pointer"
          >
            {restarting ? "Lobiye Dönülüyor..." : "Aynı Odayla Yeniden Oyna 🔄"}
          </button>
        ) : (
          <div className="w-full py-3 text-center text-xs text-slate-400">
            Oda sahibinin yeni oyun başlatması bekleniyor...
          </div>
        )}

        <button
          onClick={() => router.push("/")}
          className="w-full py-3 bg-slate-900/60 hover:bg-slate-800 border border-slate-800 rounded-2xl text-xs font-semibold text-slate-400 transition cursor-pointer"
        >
          Ana Menüye Dön
        </button>
      </div>
    </div>
  );
}
