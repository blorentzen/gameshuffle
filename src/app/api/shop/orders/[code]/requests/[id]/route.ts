/** POST /api/shop/orders/GS-1005/requests/<id> { body }: the buyer adds to their request. */

import { NextResponse } from "next/server";
import { orderForViewer } from "@/lib/store/orderViewer";
import { buyerReply } from "@/lib/store/tracking";
import { rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ code: string; id: string }> }) {
  const { code, id } = await params;
  const who = await orderForViewer(code);
  if (!who || !/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  if (!(await rateLimit(`shop-reply:${who.order.id}`, { max: 10, windowMs: 60 * 60_000 })).ok) return NextResponse.json({ ok: false, error: "too_many" }, { status: 429 });
  const body = (await request.json().catch(() => null)) as { body?: unknown } | null;
  const r = await buyerReply(who.order.id, id, typeof body?.body === "string" ? body.body : "");
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}
