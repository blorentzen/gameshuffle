/**
 * POST /api/events/[type]/[id]/checkout → quote or buy tickets.
 * Body: { tierId, quantity, quoteOnly?, email?, name?, accessCode?, promoCode? }
 * Buyers may be signed out for tournaments (guest tickets); game nights need
 * an account because an RSVP is a user row.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { EventType } from "@/lib/events/calendar";

function parseType(t: string): EventType | null { return t === "tournament" || t === "game-night" ? t : null; }
import { createTicketCheckout, quoteTickets } from "@/lib/events/tickets";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ type: string; id: string }> }) {
  const { type: t, id } = await params;
  const type = parseType(t);
  if (!type) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { tierId?: string; quantity?: number; quoteOnly?: boolean; email?: string; name?: string; accessCode?: string; promoCode?: string };
  if (!body.tierId) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const quantity = Math.max(1, Math.min(20, Math.round(body.quantity ?? 1)));

  try {
    if (body.quoteOnly) {
      return NextResponse.json({ quote: await quoteTickets(type, id, body.tierId, quantity, body.promoCode ?? null) });
    }
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user && type === "game-night") return NextResponse.json({ error: "sign_in_required" }, { status: 401 });
    const email = user?.email ?? (typeof body.email === "string" ? body.email.trim().slice(0, 200) : null);
    if (!email) return NextResponse.json({ error: "email_required" }, { status: 400 });
    let name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : null;
    if (user && !name) {
      const { data } = await supabase.from("users").select("display_name").eq("id", user.id).maybeSingle();
      name = (data?.display_name as string | null) ?? null;
    }
    const res = await createTicketCheckout({ type, eventId: id, tierId: body.tierId, quantity, buyerUserId: user?.id ?? null, buyerEmail: email, buyerName: name, accessCode: body.accessCode ?? null, promoCode: body.promoCode ?? null });
    return NextResponse.json({ ok: true, ...res });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "failed";
    const status = msg === "organizer_not_ready" || msg === "tier_sold_out" || msg === "event_full" || msg === "sales_closed" || msg === "sales_not_open" ? 409 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
