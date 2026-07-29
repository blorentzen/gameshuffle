import "server-only";

import type { createClient } from "@/lib/supabase/server";
import { effectiveTier, hasCapability, normalizeTier } from "@/lib/subscription";
import { TCG_ERROR } from "./types";
import { SEARCH_RATE_LIMIT, SEARCH_RATE_WINDOW_MS } from "./config";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type AuthResult =
  | { ok: true; userId: string }
  | { ok: false; status: number; code: string };

/**
 * Auth is the gate — never a rate limit. Every /api/tcg/* route requires an
 * authenticated user; an anonymous caller must never be able to drive credit
 * spend through search or resolve.
 */
export async function requireAuthedUser(
  supabase: Supabase,
): Promise<AuthResult> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, status: 401, code: TCG_ERROR.UNAUTHENTICATED };
  }
  return { ok: true, userId: user.id };
}

/**
 * Attaching real cards to your account is gated on the `companion.collection`
 * capability, enforced server-side (matching the `companion.save_state`
 * pattern) — never a raw tier-string check. That capability is currently
 * granted to ALL signed-in accounts (free + pro), so in practice this is an
 * auth gate today; the capability layer lets it be re-gated to Pro later
 * without touching route code. UI gating is presentation only; this is the
 * control.
 */
export async function requireProCollection(
  supabase: Supabase,
): Promise<AuthResult> {
  const auth = await requireAuthedUser(supabase);
  if (!auth.ok) return auth;

  const { data: profile } = await supabase
    .from("users")
    .select("subscription_tier, role")
    .eq("id", auth.userId)
    .maybeSingle();

  const capUser = {
    tier: normalizeTier(profile?.subscription_tier as string | null),
    role: (profile?.role as string | null) ?? null,
  };
  // effectiveTier upgrades staff/admin; hasCapability is the actual gate.
  effectiveTier(capUser);
  if (!hasCapability(capUser, "companion.collection")) {
    return { ok: false, status: 403, code: TCG_ERROR.PRO_REQUIRED };
  }
  return { ok: true, userId: auth.userId };
}

// ── Per-user in-memory rate limiter (backstop, not the gate) ─────────────────
// Token-bucket per (userId). Resets on cold start, which is fine for a
// per-minute cap. Mirrors src/lib/picks-bans/rateLimit.ts.

interface Bucket {
  count: number;
  windowStart: number;
}
const searchBuckets = new Map<string, Bucket>();

export interface RateLimitResult {
  allowed: boolean;
  retryAfterMs: number;
}

/** 30 req/min per user on /api/tcg/search — a buggy/hostile client must not
 *  drain credits. */
export function checkSearchRateLimit(userId: string): RateLimitResult {
  const now = Date.now();
  const bucket = searchBuckets.get(userId);
  if (!bucket || now - bucket.windowStart >= SEARCH_RATE_WINDOW_MS) {
    searchBuckets.set(userId, { count: 1, windowStart: now });
    return { allowed: true, retryAfterMs: 0 };
  }
  if (bucket.count >= SEARCH_RATE_LIMIT) {
    return {
      allowed: false,
      retryAfterMs: SEARCH_RATE_WINDOW_MS - (now - bucket.windowStart),
    };
  }
  bucket.count += 1;
  return { allowed: true, retryAfterMs: 0 };
}
