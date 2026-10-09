/**
 * GET   /api/admin/shop/products → the whole catalog incl. archived, with held and sold counts
 * POST  /api/admin/shop/products { product } → add a product (Stripe Product + Price + row)
 * PATCH /api/admin/shop/products { sku, product } → edit (price change = new Stripe Price)
 *       { sku, action: "archive" | "restore" }
 * Staff only. Live-mode writes need the shop_live_catalog platform flag.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/shop/adminGuard";
import { CatalogError, createProduct, listAdminProducts, setArchived, updateProduct, type ProductInput } from "@/lib/store/catalog";

export const runtime = "nodejs";

const fail = (err: unknown) => {
  if (err instanceof CatalogError) return NextResponse.json({ ok: false, error: err.code }, { status: 400 });
  console.error("[admin/shop/products]", err);
  return NextResponse.json({ ok: false, error: "failed" }, { status: 500 });
};

export async function GET() {
  const gate = await requireStaff(await createClient());
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  return NextResponse.json({ ok: true, products: await listAdminProducts(), live: (process.env.STRIPE_SECRET_KEY ?? "").startsWith("sk_live_") }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  const gate = await requireStaff(await createClient());
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  const body = (await request.json().catch(() => null)) as { product?: ProductInput } | null;
  if (!body?.product) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  try { return NextResponse.json({ ok: true, product: await createProduct(body.product, gate.userId) }); } catch (err) { return fail(err); }
}

export async function PATCH(request: Request) {
  const gate = await requireStaff(await createClient());
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  const body = (await request.json().catch(() => null)) as { sku?: string; product?: ProductInput; action?: string } | null;
  if (!body?.sku) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  try {
    if (body.action === "archive" || body.action === "restore") return NextResponse.json({ ok: true, product: await setArchived(body.sku, body.action === "archive", gate.userId) });
    if (!body.product) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
    return NextResponse.json({ ok: true, product: await updateProduct(body.sku, body.product, gate.userId) });
  } catch (err) { return fail(err); }
}
