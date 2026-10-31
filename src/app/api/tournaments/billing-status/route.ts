/**
 * GET /api/tournaments/billing-status — public read of where Circuit billing
 * stands, so the create flow and the pricing block show the right wording:
 * `billingEnabled` (the `organizer_billing_enabled` switch), `launchedAt` (when
 * it was first turned on) and, for a signed-in organizer, `plan`: staff,
 * grace (ran tournaments before the launch, so free Circuit until `graceUntil`;
 * Terms §3.4), circuit_64 / circuit_256, or free. With `?tournament=<id>`, an
 * organizer, co-organizer or staff member also gets that tournament's own
 * answer (`tournament`: where its access comes from, its player cap (null =
 * no cap) and whether the paid organizer features are on), for the manage page.
 */

import { NextResponse, type NextRequest } from "next/server";
import { getBillingEnabledAt, getPlatformFlag } from "@/lib/platform/flags";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { circuitGraceFor, resolveTournamentCircuit } from "@/lib/tournaments/circuit-resolve";
import { isStaffRole } from "@/lib/subscription";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const billingEnabled = await getPlatformFlag("organizer_billing_enabled", false);
  if (!billingEnabled) return NextResponse.json({ billingEnabled, launchedAt: null, graceUntil: null, plan: null });

  const launchedAt = (await getBillingEnabledAt())?.toISOString() ?? null;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ billingEnabled, launchedAt, graceUntil: null, plan: null });

  const admin = createServiceClient();
  const { data } = await admin.from("users").select("role, circuit_tier").eq("id", user.id).maybeSingle();
  const row = data as { role: string | null; circuit_tier: string | null } | null;
  const staff = isStaffRole(row?.role ?? null);
  const grace = staff ? null : await circuitGraceFor(admin, user.id);
  const plan = staff ? "staff" : grace ? "grace" : row?.circuit_tier === "circuit_64" || row?.circuit_tier === "circuit_256" ? row.circuit_tier : "free";
  const tournament = await tournamentAnswer(admin, req.nextUrl.searchParams.get("tournament"), user.id, staff);
  return NextResponse.json({ billingEnabled, launchedAt, graceUntil: grace?.toISOString() ?? null, plan, tournament });
}

/** One tournament's Circuit access, for the people who manage it (else null). */
async function tournamentAnswer(admin: ReturnType<typeof createServiceClient>, id: string | null, userId: string, staff: boolean) {
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data: t } = await admin.from("tournaments").select("id, organizer_id, game_slug, created_at").eq("id", id).maybeSingle();
  if (!t) return null;
  const row = t as { id: string; organizer_id: string; game_slug: string | null; created_at: string };
  if (!staff && row.organizer_id !== userId) {
    const { data: co } = await admin.from("tournament_organizers").select("user_id").eq("tournament_id", id).eq("user_id", userId).maybeSingle();
    if (!co) return null;
  }
  const r = await resolveTournamentCircuit(admin, row);
  return { source: r.source, playerCap: Number.isFinite(r.playerCap) ? r.playerCap : null, paidFeatures: r.paidFeatures };
}
