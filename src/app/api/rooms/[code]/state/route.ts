import { NextRequest, NextResponse } from "next/server";
import { isAppError } from "@/lib/server/errors";
import { bearerToken } from "@/lib/server/session";
import { normalizeRoomCode } from "@/lib/server/gameService";
import { getRoomState } from "@/lib/server/stateService";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ code: string }> },
) {
  try {
    const { code: rawCode } = await ctx.params;
    const code = normalizeRoomCode(rawCode);
    const token = bearerToken(req);
    const state = await getRoomState(code, token);
    return NextResponse.json(state, { status: 200 });
  } catch (err) {
    if (isAppError(err)) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    }
    console.error("[api/rooms/[code]/state]", err);
    return NextResponse.json({ error: "Sunucu hatası oluştu." }, { status: 500 });
  }
}
