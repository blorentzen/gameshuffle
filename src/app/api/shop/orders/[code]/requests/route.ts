/**
 * POST /api/shop/orders/GS-1005/requests: a buyer asks for help from their order page (order tracking picks
 * 2026-11-08): a problem with an item (with photos, a replacement or a refund), a question, or a new address before
 * it ships. Multipart: kind, sku, problem, wants, body, address fields, photos. Only someone who can see the order.
 */

import { NextResponse } from "next/server";
import { orderForViewer } from "@/lib/store/orderViewer";
import { createRequest } from "@/lib/store/tracking";
import { rateLimit } from "@/lib/ratelimit";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const who = await orderForViewer(code);
  if (!who) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  if (!(await rateLimit(`shop-request:${who.order.id}`, { max: 6, windowMs: 60 * 60_000 })).ok) return NextResponse.json({ ok: false, error: "too_many" }, { status: 429 });
  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ ok: false, error: "bad_body" }, { status: 400 });
  const str = (k: string) => { const v = form.get(k); return typeof v === "string" ? v : null; };
  const photos = form.getAll("photos").filter((f): f is File => typeof f === "object" && f !== null && "arrayBuffer" in f && (f as File).size > 0);
  const { data: o } = await createServiceClient().from("shop_orders").select("shipped_at, delivered_at").eq("id", who.order.id).maybeSingle();
  const r = await createRequest(
    { id: who.order.id, status: who.order.status, shipped_at: (o?.shipped_at as string | null) ?? null, delivered_at: (o?.delivered_at as string | null) ?? null },
    {
      kind: str("kind") ?? "", sku: str("sku"), problem: str("problem"), wants: str("wants"), body: str("body"),
      address: str("line1") ? { name: str("name") ?? "", line1: str("line1") ?? "", line2: str("line2"), city: str("city") ?? "", state: str("state") ?? "", postal: str("postal") ?? "" } : null,
    },
    photos, who.userId,
  );
  if (!r.ok) return NextResponse.json(r, { status: r.error === "not_ready" ? 503 : 400 });
  return NextResponse.json(r);
}
