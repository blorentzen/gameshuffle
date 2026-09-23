/**
 * GET  /api/events/[type]/[id]/tiers → public ticket tiers (+ sold counts).
 * POST /api/events/[type]/[id]/tiers → create/update a tier, or toggle active.
 *      Organizer only. Body: { tier: {...} } | { tierId, active }
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { EventType } from "@/lib/events/calendar";

function parseType(t: string): EventType | null { return t === "tournament" || t === "game-night" ? t : null; }
import { canManageEvent } from "@/lib/events/attendees";
import { listTiers, setTierActive, upsertTier } from "@/lib/events/tickets";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ type: string; id: string }> }) {
  const { type: t, id } = await params;
  const type = parseType(t);
  if (!type) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const manage = req.nextUrl.searchParams.get("manage") === "1" && (await canManageEvent(type, id, user?.id));
  const tiers = await listTiers(type, id, { includeInactive: !!manage, withSecrets: !!manage, accessCode: req.nextUrl.searchParams.get("code") });
  return NextResponse.json({ tiers });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ type: string; id: string }> }) {
  const { type: t, id } = await params;
  const type = parseType(t);
  if (!type) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !(await canManageEvent(type, id, user.id))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    if (typeof body.tierId === "string" && typeof body.active === "boolean") {
      await setTierActive({ type, eventId: id, tierId: body.tierId, active: body.active, actorId: user.id });
      return NextResponse.json({ ok: true });
    }
    const tier = body.tier as Record<string, unknown> | undefined;
    if (!tier || typeof tier.name !== "string" || typeof tier.amountCents !== "number") return NextResponse.json({ error: "bad_request" }, { status: 400 });
    const res = await upsertTier({ type, eventId: id, actorId: user.id, tier: tier as never });
    return NextResponse.json({ ok: true, ...res });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 400 });
  }
}
