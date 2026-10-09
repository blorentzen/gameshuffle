/** GET /api/admin/shop/orders?filter=to_ship|shipped|closed|all&q= → shop orders for Platform ▸ Shop orders. Staff only. */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/shop/adminGuard";
import { listOrders, type OrderFilter } from "@/lib/store/manage";

export const runtime = "nodejs";
const FILTERS: OrderFilter[] = ["to_ship", "shipped", "closed", "all"];

export async function GET(request: Request) {
  const gate = await requireStaff(await createClient());
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  const url = new URL(request.url);
  const f = url.searchParams.get("filter") as OrderFilter;
  const orders = await listOrders(FILTERS.includes(f) ? f : "to_ship", url.searchParams.get("q") ?? "");
  return NextResponse.json({ ok: true, orders }, { headers: { "Cache-Control": "private, no-store" } });
}
