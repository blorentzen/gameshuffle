import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";

/**
 * Account standing — the ONE shared answer to "what may this account do" (§7.2).
 * Every consumer surface must gate through `can()` / `canWith()` rather than
 * re-implementing checks; the surface that forgets is the one that gets
 * exploited.
 *
 * Reads `gs_account_standing`; falls back to the legacy `users.moderation_status`
 * so pre-existing suspensions/bans still gate before standing rows are
 * materialized. Defaults to "good" (all capabilities), so adding `can()` gates
 * across the app is a safe no-op until moderation actually restricts someone.
 */

export type Capability =
  | "can_message"
  | "can_submit_ideas"
  | "can_chat"
  | "can_create_sessions"
  | "can_join_public_sessions"
  | "is_discoverable";

export type StandingState = "good" | "warned" | "restricted" | "suspended" | "banned";

export interface AccountStanding {
  state: StandingState;
  /** Named booleans; an absent flag means allowed, `false` means restricted. */
  restrictions: Partial<Record<Capability, boolean>>;
  stateExpiresAt: string | null;
  strikeCount: number;
}

const GOOD: AccountStanding = { state: "good", restrictions: {}, stateExpiresAt: null, strikeCount: 0 };

// Suspended/banned block every capability outright.
const HARD_BLOCK: StandingState[] = ["suspended", "banned"];

function expired(iso: string | null | undefined): boolean {
  return !!iso && new Date(iso) < new Date();
}

export async function getStanding(userId: string): Promise<AccountStanding> {
  if (!userId) return GOOD;
  const admin = createServiceClient();

  const { data } = await admin
    .from("gs_account_standing")
    .select("state, restrictions, state_expires_at, strike_count")
    .eq("user_id", userId)
    .maybeSingle();

  if (data) {
    const row = data as {
      state: StandingState;
      restrictions: Record<string, boolean> | null;
      state_expires_at: string | null;
      strike_count: number;
    };
    // A time-bound state that has lapsed no longer gates.
    if (expired(row.state_expires_at)) return { ...GOOD, strikeCount: row.strike_count };
    return {
      state: row.state,
      restrictions: (row.restrictions ?? {}) as AccountStanding["restrictions"],
      stateExpiresAt: row.state_expires_at,
      strikeCount: row.strike_count,
    };
  }

  // Fallback: derive coarse standing from the legacy users.moderation_status.
  const { data: u } = await admin
    .from("users")
    .select("moderation_status, moderation_until")
    .eq("id", userId)
    .maybeSingle();
  const ms = u as { moderation_status?: string; moderation_until?: string | null } | null;
  if (ms?.moderation_status && ms.moderation_status !== "ok") {
    if (expired(ms.moderation_until)) return GOOD;
    const map: Record<string, StandingState> = {
      warned: "warned",
      suspended: "suspended",
      banned: "banned",
    };
    return {
      state: map[ms.moderation_status] ?? "good",
      restrictions: {},
      stateExpiresAt: ms.moderation_until ?? null,
      strikeCount: 0,
    };
  }
  return GOOD;
}

/** Pure capability check against already-loaded standing (no refetch). */
export function canWith(standing: AccountStanding, capability: Capability): boolean {
  if (HARD_BLOCK.includes(standing.state)) return false;
  return standing.restrictions[capability] !== false;
}

/** Whether an account may currently perform a capability. */
export async function can(userId: string, capability: Capability): Promise<boolean> {
  return canWith(await getStanding(userId), capability);
}
