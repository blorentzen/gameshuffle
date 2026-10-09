/**
 * GET  /api/admin/shop/orders/[id] → one order with its address and timeline
 *      ?quote=1 → what's left to refund, line by line (Stripe's totals, tax included)
 * POST /api/admin/shop/orders/[id] { action: "ship", tracking } | { action: "tracking", tracking }
 *      | { action: "refund", all: true, restock?, reason? }
 *      | { action: "refund", items?: [{ sku, quantity }], shipping?, amountCents?, reason, note?, restock? }
 *      | { action: "restock" } | { action: "note", text } | { action: "resend" }
 * Staff only.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/shop/adminGuard";
import { ManageError, addNote, markShipped, orderDetail, refundOrder, refundOrderPart, refundQuote, resendConfirmation, restockOrder, updateTracking, type RefundReason } from "@/lib/store/manage";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireStaff(await createClient());
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  const { id } = await params;
  if (new URL(request.url).searchParams.get("quote")) {
    try {
      return NextResponse.json({ ok: true, quote: await refundQuote(id) }, { headers: { "Cache-Control": "private, no-store" } });
    } catch (err) {
      if (err instanceof ManageError) return NextResponse.json({ ok: false, error: err.code }, { status: 400 });
      console.error("[admin/shop/orders quote]", err);
      return NextResponse.json({ ok: false, error: "failed" }, { status: 500 });
    }
  }
  const order = await orderDetail(id);
  return order ? NextResponse.json({ ok: true, order }, { headers: { "Cache-Control": "private, no-store" } }) : NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireStaff(await createClient());
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as {
    action?: string; tracking?: string; restock?: boolean; reason?: RefundReason; text?: string; note?: string;
    all?: boolean; items?: { sku: string; quantity: number }[]; shipping?: boolean; amountCents?: number | null;
  } | null;
  try {
    switch (body?.action) {
      case "ship": await markShipped(id, body.tracking ?? "", gate.userId); break;
      case "tracking": await updateTracking(id, body.tracking ?? "", gate.userId); break;
      case "refund":
        if (body.all) await refundOrder(id, { restock: !!body.restock, reason: body.reason }, gate.userId);
        else await refundOrderPart(id, { items: Array.isArray(body.items) ? body.items.slice(0, 50) : [], shipping: !!body.shipping, amountCents: body.amountCents ?? null, reason: body.reason ?? "other", note: body.note ?? null, restock: !!body.restock }, gate.userId);
        break;
      case "restock": await restockOrder(id, gate.userId); break;
      case "note": await addNote(id, body.text ?? "", gate.userId); break;
      case "resend": await resendConfirmation(id, gate.userId); break;
      default: return NextResponse.json({ ok: false, error: "bad_action" }, { status: 400 });
    }
    return NextResponse.json({ ok: true, order: await orderDetail(id) });
  } catch (err) {
    if (err instanceof ManageError) return NextResponse.json({ ok: false, error: err.code }, { status: 400 });
    console.error("[admin/shop/orders]", err);
    return NextResponse.json({ ok: false, error: "failed" }, { status: 500 });
  }
}
