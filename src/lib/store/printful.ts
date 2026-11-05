import "server-only";

/**
 * Printful's API (v1), with the store-level private token in
 * PRINTFUL_API_TOKEN (scopes: orders, sync_products, webhooks). Only the calls
 * the shop needs: read products, price shipping, create and confirm orders,
 * read and cancel them, set the webhook.
 *
 * Printful's v1 webhooks aren't signed, so ours carries a secret in its link
 * (printfulWebhookToken, derived from the service role key like the Activity
 * session key) and every event is checked by reading the order back.
 */

import { createHash, timingSafeEqual } from "node:crypto";

const BASE = "https://api.printful.com";

export class PrintfulError extends Error {
  constructor(public status: number, message: string, public code: string = "printful_error") { super(message); this.name = "PrintfulError"; }
}

export const printfulConfigured = () => !!process.env.PRINTFUL_API_TOKEN;

/**
 * Printful allows about 120 requests a minute. A read that's told to slow down waits the seconds Printful names
 * (a minute at most) and tries again, up to 3 times; writes never retry, so an order can't be sent twice.
 */
async function call<T>(path: string, init: RequestInit = {}, attempt = 0): Promise<T> {
  const token = process.env.PRINTFUL_API_TOKEN;
  if (!token) throw new PrintfulError(0, "PRINTFUL_API_TOKEN is not set", "not_configured");
  const res = await fetch(BASE + path, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    cache: "no-store",
    signal: init.signal ?? AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  let body: { code?: number; result?: unknown; error?: { message?: string; reason?: string } } | null = null;
  try { body = JSON.parse(text); } catch { /* not JSON */ }
  if (!res.ok) {
    const msg = body?.error?.message || (typeof body?.result === "string" ? body.result : "") || text.slice(0, 200) || `HTTP ${res.status}`;
    if (res.status === 429 && (init.method ?? "GET") === "GET" && attempt < 3) {
      const wait = Math.min(Number(/(\d+)\s*seconds?/.exec(msg)?.[1] ?? 60), 60) + 1;
      await new Promise((r) => setTimeout(r, wait * 1000));
      return call<T>(path, init, attempt + 1);
    }
    throw new PrintfulError(res.status, msg, res.status === 404 ? "not_found" : res.status === 429 ? "rate_limited" : "printful_error");
  }
  return (body?.result ?? body) as T;
}

// ─── products ───────────────────────────────────────────────────────────────

export interface PfFile { type: string; preview_url: string | null; thumbnail_url: string | null; filename: string | null; visible: boolean; status: string }
export interface PfSyncVariant {
  id: number; external_id: string; sync_product_id: number; name: string; synced: boolean; variant_id: number;
  retail_price: string; currency: string; sku: string | null; size: string | null; color: string | null;
  availability_status: string; is_ignored: boolean;
  product: { variant_id: number; product_id: number; image: string; name: string };
  files: PfFile[];
}
export interface PfSyncProduct { id: number; external_id: string; name: string; variants: number; synced: number; thumbnail_url: string | null; is_ignored: boolean }

export async function listSyncProducts(): Promise<PfSyncProduct[]> {
  const out: PfSyncProduct[] = [];
  for (let offset = 0; offset < 2000; offset += 100) {
    const page = await call<PfSyncProduct[]>(`/store/products?limit=100&offset=${offset}`);
    out.push(...page);
    if (page.length < 100) break;
  }
  return out;
}

export async function getSyncProduct(id: number): Promise<{ sync_product: PfSyncProduct; sync_variants: PfSyncVariant[] }> {
  return call(`/store/products/${id}`);
}

export interface PfCatalogVariant { id: number; product_id: number; name: string; size: string; color: string | null; color_code: string | null; price: string; in_stock: boolean }
export interface PfCatalogProduct { product: { id: number; type: string; type_name: string; title: string; brand: string | null; model: string | null; description: string }; variants: PfCatalogVariant[] }

const catalogCache = new Map<number, { at: number; value: PfCatalogProduct }>();
/** A blank from Printful's catalog (cost, color codes, description), cached for an hour. */
export async function getCatalogProduct(id: number): Promise<PfCatalogProduct> {
  const hit = catalogCache.get(id);
  if (hit && Date.now() - hit.at < 3_600_000) return hit.value;
  const value = await call<PfCatalogProduct>(`/products/${id}`);
  catalogCache.set(id, { at: Date.now(), value });
  return value;
}

export interface PfSizeTable { type: string; unit: string; measurements: { type_label: string; values: { size: string; value?: string; min_value?: string; max_value?: string }[] }[] }
export async function getSizeTables(id: number): Promise<PfSizeTable[]> {
  const r = await call<{ size_tables?: PfSizeTable[] }>(`/products/${id}/sizes?unit=inches`);
  return r.size_tables ?? [];
}

/** Printful's standard shipping for one of a variant to a typical US address (for margins and the delivery line). */
export async function standardShipping(variantId: number): Promise<{ cents: number; name: string } | null> {
  const rates = await call<{ id: string; rate: string; name: string }[]>("/shipping/rates", {
    method: "POST",
    body: JSON.stringify({ recipient: { country_code: "US", state_code: "KS", city: "Lawrence", zip: "66044", address1: "1 Main St" }, items: [{ variant_id: variantId, quantity: 1 }], currency: "USD" }),
  });
  const s = rates.find((r) => r.id === "STANDARD") ?? rates[0];
  return s ? { cents: Math.round(Number(s.rate) * 100), name: s.name } : null;
}

// ─── orders ─────────────────────────────────────────────────────────────────

export interface PfRecipient { name: string; address1: string; address2?: string | null; city: string; state_code: string; country_code: "US"; zip: string; phone?: string | null; email?: string | null }
/**
 * An order line: a store product (sync_variant_id), or for a made-when-ordered pick the catalog variant with
 * the pick's print file from the file library (and thread colors for embroidery).
 */
export type PfOrderItem = { quantity: number; retail_price: string; external_id?: string } & (
  | { sync_variant_id: number }
  | { variant_id: number; files: { type: string; id: number; position?: Record<string, number | boolean> }[]; options?: { id: string; value: unknown }[] }
);
export interface PfShipment { id: number; carrier: string; service: string; tracking_number: string; tracking_url: string; ship_date?: string; reshipment?: boolean }
export interface PfOrder {
  id: number; external_id: string | null; status: string; shipping: string;
  costs?: { subtotal: string; shipping: string; tax: string; total: string };
  shipments?: PfShipment[];
}

export interface PfOrderInput {
  external_id: string;
  recipient: PfRecipient;
  items: PfOrderItem[];
  retail_costs: { currency: "USD"; subtotal: string; discount: string; shipping: string; tax: string; total: string };
  packing_slip: { email: string; message?: string; store_name?: string; custom_order_id?: string };
}

/** A draft (nothing is charged until it's confirmed), or confirmed straight away. */
export async function createOrder(input: PfOrderInput, opts: { confirm?: boolean } = {}): Promise<PfOrder> {
  return call<PfOrder>(`/orders${opts.confirm ? "?confirm=true" : ""}`, { method: "POST", body: JSON.stringify({ ...input, shipping: "STANDARD" }) });
}

/** What an order would cost, without creating anything (dev checks use this). */
export async function estimateOrder(input: PfOrderInput): Promise<{ costs: { subtotal: number; shipping: number; tax: number; total: number } }> {
  return call(`/orders/estimate-costs`, { method: "POST", body: JSON.stringify({ ...input, shipping: "STANDARD" }) });
}

export const confirmOrder = (id: number) => call<PfOrder>(`/orders/${id}/confirm`, { method: "POST" });
export const getOrder = (id: number) => call<PfOrder>(`/orders/${id}`);
/** A draft is deleted; a pending order is canceled. Printful refuses once production starts. */
export const cancelOrder = (id: number) => call<PfOrder>(`/orders/${id}`, { method: "DELETE" });

// ─── webhooks ───────────────────────────────────────────────────────────────

export const WEBHOOK_TYPES = ["package_shipped", "package_returned", "order_failed", "order_canceled", "order_put_hold", "order_remove_hold", "order_refunded", "product_synced", "product_updated", "product_deleted"] as const;

export function printfulWebhookToken(): string {
  const base = process.env.PRINTFUL_WEBHOOK_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  return createHash("sha256").update(`printful-webhook:${base}`).digest("hex").slice(0, 40);
}

export function webhookTokenOk(token: string | null): boolean {
  if (!token) return false;
  const want = Buffer.from(printfulWebhookToken());
  const got = Buffer.from(token);
  return got.length === want.length && timingSafeEqual(got, want);
}

export const getWebhooks = () => call<{ url: string | null; types: string[] }>("/webhooks");
export const setWebhooks = (url: string) => call<{ url: string; types: string[] }>("/webhooks", { method: "POST", body: JSON.stringify({ url, types: WEBHOOK_TYPES }) });
