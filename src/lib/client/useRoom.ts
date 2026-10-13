"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import type { RoomState } from "@/lib/game/view";
import type { GameAction } from "@/lib/server/gameService";
import { getSupabasePublicConfig } from "@/lib/env";
import { createClient, type RealtimeChannel } from "@supabase/supabase-js";

interface UseRoomReturn {
  state: RoomState | null;
  loading: boolean;
  error: string | null;
  token: string | null;
  dispatch: (action: GameAction) => Promise<boolean>;
  refresh: () => Promise<void>;
  isConnected: boolean;
}

export function useRoom(roomCode: string): UseRoomReturn {
  const [state, setState] = useState<RoomState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem(`bluff_token_${roomCode.toUpperCase()}`);
    }
    return null;
  });
  const [isConnected, setIsConnected] = useState(true);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const sseRef = useRef<EventSource | null>(null);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);
  const latestVersionRef = useRef<number>(0);

  const fetchState = useCallback(async () => {
    const activeToken =
      token || (typeof window !== "undefined" ? localStorage.getItem(`bluff_token_${roomCode.toUpperCase()}`) : null);
    if (!activeToken) {
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(`/api/rooms/${roomCode}/state`, {
        headers: {
          Authorization: `Bearer ${activeToken}`,
        },
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        if (res.status === 401) {
          setError(errData.error || "Oturum süresi doldu.");
          localStorage.removeItem(`bluff_token_${roomCode.toUpperCase()}`);
          setToken(null);
        } else {
          setError(errData.error || "Oda durumu yüklenemedi.");
        }
        return;
      }

      const data: RoomState = await res.json();
      if (data.version >= latestVersionRef.current) {
        latestVersionRef.current = data.version;
        setState(data);
        setError(null);
        setIsConnected(true);
      }
    } catch {
      setIsConnected(false);
    } finally {
      setLoading(false);
    }
  }, [roomCode, token]);

  // Initial and token-dependent fetch
  useEffect(() => {
    fetchState();
  }, [fetchState]);

  // Realtime subscription setup
  useEffect(() => {
    if (!state?.room.id) return;

    const roomId = state.room.id;
    const supConfig = getSupabasePublicConfig();

    if (supConfig) {
      // Supabase Realtime mode
      const client = createClient(supConfig.url, supConfig.key);
      const channel = client.channel(`bluffroom:${roomId}`);

      channel
        .on("broadcast", { event: "sync" }, (payload: { payload: { v: number } }) => {
          if (payload?.payload?.v > latestVersionRef.current) {
            fetchState();
          }
        })
        .subscribe((status) => {
          setIsConnected(status === "SUBSCRIBED");
        });

      channelRef.current = channel;

      return () => {
        client.removeChannel(channel);
      };
    } else {
      // Local SSE fallback
      const sse = new EventSource(`/api/rooms/${roomCode}/events`);
      sse.addEventListener("sync", (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.v > latestVersionRef.current) {
            fetchState();
          }
        } catch {
          // parse error
        }
      });

      sse.onopen = () => setIsConnected(true);
      sse.onerror = () => setIsConnected(false);
      sseRef.current = sse;

      return () => {
        sse.close();
      };
    }
  }, [state?.room.id, roomCode, fetchState]);

  // Periodic heartbeat poll (ensures timeout deadlines and disconnects are synced)
  useEffect(() => {
    pollTimerRef.current = setInterval(() => {
      fetchState();
    }, 4000);

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [fetchState]);

  const dispatch = useCallback(
    async (action: GameAction): Promise<boolean> => {
      const activeToken = token || localStorage.getItem(`bluff_token_${roomCode.toUpperCase()}`);
      if (!activeToken) return false;

      try {
        const res = await fetch(`/api/rooms/${roomCode}/action`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${activeToken}`,
          },
          body: JSON.stringify({ action }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          alert(err.error || "İşlem gerçekleştirilemedi.");
          return false;
        }

        // Fetch immediately after dispatching action
        await fetchState();
        return true;
      } catch {
        alert("Bağlantı hatası oluştu.");
        return false;
      }
    },
    [roomCode, token, fetchState],
  );

  return {
    state,
    loading,
    error,
    token,
    dispatch,
    refresh: fetchState,
    isConnected,
  };
}
