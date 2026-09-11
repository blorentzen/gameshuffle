/**
 * Server-side resolver for a tournament's active Circuit access override
 * (tournament_entitlements). Feeds `CircuitContext.override` in the Decision-8
 * precedence. An override grants full paid features; gs_sponsored / partner_comp
 * are unlimited, circuit_events carries a cap. The most-permissive active
 * (not revoked, not expired) grant wins.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CircuitOverride } from "@/lib/tournaments/circuit";

interface Row {
  type: "gs_sponsored" | "circuit_events" | "partner_comp";
  player_cap: number | null;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export async function getTournamentOverride(
  admin: SupabaseClient,
  tournamentId: string,
): Promise<CircuitOverride | null> {
  const { data } = await admin
    .from("tournament_entitlements")
    .select("type, player_cap, expires_at, revoked_at, created_at")
    .eq("tournament_id", tournamentId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });

  const now = Date.now();
  const active = ((data ?? []) as Row[]).filter((r) => !r.expires_at || new Date(r.expires_at).getTime() > now);
  if (active.length === 0) return null;

  // Unlimited grants (sponsored / partner comp) beat a capped events pass.
  const unlimited = active.find((r) => r.type === "gs_sponsored" || r.type === "partner_comp");
  if (unlimited) return { type: unlimited.type, playerCap: unlimited.player_cap ?? null };

  const events = active[0]; // most recent circuit_events
  return { type: events.type, playerCap: events.player_cap ?? null };
}
