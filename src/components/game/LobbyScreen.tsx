"use client";

import { useState } from "react";
import type { RoomState } from "@/lib/game/view";
import type { GameAction } from "@/lib/server/gameService";

interface LobbyScreenProps {
  state: RoomState;
  dispatch: (action: GameAction) => Promise<boolean>;
}

export function LobbyScreen({ state, dispatch }: LobbyScreenProps) {
  const [copied, setCopied] = useState(false);
  const [starting, setStarting] = useState(false);

  const isHost = state.me.isHost;
  const activeCount = state.players.length;
  const canStart = isHost && activeCount >= 4 && activeCount <= 12;

  const copyCode = () => {
    navigator.clipboard.writeText(state.room.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shareLink = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "BluffRoom'a Katıl!",
          text: `Oda Kodu: ${state.room.code} — Hadi blöf yapmaya gel!`,
          url: window.location.href,
        });
      } catch {
        copyCode();
      }
    } else {
      copyCode();
    }
  };

  const handleStart = async () => {
    if (!canStart || starting) return;
    setStarting(true);
    await dispatch({ type: "start" });
    setStarting(false);
  };

  return (
    <div className="flex flex-col flex-1 items-center justify-between w-full max-w-md mx-auto p-4 gap-6">
      {/* Room code header */}
      <div className="w-full flex flex-col items-center">
        <span className="text-xs font-semibold tracking-wider text-indigo-400 uppercase mb-1">
          Oda Kodu
        </span>
        <div className="flex items-center gap-3 bg-slate-900/90 border border-indigo-500/30 px-6 py-3 rounded-2xl glow-primary">
          <span className="text-3xl font-black tracking-widest text-white font-mono">
            {state.room.code}
          </span>
          <button
            onClick={shareLink}
            className="p-2 bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 rounded-xl transition active:scale-95 text-sm font-medium"
            title="Kopyala / Paylaş"
          >
            {copied ? "✓ Alındı" : "Paylaş"}
          </button>
        </div>
        <p className="text-xs text-slate-400 mt-2 text-center">
          Arkadaşlarını bu kodla veya linki paylaşarak odaya davet et.
        </p>
      </div>

      {/* Players list card */}
      <div className="w-full flex-1 glass-card rounded-3xl p-5 flex flex-col border border-slate-800">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-sm font-bold text-slate-300 uppercase tracking-wide">
            Oyuncular ({activeCount}/12)
          </h2>
          <span className="text-xs px-2.5 py-1 rounded-full bg-slate-800 text-slate-400">
            Min. 4 oyuncu
          </span>
        </div>

        <div className="flex-1 overflow-y-auto space-y-2.5 max-h-[46vh] pr-1">
          {state.players.map((p) => {
            const isMe = p.id === state.me.id;
            return (
              <div
                key={p.id}
                className={`flex items-center justify-between p-3 rounded-2xl border transition ${
                  isMe
                    ? "bg-indigo-950/40 border-indigo-500/40"
                    : "bg-slate-900/60 border-slate-800/80"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm text-white ${
                      p.isHost
                        ? "bg-gradient-to-tr from-amber-500 to-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.4)]"
                        : "bg-gradient-to-tr from-indigo-600 to-indigo-400"
                    }`}
                  >
                    {p.nickname.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-slate-100 flex items-center gap-1.5">
                      {p.nickname}
                      {isMe && <span className="text-[10px] text-indigo-400 font-normal">(Sen)</span>}
                    </span>
                    {p.isHost && (
                      <span className="text-[10px] font-bold text-amber-400 tracking-wide">
                        👑 ODA SAHİBİ
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      p.isConnected ? "bg-emerald-400" : "bg-slate-600"
                    }`}
                    title={p.isConnected ? "Bağlı" : "Bağlantı koptu"}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {activeCount < 4 && (
          <div className="mt-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-center text-xs text-amber-300">
            Oyunu başlatmak için en az {4 - activeCount} oyuncu daha gerekiyor.
          </div>
        )}
      </div>

      {/* Start button or waiting prompt */}
      <div className="w-full">
        {isHost ? (
          <button
            onClick={handleStart}
            disabled={!canStart || starting}
            className={`w-full py-4 rounded-2xl font-bold text-base shadow-lg transition active:scale-95 ${
              canStart
                ? "bg-gradient-to-r from-indigo-500 to-purple-600 text-white hover:brightness-110 glow-primary cursor-pointer"
                : "bg-slate-800 text-slate-500 border border-slate-700/50 cursor-not-allowed"
            }`}
          >
            {starting ? "Oyun Başlatılıyor..." : canStart ? "Oyunu Başlat" : "Oyuncular Bekleniyor..."}
          </button>
        ) : (
          <div className="w-full py-4 text-center text-sm font-medium text-slate-400 bg-slate-900/60 rounded-2xl border border-slate-800">
            Oda sahibinin oyunu başlatması bekleniyor...
          </div>
        )}
      </div>
    </div>
  );
}
