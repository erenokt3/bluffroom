"use client";

import { Suspense, use, useState } from "react";
import Link from "next/link";
import { useRoom } from "@/lib/client/useRoom";
import { LobbyScreen } from "@/components/game/LobbyScreen";
import { QuestionIntroScreen } from "@/components/game/QuestionIntroScreen";
import { FakeAnswerScreen } from "@/components/game/FakeAnswerScreen";
import { VotingScreen } from "@/components/game/VotingScreen";
import { RevealScreen } from "@/components/game/RevealScreen";
import { ScoreboardScreen } from "@/components/game/ScoreboardScreen";
import { FinalResultsScreen } from "@/components/game/FinalResultsScreen";

function RoomContent({ params }: { params: Promise<{ code: string }> }) {
  const { code: rawCode } = use(params);
  const code = rawCode.toUpperCase();
  const { state, loading, error, token, dispatch, isConnected } = useRoom(code);
  const [nickname, setNickname] = useState("");
  const [joining, setJoining] = useState(false);

  // If user does not have a session token for this room, show quick join prompt
  if (!loading && !token) {
    const handleJoin = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!nickname.trim() || joining) return;
      setJoining(true);

      try {
        const res = await fetch("/api/rooms/join", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, nickname: nickname.trim() }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          alert(err.error || "Odaya katılınamadı.");
          return;
        }

        const data = await res.json();
        localStorage.setItem(`bluff_token_${code}`, data.token);
        window.location.reload();
      } catch {
        alert("Bağlantı hatası oluştu.");
      } finally {
        setJoining(false);
      }
    };

    return (
      <main className="min-h-[100dvh] flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-sm glass-card p-6 rounded-3xl border border-slate-800 text-center flex flex-col gap-5">
          <div>
            <span className="text-xs uppercase font-extrabold tracking-widest text-indigo-400">
              Odaya Katıl
            </span>
            <h1 className="text-2xl font-black text-white mt-1">Oda: {code}</h1>
          </div>

          <form onSubmit={handleJoin} className="flex flex-col gap-3">
            <input
              type="text"
              maxLength={16}
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="Takma adını gir (örn. Can)"
              className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-2xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-400 text-sm"
              autoFocus
            />

            <button
              type="submit"
              disabled={!nickname.trim() || joining}
              className="w-full py-3.5 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl font-bold text-white text-sm hover:brightness-110 active:scale-95 disabled:opacity-50 transition glow-primary cursor-pointer"
            >
              {joining ? "Katılınıyor..." : "Oyuna Katıl"}
            </button>
          </form>

          <Link href="/" className="text-xs text-slate-500 hover:text-slate-300">
            ← Ana Menüye Dön
          </Link>
        </div>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="min-h-[100dvh] flex flex-col items-center justify-center p-4">
        <div className="w-8 h-8 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-xs text-slate-400">Odaya bağlanılıyor...</p>
      </main>
    );
  }

  if (error || !state) {
    return (
      <main className="min-h-[100dvh] flex flex-col items-center justify-center p-4 text-center">
        <div className="glass-card p-6 rounded-3xl border border-rose-500/30 max-w-sm">
          <p className="text-sm font-bold text-rose-400 mb-4">{error || "Oda bulunamadı."}</p>
          <Link
            href="/"
            className="inline-block px-5 py-2.5 bg-indigo-600 rounded-xl text-xs font-bold text-white"
          >
            Ana Menüye Dön
          </Link>
        </div>
      </main>
    );
  }

  // Active Phase Switcher
  const renderPhase = () => {
    if (state.room.status === "lobby" || !state.game) {
      return <LobbyScreen state={state} dispatch={dispatch} />;
    }

    switch (state.game.phase) {
      case "GENERATING_QUESTIONS":
        return (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6 gap-3">
            <div className="w-10 h-10 border-3 border-indigo-400 border-t-transparent rounded-full animate-spin" />
            <h2 className="text-lg font-black text-white">Yapay Zeka Soruları Hazırlıyor...</h2>
            <p className="text-xs text-slate-400 max-w-xs">
              Arkadaş grubunuz için 10 adet kişisel ve yaratıcı soru oluşturuluyor.
            </p>
          </div>
        );
      case "QUESTION_INTRO":
        return <QuestionIntroScreen state={state} dispatch={dispatch} />;
      case "ANSWER_SUBMISSION":
        return <FakeAnswerScreen state={state} dispatch={dispatch} />;
      case "VOTING":
        return <VotingScreen state={state} dispatch={dispatch} />;
      case "REVEAL":
        return <RevealScreen state={state} dispatch={dispatch} />;
      case "SCOREBOARD":
        return <ScoreboardScreen state={state} dispatch={dispatch} />;
      case "FINAL_RESULTS":
        return <FinalResultsScreen state={state} dispatch={dispatch} />;
      default:
        return <LobbyScreen state={state} dispatch={dispatch} />;
    }
  };

  return (
    <main className="min-h-[100dvh] flex flex-col justify-between max-w-lg mx-auto py-2">
      {/* Top micro bar for connection status */}
      {!isConnected && (
        <div className="w-full bg-amber-500/20 text-amber-300 text-[11px] py-1 text-center font-medium border-b border-amber-500/30">
          ⚠️ Bağlantı yeniden kuruluyor...
        </div>
      )}

      {renderPhase()}
    </main>
  );
}

export default function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  return (
    <Suspense
      fallback={
        <main className="min-h-[100dvh] flex flex-col items-center justify-center p-4">
          <div className="w-8 h-8 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-xs text-slate-400">Yükleniyor...</p>
        </main>
      }
    >
      <RoomContent params={params} />
    </Suspense>
  );
}
