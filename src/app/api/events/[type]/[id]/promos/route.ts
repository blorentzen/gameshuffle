/**
 * GET  /api/events/[type]/[id]/promos → the event's promo codes + usage.
 * POST /api/events/[type]/[id]/promos → create/update a code, or toggle one.
 *      Body: { promo: {...} } | { promoId, active }
 *
 * Organizer only, and creating codes is a paid Circuit organizer feature. The
 * GET reports `entitled` so the UI can show the upsell instead of an empty list.
 * Codes are never exposed publicly: a buyer's typed code is validated at quote
 * time, and there is no public listing.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import type { EventType } from "@/lib/events/calendar";
import { canManageEvent } from "@/lib/events/attendees";
import { organizerHasPaidFeatures } from "@/lib/tournaments/circuit-resolve";
import { listPromoCodes, setPromoActive, upsertPromoCode } from "@/lib/events/tickets";

function parseType(t: string): EventType | null { return t === "tournament" || t === "game-night" ? t : null; }

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ type: string; id: string }> }) {
  const { type: t, id } = await params;
  const type = parseType(t);
  if (!type) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!(await canManageEvent(type, id, user?.id))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const entitled = await organizerHasPaidFeatures(createServiceClient(), user!.id);
  return NextResponse.json({ entitled, promos: await listPromoCodes(type, id) });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ type: string; id: string }> }) {
  const { type: t, id } = await params;
  const type = parseType(t);
  if (!type) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !(await canManageEvent(type, id, user.id))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!(await organizerHasPaidFeatures(createServiceClient(), user.id))) {
    return NextResponse.json({ error: "circuit_required" }, { status: 402 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    promo?: { id?: string; code?: string; kind?: string; value?: number; maxRedemptions?: number | null; tierId?: string | null; startsAt?: string | null; endsAt?: string | null };
    promoId?: string; active?: boolean;
  };

  try {
    if (body.promoId && typeof body.active === "boolean") {
      await setPromoActive({ type, eventId: id, actorId: user.id, promoId: body.promoId, active: body.active });
      return NextResponse.json({ ok: true });
    }
    const p = body.promo;
    if (!p?.code || (p.kind !== "percent" && p.kind !== "amount") || !p.value) {
      return NextResponse.json({ error: "bad_request" }, { status: 400 });
    }
    const res = await upsertPromoCode({
      type, eventId: id, actorId: user.id,
      promo: { id: p.id, code: p.code, kind: p.kind, value: p.value, maxRedemptions: p.maxRedemptions ?? null, tierId: p.tierId ?? null, startsAt: p.startsAt ?? null, endsAt: p.endsAt ?? null },
    });
    return NextResponse.json({ ok: true, ...res });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "failed";
    return NextResponse.json({ error: msg }, { status: msg === "code_taken" ? 409 : 400 });
  }
}
