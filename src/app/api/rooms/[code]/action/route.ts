import { NextRequest, NextResponse } from "next/server";
import { isAppError } from "@/lib/server/errors";
import { bearerToken } from "@/lib/server/session";
import { normalizeRoomCode, performAction, type GameAction } from "@/lib/server/gameService";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ code: string }> },
) {
  try {
    const { code: rawCode } = await ctx.params;
    const code = normalizeRoomCode(rawCode);
    const token = bearerToken(req);
    const body = await req.json().catch(() => ({}));
    const action = body.action as GameAction;

    if (!action || typeof action.type !== "string") {
      return NextResponse.json({ error: "Geçersiz işlem parametresi." }, { status: 400 });
    }

    const res = await performAction({
      code,
      token,
      action,
    });
    return NextResponse.json(res, { status: 200 });
  } catch (err) {
    if (isAppError(err)) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    }
    console.error("[api/rooms/[code]/action]", err);
    return NextResponse.json({ error: "İşlem sırasında hata oluştu." }, { status: 500 });
  }
}
