"use client";

import { useEffect, useState } from "react";

export function TimerBar({ deadline }: { deadline: string | null }) {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(() => {
    if (!deadline) return null;
    return Math.max(0, Math.floor((new Date(deadline).getTime() - Date.now()) / 1000));
  });

  useEffect(() => {
    if (!deadline) {
      return;
    }

    const end = new Date(deadline).getTime();

    const interval = setInterval(() => {
      const now = Date.now();
      const diff = Math.max(0, Math.floor((end - now) / 1000));
      setSecondsLeft(diff);
    }, 500);

    return () => clearInterval(interval);
  }, [deadline]);

  if (secondsLeft === null) return null;

  const percent = Math.min(100, Math.max(0, (secondsLeft / 60) * 100));
  const isLow = secondsLeft <= 10;

  return (
    <div className="w-full my-2">
      <div className="flex justify-between items-center text-xs font-semibold mb-1 px-1">
        <span className="text-slate-400">Kalan Süre</span>
        <span className={`tabular-nums ${isLow ? "text-rose-400 font-bold animate-pulse" : "text-indigo-300"}`}>
          {secondsLeft}s
        </span>
      </div>
      <div className="w-full h-2 bg-slate-800/80 rounded-full overflow-hidden border border-slate-700/50">
        <div
          className={`h-full transition-all duration-500 rounded-full ${
            isLow ? "bg-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.6)]" : "bg-indigo-500 shadow-[0_0_12px_rgba(99,102,241,0.5)]"
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
