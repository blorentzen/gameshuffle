/**
 * POST /api/events/orders/[orderId]/confirm → fulfil a just-paid order.
 *
 * Stripe's own guidance is to fulfil in two places: the webhook and the return
 * from Checkout. The webhook is authoritative but can be late, blocked, or (on
 * a local dev box) absent entirely, and a buyer who has just paid should not be
 * looking at a page that still says "get tickets". Stripe is the only authority
 * on whether money moved, so this reads the session back rather than trusting
 * the caller, and `fulfilTicketOrder` is idempotent for the webhook race.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getStripe } from "@/lib/stripe/client";
import { fulfilTicketOrder } from "@/lib/events/tickets";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const { data: order } = await createServiceClient()
    .from("gs_ticket_orders").select("status, stripe_checkout_session_id").eq("id", orderId).maybeSingle();
  if (!order) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (order.status === "paid") return NextResponse.json({ ok: true, status: "paid" });
  const sessionId = order.stripe_checkout_session_id as string | null;
  if (!sessionId) return NextResponse.json({ error: "no_session" }, { status: 409 });

  const session = await getStripe().checkout.sessions.retrieve(sessionId);
  if (session.payment_status !== "paid") return NextResponse.json({ ok: false, status: session.payment_status });
  const res = await fulfilTicketOrder(session);
  return res.ok ? NextResponse.json({ ok: true, status: "paid" }) : NextResponse.json({ error: res.reason }, { status: 409 });
}
