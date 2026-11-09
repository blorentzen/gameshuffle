/**
 * POST /api/printful/webhook?token=… : Printful's events (set up from
 * Platform ▸ Shop ▸ Merch, Connect Printful updates). Printful's v1 webhooks
 * aren't signed, so the link carries a secret (printfulWebhookToken) and
 * nothing in the body is trusted: order events read the order back from
 * Printful, product events start a sync. A 5xx makes Printful retry
 * (after 1, 4, 16, 64, 256 and 1024 minutes).
 */

import { NextResponse, after } from "next/server";
import { webhookTokenOk } from "@/lib/store/printful";
import { handlePrintfulEvent, type PrintfulEvent } from "@/lib/store/printfulOrders";
import { syncFromPrintful } from "@/lib/store/merchSync";
import { rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";
// A product event runs the whole Printful sync after the reply (a minute or two), so the same room as Sync from Printful.
export const maxDuration = 300;

export async function POST(request: Request) {
  if (!webhookTokenOk(new URL(request.url).searchParams.get("token"))) return NextResponse.json({ ok: false }, { status: 401 });
  const ev = (await request.json().catch(() => null)) as PrintfulEvent | null;
  if (!ev?.type) return NextResponse.json({ ok: false, error: "bad_body" }, { status: 400 });

  if (ev.type.startsWith("product_")) {
    // Edits in Printful arrive one product at a time; one sync a minute catches them all (Sync from Printful covers the rest).
    if ((await rateLimit("printful-product-sync", { max: 1, windowMs: 60_000 })).ok) {
      after(() => syncFromPrintful({ deadline: Date.now() + 210_000 }).then((s) => console.log("[printful] synced", s.variants, "rows")).catch((e) => console.error("[printful] sync failed:", e)));
    }
    return NextResponse.json({ ok: true, result: "sync" });
  }
  try {
    const result = await handlePrintfulEvent(ev);
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    console.error("[printful] webhook:", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
