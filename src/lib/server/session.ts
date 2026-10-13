/**
 * Signed guest sessions.
 *
 * A player's identity is NOT a player id in localStorage. On create/join the
 * server issues an HS256-signed token containing { sub: playerId, rid: roomId,
 * sid: random secret }. Only sha256(sid) is stored in the database. Every
 * request must present the token; the server verifies the signature AND that
 * the stored hash matches, so a tampered/forged token or a guessed player id
 * cannot impersonate another player.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { AppError } from "./errors";

const DEV_SECRET = "bluffroom-dev-only-insecure-secret-change-me-please!";

function getSecret(): Uint8Array {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) {
    if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEV_SESSION_SECRET !== "true") {
      throw new AppError(
        "SERVER_MISCONFIGURED",
        "Sunucu yapılandırması eksik (SESSION_SECRET). Lütfen yöneticiye bildir.",
      );
    }
    return new TextEncoder().encode(DEV_SECRET);
  }
  return new TextEncoder().encode(s);
}

export function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

export async function issueSession(playerId: string, roomId: string) {
  const sid = randomBytes(32).toString("base64url");
  const token = await new SignJWT({ rid: roomId, sid })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(playerId)
    .setIssuedAt()
    .setExpirationTime("2d")
    .setIssuer("bluffroom")
    .sign(getSecret());
  return { token, sessionHash: hashSecret(sid) };
}

export interface SessionClaims {
  playerId: string;
  roomId: string;
  sid: string;
}

export async function verifySessionToken(token: string | null | undefined): Promise<SessionClaims> {
  if (!token) throw new AppError("UNAUTHORIZED", "Oturum bulunamadı. Lütfen odaya yeniden katıl.");
  try {
    const { payload } = await jwtVerify(token, getSecret(), { issuer: "bluffroom", algorithms: ["HS256"] });
    if (typeof payload.sub !== "string" || typeof payload.rid !== "string" || typeof payload.sid !== "string") {
      throw new Error("bad claims");
    }
    return { playerId: payload.sub, roomId: payload.rid, sid: payload.sid };
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError("UNAUTHORIZED", "Oturumun geçersiz veya süresi dolmuş. Lütfen odaya yeniden katıl.");
  }
}

export function sessionHashMatches(sid: string, storedHash: string): boolean {
  const a = Buffer.from(hashSecret(sid), "hex");
  const b = Buffer.from(storedHash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function bearerToken(req: Request): string | null {
  const h = req.headers.get("authorization");
  if (!h?.startsWith("Bearer ")) return null;
  return h.slice(7).trim() || null;
}
