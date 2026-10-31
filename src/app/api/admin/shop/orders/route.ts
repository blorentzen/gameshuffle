/**
 * GET /api/admin/shop/orders?filter=to_ship|shipped|closed|all&q=[&summary=1] → shop orders (and the stat row) for Platform ▸ Shop ▸ Orders.
 * GET /api/admin/shop/orders?states=1 → sales by state for Platform ▸ Shop ▸ States. Staff only.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/shop/adminGuard";
import { listOrders, ordersSummary, stateSales, type OrderFilter } from "@/lib/store/manage";

export const runtime = "nodejs";
const FILTERS: OrderFilter[] = ["to_ship", "shipped", "closed", "all"];

export async function GET(request: Request) {
  const gate = await requireStaff(await createClient());
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  const url = new URL(request.url);
  if (url.searchParams.get("states") === "1") {
    return NextResponse.json({ ok: true, states: await stateSales() }, { headers: { "Cache-Control": "private, no-store" } });
  }
  const f = url.searchParams.get("filter") as OrderFilter;
  const [orders, summary] = await Promise.all([
    listOrders(FILTERS.includes(f) ? f : "to_ship", url.searchParams.get("q") ?? ""),
    url.searchParams.get("summary") === "1" ? ordersSummary() : Promise.resolve(null),
  ]);
  return NextResponse.json({ ok: true, orders, summary }, { headers: { "Cache-Control": "private, no-store" } });
}
