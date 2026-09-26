/**
 * The draw: read its state, run one, or annotate an entrant.
 *
 * Organizer-only throughout. `tournament_seeding_private` has organizer RLS, but
 * these run on the service client (like the rest of the attendee layer), so the
 * permission check here is the one that matters and is done first every time.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canManageEvent } from "@/lib/events/attendees";
import { getSeedingState, runDraw, setAnnotation } from "@/lib/tournaments/seedingStore";
import type { SeedingMethod, Tier } from "@/lib/tournaments/seeding";

export const runtime = "nodejs";

const METHODS = new Set(["random", "manual", "protected", "tiered", "standings"]);

async function guard(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { res: NextResponse.json({ error: "Sign in first." }, { status: 401 }) };
  if (!(await canManageEvent("tournament", id, user.id))) {
    return { res: NextResponse.json({ error: "You don't run this tournament." }, { status: 403 }) };
  }
  return { userId: user.id };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await guard(id);
  if (g.res) return g.res;

  const state = await getSeedingState(id);
  // Null means the columns are not there yet. The UI hides the section rather
  // than showing controls whose save would fail.
  if (!state) return NextResponse.json({ error: "not_migrated" }, { status: 503 });
  return NextResponse.json({ state });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await guard(id);
  if (g.res) return g.res;

  const body = (await request.json().catch(() => ({}))) as {
    method?: string; protectedCount?: number; manualOrder?: string[];
  };
  if (!body.method || !METHODS.has(body.method)) {
    return NextResponse.json({ error: "Pick a seeding method." }, { status: 400 });
  }

  const result = await runDraw({
    tournamentId: id,
    actorId: g.userId!,
    method: body.method as SeedingMethod,
    protectedCount: body.protectedCount,
    manualOrder: body.manualOrder,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true, order: result.order, rng: result.rng });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await guard(id);
  if (g.res) return g.res;

  const { participantId, tier, protectedRank } = (await request.json().catch(() => ({}))) as {
    participantId?: string; tier?: Tier | null; protectedRank?: number | null;
  };
  if (!participantId) return NextResponse.json({ error: "Missing participantId" }, { status: 400 });
  if (tier != null && !["A", "B", "C"].includes(tier)) {
    return NextResponse.json({ error: "Tier must be A, B or C." }, { status: 400 });
  }

  const out = await setAnnotation({ tournamentId: id, participantId, tier, protectedRank });
  if (!out.ok) return NextResponse.json({ error: out.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
