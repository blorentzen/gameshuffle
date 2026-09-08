import "server-only";

import type { createClient } from "@/lib/supabase/server";
import { SEARCH_RATE_LIMIT, SEARCH_RATE_WINDOW_MS } from "./config";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type AuthResult =
  | { ok: true; userId: string }
  | { ok: false; status: number; code: string };

/** Auth is the gate — an anon caller must never be able to drive BGG calls. */
export async function requireAuthedUser(supabase: Supabase): Promise<AuthResult> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401, code: "UNAUTHENTICATED" };
  return { ok: true, userId: user.id };
}

/** Per-user sliding-window limit (in-memory; Upstash later for scale). */
const buckets = new Map<string, number[]>();

export function checkSearchRateLimit(userId: string): {
  allowed: boolean;
  retryAfterMs: number;
} {
  const now = Date.now();
  const recent = (buckets.get(userId) ?? []).filter(
    (t) => now - t < SEARCH_RATE_WINDOW_MS,
  );
  if (recent.length >= SEARCH_RATE_LIMIT) {
    buckets.set(userId, recent);
    return { allowed: false, retryAfterMs: SEARCH_RATE_WINDOW_MS - (now - recent[0]) };
  }
  recent.push(now);
  buckets.set(userId, recent);
  return { allowed: true, retryAfterMs: 0 };
}
