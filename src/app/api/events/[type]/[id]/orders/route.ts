/** GET /api/events/[type]/[id]/orders → ticket orders + revenue (organizer only). */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { EventType } from "@/lib/events/calendar";

function parseType(t: string): EventType | null { return t === "tournament" || t === "game-night" ? t : null; }
import { canManageEvent } from "@/lib/events/attendees";
import { listOrders } from "@/lib/events/tickets";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ type: string; id: string }> }) {
  const { type: t, id } = await params;
  const type = parseType(t);
  if (!type) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!(await canManageEvent(type, id, user?.id))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const orders = await listOrders(type, id);
  const paid = orders.filter((o) => o.status === "paid");
  return NextResponse.json({
    orders,
    totals: {
      tickets: paid.reduce((n, o) => n + o.quantity, 0),
      grossCents: paid.reduce((n, o) => n + o.subtotalCents, 0),
      feesCents: paid.reduce((n, o) => n + o.platformFeeCents, 0),
      refundedCents: orders.filter((o) => o.status === "refunded").reduce((n, o) => n + o.subtotalCents, 0),
    },
  });
}
