import { NextRequest, NextResponse } from "next/server";
import { runCleanup } from "@/lib/server/gameService";

export async function GET(req: NextRequest) {
  // Optional security check for Vercel Cron: CRON_SECRET header
  const authHeader = req.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runCleanup();
    return NextResponse.json({ ok: true, cleanedRooms: result.rooms });
  } catch (err) {
    console.error("[api/cron/cleanup]", err);
    return NextResponse.json({ error: "Cleanup failed" }, { status: 500 });
  }
}
