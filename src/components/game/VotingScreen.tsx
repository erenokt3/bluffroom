"use client";

import { useState } from "react";
import type { RoomState } from "@/lib/game/view";
import type { GameAction } from "@/lib/server/gameService";
import { TimerBar } from "./TimerBar";

export function VotingScreen({
  state,
  dispatch,
}: {
  state: RoomState;
  dispatch: (action: GameAction) => Promise<boolean>;
}) {
  const [voting, setVoting] = useState(false);

  const game = state.game!;
  const q = game.question!;
  const isOwner = game.my.isOwner;
  const options = game.options ?? [];
  const selectedOptionId = game.my.voteOptionId;

  const handleVote = async (optionId: string) => {
    if (voting || isOwner) return;
    setVoting(true);
    await dispatch({
      type: "vote",
      questionId: q.id,
      optionId,
    });
    setVoting(false);
  };

  return (
    <div className="flex flex-col flex-1 items-center justify-between w-full max-w-md mx-auto p-4 gap-4">
      {/* Header */}
      <div className="w-full flex justify-between items-center text-xs">
        <span className="px-3 py-1 bg-indigo-500/20 text-indigo-300 rounded-full font-bold border border-indigo-500/30">
          Soru {game.round} / {game.totalRounds}
        </span>
        <span className="text-slate-400 font-medium">Oylama Zamanı</span>
      </div>

      <TimerBar deadline={game.phaseDeadline} />

      {/* Target Question */}
      <div className="w-full glass-card p-4 rounded-2xl border border-indigo-500/20 text-center">
        <p className="text-base font-bold text-white leading-relaxed">
          {q.text}
        </p>
      </div>

      {/* Vote instructions / Progress */}
      <div className="w-full flex items-center justify-between px-2 text-xs text-slate-400">
        <span>{isOwner ? "Soru sahibi oy kullanamaz" : "Doğru olduğunu düşündüğün cevabı seç:"}</span>
        <span className="font-bold text-indigo-300">
          {game.progress.votedIds.length} / {game.progress.requiredIds.length} Oy
        </span>
      </div>

      {/* Shuffled Options List */}
      <div className="w-full flex-1 flex flex-col gap-2.5 overflow-y-auto max-h-[50vh] pr-1">
        {options.map((opt) => {
          const isSelected = opt.id === selectedOptionId;
          const isMine = opt.isMine;
          const disabled = isOwner || isMine || voting;

          return (
            <button
              key={opt.id}
              onClick={() => handleVote(opt.id)}
              disabled={disabled}
              className={`w-full p-4 rounded-2xl text-left font-semibold text-sm transition border flex items-center justify-between active:scale-[0.98] ${
                isMine
                  ? "bg-slate-900/40 border-slate-800 text-slate-500 cursor-not-allowed"
                  : isSelected
                    ? "bg-gradient-to-r from-indigo-600 to-purple-600 border-indigo-400 text-white shadow-lg glow-primary"
                    : "bg-slate-900/80 hover:bg-slate-800/90 border-slate-700/60 text-slate-200"
              }`}
            >
              <span>{opt.text}</span>
              {isMine ? (
                <span className="text-[10px] uppercase font-bold text-slate-500 px-2 py-0.5 bg-slate-800/80 rounded-md">
                  Senin Cevabın
                </span>
              ) : isSelected ? (
                <span className="text-xs font-bold text-emerald-300">✓ Oyun</span>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* Footer message */}
      <div className="w-full text-center text-xs text-slate-400">
        {isOwner
          ? "Arkadaşların doğru cevabı tahmin etmeye çalışıyor..."
          : selectedOptionId
            ? "Oyun kaydedildi. Süre dolana kadar değiştirebilirsin."
            : "Bir seçeneğe dokunarak oy ver."}
      </div>
    </div>
  );
}
