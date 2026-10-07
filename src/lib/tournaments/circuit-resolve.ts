import "server-only";

/**
 * The one place that resolves a tournament's effective Circuit access, applying
 * the full Decision-8 precedence plus Phase-6 grandfathering:
 *
 *   billing flag OFF                         → full access (preview)
 *   created before billing_enabled_at        → full access (grandfathered)
 *   per-tournament override                  → full access, cap from override
 *   organizer's active subscription tier     → tier cap + paid features
 *   otherwise                                → Free (one game lobby, no paid features)
 *
 * Everything downstream (cap enforcement, feature gates) goes through this, so
 * while billing is OFF it uniformly returns full access and nothing changes.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getPlatformFlag, getBillingEnabledAt } from "@/lib/platform/flags";
import { getTournamentOverride } from "@/lib/tournaments/circuitOverride";
import { getGameLobbySize } from "@/lib/tournaments/gameData";
import { resolveCircuit, type CircuitResolution, type CircuitTierId, type CircuitFeature } from "@/lib/tournaments/circuit";
import { isStaffRole } from "@/lib/subscription";
import { seatStatuses } from "@/lib/events/waitlistRules";

const FULL: CircuitResolution = { playerCap: Number.POSITIVE_INFINITY, paidFeatures: true, source: "preview" };

export interface TournamentForCircuit {
  id: string;
  game_slug: string | null;
  organizer_id: string;
  created_at?: string | null;
}

export async function resolveTournamentCircuit(admin: SupabaseClient, tournament: TournamentForCircuit): Promise<CircuitResolution> {
  const billingEnabled = await getPlatformFlag("organizer_billing_enabled", false);
  if (!billingEnabled) return FULL;

  // Grandfathering: a tournament created before billing turned on keeps full
  // access through completion.
  const anchor = await getBillingEnabledAt();
  if (anchor && tournament.created_at && new Date(tournament.created_at).getTime() < anchor.getTime()) {
    return FULL;
  }

  const [override, orgRes] = await Promise.all([
    getTournamentOverride(admin, tournament.id),
    admin.from("users").select("circuit_tier, role").eq("id", tournament.organizer_id).maybeSingle(),
  ]);
  const org = orgRes.data as { circuit_tier: string | null; role: string | null } | null;

  return resolveCircuit({
    billingEnabled,
    isStaff: isStaffRole(org?.role ?? null),
    circuitTier: (org?.circuit_tier ?? null) as CircuitTierId | null,
    override,
    gameLobbySize: getGameLobbySize(tournament.game_slug),
  });
}

/**
 * Account-level version, for organizer features that aren't about one
 * tournament (ticket analytics, promo codes). Same precedence, minus the
 * per-tournament override and grandfathering, which have nothing to apply to.
 */
export async function organizerHasPaidFeatures(admin: SupabaseClient, userId: string): Promise<boolean> {
  const billingEnabled = await getPlatformFlag("organizer_billing_enabled", false);
  if (!billingEnabled) return true;
  const { data } = await admin.from("users").select("circuit_tier, role").eq("id", userId).maybeSingle();
  const org = data as { circuit_tier: string | null; role: string | null } | null;
  return resolveCircuit({
    billingEnabled,
    isStaff: isStaffRole(org?.role ?? null),
    circuitTier: (org?.circuit_tier ?? null) as CircuitTierId | null,
  }).paidFeatures;
}

/** Convenience: can this tournament use a paid organizer feature right now? */
export async function tournamentHasFeature(admin: SupabaseClient, tournament: TournamentForCircuit, _feature: CircuitFeature): Promise<boolean> {
  return (await resolveTournamentCircuit(admin, tournament)).paidFeatures;
}

/** Convenience: the effective player cap for this tournament. */
export async function tournamentPlayerCap(admin: SupabaseClient, tournament: TournamentForCircuit): Promise<number> {
  return (await resolveTournamentCircuit(admin, tournament)).playerCap;
}

/**
 * Is the field already at this tournament's Circuit cap (a free organizer's
 * one lobby, Circuit 64, Circuit 256)? Seats are counted the way the waitlist
 * counts them. Always false while organizer billing is off, because the cap is
 * unlimited then (Circuit is free in preview).
 */
export async function atCircuitCap(admin: SupabaseClient, tournament: TournamentForCircuit): Promise<boolean> {
  const cap = await tournamentPlayerCap(admin, tournament);
  if (!Number.isFinite(cap)) return false;
  const { count } = await admin.from("tournament_participants").select("id", { count: "exact", head: true })
    .eq("tournament_id", tournament.id).in("status", seatStatuses("tournament"));
  return (count ?? 0) >= cap;
}
