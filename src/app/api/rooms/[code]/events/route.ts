import { NextRequest } from "next/server";
import { localEmitter } from "@/lib/server/realtime";
import { getDb } from "@/lib/server/db";
import { normalizeRoomCode } from "@/lib/server/gameService";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ code: string }> },
) {
  const { code: rawCode } = await ctx.params;
  const code = normalizeRoomCode(rawCode);

  const db = await getDb();
  const rooms = await db.query<{ id: string; version: number | string }>(
    `select id, version from rooms where code = $1`,
    [code],
  );
  const room = rooms[0];
  if (!room) {
    return new Response("Oda bulunamadı", { status: 404 });
  }

  const roomId = room.id;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // Send initial version
      controller.enqueue(
        encoder.encode(`event: sync\ndata: ${JSON.stringify({ v: Number(room.version) })}\n\n`),
      );

      const handler = (version: number) => {
        try {
          controller.enqueue(
            encoder.encode(`event: sync\ndata: ${JSON.stringify({ v: version })}\n\n`),
          );
        } catch {
          // Stream might be closed
        }
      };

      localEmitter.on(roomId, handler);

      // Heartbeat interval to keep connection alive
      const timer = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch {
          clearInterval(timer);
        }
      }, 15000);

      req.signal.addEventListener("abort", () => {
        clearInterval(timer);
        localEmitter.off(roomId, handler);
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
