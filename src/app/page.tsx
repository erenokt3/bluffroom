"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function HomePage() {
  const router = useRouter();
  const [nickname, setNickname] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"menu" | "create" | "join">("menu");

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nickname.trim() || loading) return;
    setLoading(true);

    try {
      const res = await fetch("/api/rooms/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname: nickname.trim() }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || "Oda oluşturulamadı.");
        return;
      }

      const data = await res.json();
      localStorage.setItem(`bluff_token_${data.code}`, data.token);
      router.push(`/room/${data.code}`);
    } catch {
      alert("Sunucuya bağlanılamadı.");
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nickname.trim() || !roomCode.trim() || loading) return;
    setLoading(true);

    const code = roomCode.trim().toUpperCase();

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
      localStorage.setItem(`bluff_token_${data.code}`, data.token);
      router.push(`/room/${data.code}`);
    } catch {
      alert("Sunucuya bağlanılamadı.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-[100dvh] flex flex-col items-center justify-between p-6 max-w-md mx-auto">
      {/* Brand Hero */}
      <div className="flex flex-col items-center text-center mt-12 gap-3">
        <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center text-3xl shadow-xl glow-primary">
          🎭
        </div>
        <div>
          <h1 className="text-4xl font-black tracking-tight text-white">
            BLUFFROOM
          </h1>
          <p className="text-xs font-semibold uppercase tracking-widest text-indigo-400 mt-1">
            Gerçek Zamanlı Blöf & Parti Oyunu
          </p>
        </div>
        <p className="text-xs text-slate-400 max-w-xs mt-1">
          Arkadaşlarını en iyi yalanlarla kandır, doğru cevabı bul ve puanları topla!
        </p>
      </div>

      {/* Action Box */}
      <div className="w-full glass-card p-6 rounded-3xl border border-slate-800 my-auto">
        {mode === "menu" && (
          <div className="flex flex-col gap-3">
            <button
              onClick={() => setMode("create")}
              className="w-full py-4 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl font-bold text-white text-base hover:brightness-110 active:scale-95 transition glow-primary cursor-pointer"
            >
              Yeni Oda Oluştur
            </button>
            <button
              onClick={() => setMode("join")}
              className="w-full py-4 bg-slate-900/90 hover:bg-slate-800 border border-slate-700 rounded-2xl font-bold text-slate-200 text-base active:scale-95 transition cursor-pointer"
            >
              Koda Göre Katıl
            </button>
          </div>
        )}

        {mode === "create" && (
          <form onSubmit={handleCreate} className="flex flex-col gap-4">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider text-center">
              Oda Oluştur
            </h2>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-slate-300">Takma Adın</label>
              <input
                type="text"
                maxLength={16}
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="Örn: Ahmet"
                className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-2xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-400 text-sm"
                autoFocus
              />
            </div>
            <button
              type="submit"
              disabled={!nickname.trim() || loading}
              className="w-full py-3.5 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl font-bold text-white text-sm hover:brightness-110 active:scale-95 disabled:opacity-50 transition glow-primary cursor-pointer"
            >
              {loading ? "Oda Açılıyor..." : "Odayı Başlat"}
            </button>
            <button
              type="button"
              onClick={() => setMode("menu")}
              className="text-xs text-slate-500 hover:text-slate-300 text-center"
            >
              ← Geri Dön
            </button>
          </form>
        )}

        {mode === "join" && (
          <form onSubmit={handleJoin} className="flex flex-col gap-4">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider text-center">
              Odaya Katıl
            </h2>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-slate-300">Oda Kodu</label>
              <input
                type="text"
                maxLength={6}
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                placeholder="6 Haneli Kod (Örn: X7K92M)"
                className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-2xl text-white uppercase font-mono tracking-widest placeholder-slate-500 focus:outline-none focus:border-indigo-400 text-sm"
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-slate-300">Takma Adın</label>
              <input
                type="text"
                maxLength={16}
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="Örn: Mehmet"
                className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-2xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-400 text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={!nickname.trim() || !roomCode.trim() || loading}
              className="w-full py-3.5 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl font-bold text-white text-sm hover:brightness-110 active:scale-95 disabled:opacity-50 transition glow-primary cursor-pointer"
            >
              {loading ? "Katılınıyor..." : "Katıl"}
            </button>
            <button
              type="button"
              onClick={() => setMode("menu")}
              className="text-xs text-slate-500 hover:text-slate-300 text-center"
            >
              ← Geri Dön
            </button>
          </form>
        )}
      </div>

      {/* Footer details */}
      <div className="text-center text-[11px] text-slate-500">
        4 - 12 Oyuncu • 10 Soru • Gerçek Zamanlı Blöf
      </div>
    </main>
  );
}
