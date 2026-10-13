import { NextRequest, NextResponse } from "next/server";
import { isAppError } from "@/lib/server/errors";
import { clientIp } from "@/lib/server/rateLimit";
import { joinRoom } from "@/lib/server/gameService";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const ip = clientIp(req);
    const result = await joinRoom({
      code: body.code,
      nickname: body.nickname,
      ip,
    });
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    if (isAppError(err)) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    }
    console.error("[api/rooms/join]", err);
    return NextResponse.json({ error: "Sunucu hatası oluştu." }, { status: 500 });
  }
}
