/** POST /api/shop/orders/verify { lookupId, code } → unlocks the order in this browser (signed cookie). */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { rateLimit } from "@/lib/ratelimit";
import { ORDER_COOKIE, cookieOptions, cookieWithOrder } from "@/lib/store/access";
import { finishLookup } from "@/lib/store/lookup";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!(await rateLimit(`shop-verify-ip:${ip}`, { max: 20, windowMs: 15 * 60_000 })).ok) return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  const body = (await request.json().catch(() => null)) as { lookupId?: string; code?: string } | null;
  const r = await finishLookup({ lookupId: String(body?.lookupId ?? ""), code: String(body?.code ?? "") });
  if (!r.ok) return NextResponse.json(r, { status: 400 });
  const jar = await cookies();
  const next = cookieWithOrder(jar.get(ORDER_COOKIE)?.value, r.orderId);
  const res = NextResponse.json({ ok: true, orderCode: r.orderCode });
  res.cookies.set(ORDER_COOKIE, next.value, cookieOptions(next.maxAge));
  return res;
}
