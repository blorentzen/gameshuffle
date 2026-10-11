/** GET /api/account/shop-orders → this account's shop orders (placed signed in, or with its confirmed email). */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { accountOrders } from "@/lib/store/lookup";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  const orders = await accountOrders(user.id, user.email_confirmed_at ? user.email ?? null : null).catch((err) => {
    console.error("[account/shop-orders]", err);
    return null;
  });
  return orders ? NextResponse.json({ ok: true, orders }, { headers: { "Cache-Control": "private, no-store" } }) : NextResponse.json({ ok: false, error: "not_ready" }, { status: 503 });
}
