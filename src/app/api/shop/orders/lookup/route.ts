/**
 * POST /api/shop/orders/lookup { order, contact } → a code to the order's email or phone.
 * The answer is the same whether or not an order matched. Rate limited.
 */
import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/ratelimit";
import { ipHash, parseOrderNumber } from "@/lib/store/access";
import { startLookup } from "@/lib/store/lookup";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const body = (await request.json().catch(() => null)) as { order?: string; contact?: string } | null;
  const orderNumber = parseOrderNumber(body?.order);
  if (!(await rateLimit(`shop-lookup-ip:${ip}`, { max: 6, windowMs: 15 * 60_000 })).ok) return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  if (orderNumber && !(await rateLimit(`shop-lookup-order:${orderNumber}`, { max: 4, windowMs: 15 * 60_000 })).ok) return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  try {
    const r = await startLookup({ orderInput: orderNumber, contact: String(body?.contact ?? ""), ipHash: ipHash(ip) });
    return r.ok ? NextResponse.json(r) : NextResponse.json(r, { status: 400 });
  } catch (err) {
    console.error("[shop/orders/lookup]", err);
    return NextResponse.json({ ok: false, error: "failed" }, { status: 500 });
  }
}
