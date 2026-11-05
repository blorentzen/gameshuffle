/**
 * Platform ▸ Shop ▸ Merch (staff).
 * GET  → every listing with its colors, prices, margins, Printful products and warnings
 * POST { action: "sync", full? }                     pull from Printful now
 *      { action: "update", id, patch }               name, link, collection, item, description, details, hidden colors, photos, live, archived
 *      { action: "reorder", ids }                    shelf order
 *      { action: "move", productId, listingId }      a Printful product into another listing
 *      { action: "webhooks" }                        what Printful sends us, and where
 *      { action: "connect" }                         point Printful's webhooks here (admins)
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/shop/adminGuard";
import { getBaseUrl } from "@/lib/env";
import { MerchEditError, listAdminListings, moveProduct, reorderListings, updateListing, type ListingPatch } from "@/lib/store/merchCatalog";
import { MerchNotReady, syncFromPrintful } from "@/lib/store/merchSync";
import { PrintfulError, WEBHOOK_TYPES, getWebhooks, printfulConfigured, printfulWebhookToken, setWebhooks } from "@/lib/store/printful";

export const runtime = "nodejs";
// A full sync reads every Printful product at Printful's pace (about 120 requests a minute).
export const maxDuration = 300;

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
const hookUrl = () => `${getBaseUrl()}/api/printful/webhook?token=${printfulWebhookToken()}`;

export async function GET() {
  const gate = await requireStaff(await createClient());
  if (!gate.ok) return json({ ok: false, error: gate.error }, gate.status);
  try {
    return json({ ok: true, configured: printfulConfigured(), ...(await listAdminListings()) });
  } catch (err) {
    if (err instanceof MerchNotReady) return json({ ok: false, error: "not_ready" }, 503);
    console.error("[admin/shop/merch]", err);
    return json({ ok: false, error: "failed" }, 500);
  }
}

export async function POST(request: Request) {
  const gate = await requireStaff(await createClient());
  if (!gate.ok) return json({ ok: false, error: gate.error }, gate.status);
  const body = (await request.json().catch(() => null)) as { action?: string; full?: boolean; id?: string; patch?: ListingPatch; ids?: string[]; productId?: number; listingId?: string } | null;
  try {
    switch (body?.action) {
      case "sync": {
        if (!printfulConfigured()) return json({ ok: false, error: "not_configured" }, 400);
        const summary = await syncFromPrintful({ full: !!body.full });
        return json({ ok: true, summary, ...(await listAdminListings()) });
      }
      case "update":
        if (!body.id || !body.patch) return json({ ok: false, error: "bad_request" }, 400);
        await updateListing(body.id, body.patch);
        break;
      case "reorder":
        if (!Array.isArray(body.ids)) return json({ ok: false, error: "bad_request" }, 400);
        await reorderListings(body.ids.filter((x): x is string => typeof x === "string").slice(0, 300));
        break;
      case "move":
        if (!Number.isFinite(Number(body.productId)) || !body.listingId) return json({ ok: false, error: "bad_request" }, 400);
        await moveProduct(Number(body.productId), body.listingId);
        break;
      case "webhooks": {
        const current = await getWebhooks();
        const ours = hookUrl();
        const want = new Set(WEBHOOK_TYPES as readonly string[]);
        return json({ ok: true, connected: current.url === ours && [...want].every((t) => current.types.includes(t)), url: current.url ? current.url.replace(/token=[^&]+/, "token=…") : null, types: current.types });
      }
      case "connect": {
        const { data: me } = await createServiceClient().from("users").select("role").eq("id", gate.userId).maybeSingle();
        if (me?.role !== "admin") return json({ ok: false, error: "admin_only" }, 403);
        if (!/^https:\/\//.test(getBaseUrl()) || /localhost|127\.0\.0\.1/.test(getBaseUrl())) return json({ ok: false, error: "needs_https" }, 400);
        const r = await setWebhooks(hookUrl());
        return json({ ok: true, connected: true, types: r.types });
      }
      default:
        return json({ ok: false, error: "bad_action" }, 400);
    }
    return json({ ok: true, ...(await listAdminListings()) });
  } catch (err) {
    if (err instanceof MerchEditError) return json({ ok: false, error: err.code }, 400);
    if (err instanceof MerchNotReady) return json({ ok: false, error: "not_ready" }, 503);
    if (err instanceof PrintfulError) return json({ ok: false, error: "printful", message: err.message }, 502);
    console.error("[admin/shop/merch]", err);
    return json({ ok: false, error: "failed" }, 500);
  }
}
