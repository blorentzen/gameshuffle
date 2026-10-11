import "server-only";

/**
 * The one place that resolves a tournament's effective Circuit access, applying
 * the full Decision-8 precedence plus Phase-6 grandfathering:
 *
 *   billing flag OFF                         → full access (preview)
 *   created before billing_enabled_at        → full access (grandfathered)
 *   organizer had a tournament before launch → full access for 30 days after
 *                                              the launch email (Terms §3.4)
 *   per-tournament override                  → full access, cap from override
 *   organizer's active subscription tier     → tier cap + paid features
 *   otherwise                                → Free (one game lobby, no paid features)
 *
 * Everything downstream (cap enforcement, feature gates) goes through this, so
 * while billing is OFF it uniformly returns full access and nothing changes.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/admin";
import { getPlatformFlag, getBillingEnabledAt, getCircuitNoticeAt } from "@/lib/platform/flags";
import { getTournamentOverride } from "@/lib/tournaments/circuitOverride";
import { getGameLobbySize } from "@/lib/tournaments/gameData";
import { biggerFieldLine, circuitGraceEnd, resolveCircuit, type CircuitResolution, type CircuitTierId, type CircuitFeature } from "@/lib/tournaments/circuit";
import { isStaffRole } from "@/lib/subscription";
import { seatStatuses } from "@/lib/events/waitlistRules";
import { createNotification } from "@/lib/social/notifications";
import { gsDay, gsDayStart } from "@/lib/time/gsClock";

const FULL: CircuitResolution = { playerCap: Number.POSITIVE_INFINITY, paidFeatures: true, source: "preview" };
const GRACE: CircuitResolution = { playerCap: Number.POSITIVE_INFINITY, paidFeatures: true, source: "grace" };
const GRANDFATHERED: CircuitResolution = { playerCap: Number.POSITIVE_INFINITY, paidFeatures: true, source: "grandfathered" };

/**
 * Where the launch stands for server pages: the launch moment once the billing
 * switch is on (null while it's off), and when earlier organizers' free
 * Circuit ends (null until launch).
 */
export async function circuitLaunchState(): Promise<{ launchedAt: string | null; graceEnd: { at: number; label: string } | null }> {
  if (!(await getPlatformFlag("organizer_billing_enabled", false))) return { launchedAt: null, graceEnd: null };
  const launchedAt = (await getBillingEnabledAt())?.toISOString() ?? null;
  const noticeAt = (await getCircuitNoticeAt())?.toISOString() ?? null;
  return { launchedAt, graceEnd: circuitGraceEnd(launchedAt, noticeAt) };
}

/**
 * An organizer who created a tournament before Circuit launched keeps every
 * Circuit feature free until CIRCUIT_LAUNCH_GRACE_DAYS after the later of the
 * launch and the launch email. Returns when that ends, or null when it doesn't
 * apply (billing off, a newer organizer, or the time is up).
 */
export async function circuitGraceFor(admin: SupabaseClient, userId: string): Promise<Date | null> {
  const anchor = await getBillingEnabledAt();
  if (!anchor) return null;
  const end = circuitGraceEnd(anchor.toISOString(), (await getCircuitNoticeAt())?.toISOString() ?? null);
  if (!end || Date.now() >= end.at) return null;
  const { data } = await admin
    .from("tournaments")
    .select("id")
    .eq("organizer_id", userId)
    .lt("created_at", anchor.toISOString())
    .limit(1);
  return data && data.length ? new Date(end.at) : null;
}

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
    return GRANDFATHERED;
  }
  if (await circuitGraceFor(admin, tournament.organizer_id)) return GRACE;

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
  if (await circuitGraceFor(admin, userId)) return true;
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

/**
 * Someone joined a tournament's waitlist because it's full on the organizer's
 * Circuit plan (after Circuit launched). Tell the organizer how many are
 * waiting and what lets them in, at most once a Pacific day per tournament.
 */
export async function noteCircuitWaitlist(tournamentId: string): Promise<void> {
  try {
    const admin = createServiceClient();
    const { data: t } = await admin.from("tournaments").select("id, title, organizer_id, game_slug, created_at").eq("id", tournamentId).maybeSingle();
    if (!t) return;
    const row = t as TournamentForCircuit & { title: string | null };
    const cap = await tournamentPlayerCap(admin, row);
    if (!Number.isFinite(cap)) return;
    const since = gsDayStart(gsDay()).toISOString();
    const { data: seen } = await admin.from("notifications").select("id")
      .eq("user_id", row.organizer_id).eq("type", "tournament_plan_waitlist")
      .gte("created_at", since).contains("data", { tournament_id: tournamentId }).limit(1);
    if (seen && seen.length) return;
    const { count } = await admin.from("tournament_participants").select("id", { count: "exact", head: true }).eq("tournament_id", tournamentId).eq("status", "waitlisted");
    const waiting = count ?? 1;
    const title = row.title?.trim() || "your tournament";
    await createNotification({
      userId: row.organizer_id,
      type: "tournament_plan_waitlist",
      title: `${waiting === 1 ? "Someone is" : `${waiting} people are`} waiting to join ${title}`,
      message: `It's full at ${cap} players on your plan, so they're on the waitlist. ${biggerFieldLine(cap)} Upgrade and they're offered spots in line order.`,
      link: `/tournament/${tournamentId}/manage`,
      data: { tournament_id: tournamentId, cap, waiting },
    });
  } catch (err) {
    console.warn("[circuit] waitlist note failed", err);
  }
}
