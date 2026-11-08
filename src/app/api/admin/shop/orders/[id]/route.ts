/**
 * GET  /api/admin/shop/orders/[id] → one order with its address and timeline
 *      ?quote=1 → what's left to refund, line by line (Stripe's totals, tax included)
 * POST /api/admin/shop/orders/[id] { action: "ship", tracking } | { action: "tracking", tracking }
 *      | { action: "refund", all: true, restock?, reason? }
 *      | { action: "refund", items?: [{ sku, quantity }], shipping?, amountCents?, reason, note?, restock? }
 *      | { action: "restock" } | { action: "note", text } | { action: "resend" }
 *      | { action: "printful_send" }   confirm the Printful draft (Printful charges for it)
 *      | { action: "printful_draft" }  make the Printful draft again after a failure
 *      Order tracking (picks 2026-11-08):
 *      | { action: "message", body, requestId?, status?: "waiting" | "resolved", resolution? }  to the buyer
 *      | { action: "resolve", requestId, resolution } | { action: "reprint", requestId } | { action: "use_address", requestId }
 *      | { action: "sync_boxes" }  read the boxes back from Printful now
 *      A refund with requestId resolves that request as refunded.
 * [id] is the order's id or its number (GS-1021). GET also returns `view` (what the buyer sees), `needs` and `customer`.
 * A full refund of a merch order also deletes or cancels its Printful order while Printful allows it.
 * Staff only.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/shop/adminGuard";
import { cancelAtPrintful, createPrintfulDraft, sendToPrintful } from "@/lib/store/printfulOrders";
import { ManageError, addNote, markShipped, orderDetail, refundOrder, refundOrderPart, refundQuote, resendConfirmation, restockOrder, updateTracking, type RefundReason } from "@/lib/store/manage";
import { applyAddressRequest, reprintRequest, resolveRequest, staffMessage, syncShipments } from "@/lib/store/tracking";
import { customerOrderView, orderByNumber } from "@/lib/store/lookup";
import { parseOrderNumber } from "@/lib/store/access";
import { staffOrderExtras } from "@/lib/store/manage";

/** The order's id from the address: its id, or its number (GS-1021). */
async function idOf(raw: string): Promise<string | null> {
  if (/^[0-9a-f-]{36}$/i.test(raw)) return raw;
  const n = parseOrderNumber(raw);
  return n ? (await orderByNumber(n))?.id ?? null : null;
}
async function full(id: string) {
  const [order, view, extras] = await Promise.all([orderDetail(id), customerOrderView(id), staffOrderExtras(id)]);
  return { order, view, ...extras };
}

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireStaff(await createClient());
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  const id = await idOf((await params).id);
  if (!id) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  if (new URL(request.url).searchParams.get("quote")) {
    try {
      return NextResponse.json({ ok: true, quote: await refundQuote(id) }, { headers: { "Cache-Control": "private, no-store" } });
    } catch (err) {
      if (err instanceof ManageError) return NextResponse.json({ ok: false, error: err.code }, { status: 400 });
      console.error("[admin/shop/orders quote]", err);
      return NextResponse.json({ ok: false, error: "failed" }, { status: 500 });
    }
  }
  const data = await full(id);
  return data.order ? NextResponse.json({ ok: true, ...data }, { headers: { "Cache-Control": "private, no-store" } }) : NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireStaff(await createClient());
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  const id = await idOf((await params).id);
  if (!id) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const body = (await request.json().catch(() => null)) as {
    action?: string; tracking?: string; restock?: boolean; reason?: RefundReason; text?: string; note?: string;
    all?: boolean; items?: { sku: string; quantity: number }[]; shipping?: boolean; amountCents?: number | null;
    body?: string; requestId?: string | null; status?: "waiting" | "resolved" | null; resolution?: string;
  } | null;
  const reqId = typeof body?.requestId === "string" && /^[0-9a-f-]{36}$/i.test(body.requestId) ? body.requestId : null;
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
      case "printful_send": {
        const r = await sendToPrintful(id, gate.userId);
        if (!r.ok) return NextResponse.json({ ok: false, error: r.error.startsWith("test_order") || r.error === "not_paid" ? r.error : "printful", message: r.error }, { status: 400 });
        break;
      }
      case "printful_draft": {
        const r = await createPrintfulDraft(id);
        if (!r.ok) return NextResponse.json({ ok: false, error: "printful", message: r.error }, { status: 400 });
        break;
      }
      case "message": {
        const r = await staffMessage(id, { body: body.body ?? "", requestId: reqId, status: body.status === "waiting" || body.status === "resolved" ? body.status : null, resolution: body.resolution ?? null, actor: gate.userId });
        if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 400 });
        break;
      }
      case "resolve":
        if (!reqId) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
        await resolveRequest(id, reqId, ["answered", "declined", "refunded", "reprinted", "address_changed"].includes(body.resolution ?? "") ? body.resolution! : "answered", gate.userId);
        break;
      case "reprint": {
        if (!reqId) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
        const r = await reprintRequest(id, reqId, gate.userId);
        if (!r.ok) return NextResponse.json({ ok: false, error: "printful", message: r.error }, { status: 400 });
        break;
      }
      case "use_address": {
        if (!reqId) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
        const r = await applyAddressRequest(id, reqId, gate.userId);
        if (!r.ok) return NextResponse.json({ ok: false, error: r.error.startsWith("printful:") ? "printful" : r.error, message: r.error }, { status: 400 });
        break;
      }
      case "sync_boxes": await syncShipments(id); break;
      default: return NextResponse.json({ ok: false, error: "bad_action" }, { status: 400 });
    }
    // A refund made for a problem report closes the report.
    if (body.action === "refund" && reqId) await resolveRequest(id, reqId, "refunded", gate.userId);
    // A merch order refunded in full: take it back out of Printful while Printful still allows it.
    const order = body.action === "refund" ? await orderDetail(id) : null;
    if (order?.status === "refunded" && order.printful.orderId && !["canceled", "fulfilled", "partial"].includes(order.printful.status ?? "")) {
      const c = await cancelAtPrintful(id, gate.userId);
      return NextResponse.json({ ok: true, ...(await full(id)), printfulCanceled: c.canceled, printfulReason: c.canceled ? null : c.reason ?? null });
    }
    return NextResponse.json({ ok: true, ...(await full(id)) });
  } catch (err) {
    if (err instanceof ManageError) return NextResponse.json({ ok: false, error: err.code }, { status: 400 });
    console.error("[admin/shop/orders]", err);
    return NextResponse.json({ ok: false, error: "failed" }, { status: 500 });
  }
}
