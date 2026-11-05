import "server-only";

/**
 * Made-when-ordered picks on an order (merch-m2.sql `shop_order_picks`): one row per product and pick, with the
 * label the cart showed. Written once when the order is filled; read by the order page, emails, Platform and the
 * Printful order.
 */

import { createServiceClient } from "@/lib/supabase/admin";

export interface OrderPick { sku: string; pick: string; label: string; quantity: number }

/** Made-when-ordered picks for an order (merch-m2.sql), once; a second delivery of the event changes nothing. */
export async function recordPicks(orderId: string, picks: OrderPick[]): Promise<void> {
  const merged = new Map<string, OrderPick>();
  for (const p of picks) { const k = `${p.sku}|${p.pick}`; const had = merged.get(k); merged.set(k, had ? { ...had, quantity: had.quantity + p.quantity } : { ...p }); }
  const { error } = await createServiceClient().from("shop_order_picks")
    .upsert([...merged.values()].map((p) => ({ order_id: orderId, ...p })), { onConflict: "order_id,sku,pick", ignoreDuplicates: true });
  if (error) console.error("[shop] picks not saved (merch-m2.sql?):", error.message);
}

/** An order's picks, for its page, emails, Platform and the Printful order. Empty before merch-m2.sql. */
export async function picksFor(orderId: string): Promise<OrderPick[]> {
  const { data, error } = await createServiceClient().from("shop_order_picks").select("sku, pick, label, quantity").eq("order_id", orderId).order("created_at");
  if (error) return [];
  return (data ?? []) as OrderPick[];
}

/** A product's name with what was picked: "Player Tee · Player 2 · 4 hearts", or each pick with its count. */
export function nameWithPicks(name: string, sku: string, picks: OrderPick[]): string {
  const mine = picks.filter((p) => p.sku === sku);
  if (!mine.length) return name;
  if (mine.length === 1) return `${name} · ${mine[0].label}`;
  return `${name} · ${mine.map((p) => `${p.label} (×${p.quantity})`).join(", ")}`;
}
