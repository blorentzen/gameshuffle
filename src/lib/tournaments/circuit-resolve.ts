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

/** Convenience: can this tournament use a paid organizer feature right now? */
export async function tournamentHasFeature(admin: SupabaseClient, tournament: TournamentForCircuit, _feature: CircuitFeature): Promise<boolean> {
  return (await resolveTournamentCircuit(admin, tournament)).paidFeatures;
}

/** Convenience: the effective player cap for this tournament. */
export async function tournamentPlayerCap(admin: SupabaseClient, tournament: TournamentForCircuit): Promise<number> {
  return (await resolveTournamentCircuit(admin, tournament)).playerCap;
}
