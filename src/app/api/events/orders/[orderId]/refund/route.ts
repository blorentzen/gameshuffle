/**
 * POST /api/events/orders/[orderId]/refund → refund a paid ticket order.
 * The buyer may refund inside the event's policy window; the organizer may
 * always refund. Fees are kept unless the event was cancelled or the organizer
 * set them refundable; the transfer reverses to match and the seat is released.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { refundOrder } from "@/lib/events/tickets";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { asOrganizer?: boolean };
  const res = await refundOrder(orderId, user.id, !!body.asOrganizer);
  return res.ok ? NextResponse.json({ ok: true, refundedCents: res.refundedCents ?? 0 }) : NextResponse.json({ error: res.reason }, { status: res.reason === "forbidden" ? 403 : 409 });
}
