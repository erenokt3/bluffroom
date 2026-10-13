/**
 * Fixed-window rate limiter backed by the database, so limits hold across
 * multiple serverless instances.
 */
import type { Sql } from "./db";
import { AppError } from "./errors";

export async function consumeRateLimit(
  sql: Sql,
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<void> {
  if (process.env.DISABLE_RATE_LIMIT === "true") return;
  const rows = await sql.query<{ count: number }>(
    `insert into rate_limits (key, window_start, count) values ($1, now(), 1)
     on conflict (key) do update set
       count = case when rate_limits.window_start < now() - make_interval(secs => $2::int)
                    then 1 else rate_limits.count + 1 end,
       window_start = case when rate_limits.window_start < now() - make_interval(secs => $2::int)
                    then now() else rate_limits.window_start end
     returning count`,
    [key, windowSeconds],
  );
  if (Number(rows[0]?.count ?? 0) > limit) {
    throw new AppError("RATE_LIMITED", "Çok hızlı işlem yapıyorsun. Birkaç saniye bekleyip tekrar dene.");
  }
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "local";
}
