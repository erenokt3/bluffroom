/**
 * Realtime fan-out. Payloads ONLY contain a monotonically increasing room
 * version – never game data. Clients treat a signal as "something changed"
 * and refetch their personalised, authorised state from the server.
 *
 * - Supabase Realtime Broadcast (production): REST broadcast endpoint.
 * - In-process EventEmitter + SSE (local development without Supabase).
 */
import { EventEmitter } from "node:events";
import { getSupabasePublicConfig } from "../env";

const g = globalThis as unknown as { __bluffEmitter?: EventEmitter };
export const localEmitter: EventEmitter = (g.__bluffEmitter ??= (() => {
  const e = new EventEmitter();
  e.setMaxListeners(0);
  return e;
})());

export function roomTopic(roomId: string) {
  return `bluffroom:${roomId}`;
}

function serverKey(): string | null {
  return process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || null;
}

export function realtimeMode(): "supabase" | "local" {
  return getSupabasePublicConfig() && serverKey() ? "supabase" : "local";
}

export async function publishRoomUpdate(roomId: string, version: number): Promise<void> {
  localEmitter.emit(roomId, version);
  const pub = getSupabasePublicConfig();
  const key = serverKey();
  if (!pub || !key) return;
  const headers: Record<string, string> = { apikey: key, "Content-Type": "application/json" };
  // Legacy service_role keys are JWTs and also need the Authorization header.
  if (key.startsWith("eyJ")) headers.Authorization = `Bearer ${key}`;
  try {
    const res = await fetch(`${pub.url}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        messages: [{ topic: roomTopic(roomId), event: "sync", payload: { v: version }, private: false }],
      }),
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) console.warn(`[realtime] broadcast failed: ${res.status}`);
  } catch (err) {
    // Clients also poll, so a failed signal only delays the update.
    console.warn("[realtime] broadcast error", (err as Error).message);
  }
}
