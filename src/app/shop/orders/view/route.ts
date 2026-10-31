/** GET /shop/orders/view?t=… → the "View your order" link from order emails: unlock the order in this browser, then show it. */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ORDER_COOKIE, cookieOptions, cookieWithOrder, readOrderLinkToken } from "@/lib/store/access";
import { orderById } from "@/lib/store/lookup";
import { orderCode } from "@/lib/store/rules";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const orderId = readOrderLinkToken(url.searchParams.get("t"));
  const order = orderId ? await orderById(orderId) : null;
  if (!order) return NextResponse.redirect(new URL("/shop/orders?link=expired", url.origin));
  const jar = await cookies();
  const next = cookieWithOrder(jar.get(ORDER_COOKIE)?.value, order.id);
  const res = NextResponse.redirect(new URL(`/shop/orders/${orderCode(order.order_number)}`, url.origin));
  res.cookies.set(ORDER_COOKIE, next.value, cookieOptions(next.maxAge));
  return res;
}
