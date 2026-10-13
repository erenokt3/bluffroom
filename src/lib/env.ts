/**
 * Public (browser-safe) environment configuration. Only NEXT_PUBLIC_* values
 * are read here. Supports both the new publishable key format
 * (sb_publishable_...) and the legacy anon JWT key – use ONE of them.
 */
export function getSupabasePublicConfig(): { url: string; key: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return { url: url.replace(/\/$/, ""), key };
}
