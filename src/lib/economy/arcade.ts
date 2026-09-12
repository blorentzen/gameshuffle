import "server-only";

/**
 * Arcade — the token sink. Users burn Arcade Tokens on cosmetic items
 * (`gs_shop_purchase` RPC → `shop_purchase` burn + `gs_inventory` row).
 * Purchases draw from the account's canonical wallet; ownership is
 * account-scoped. See `supabase/economy-arcade-m1.sql`.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { ensureAccountWallet } from "@/lib/economy/accountWallet";
import { ARCADE_ITEM_BY_ID } from "@/data/arcade-items";

/** Item ids the account owns. Resilient — [] if the migration isn't applied. */
export async function getInventory(accountId: string): Promise<string[]> {
  if (!accountId) return [];
  const admin = createServiceClient();
  const { data, error } = await admin
    .from("gs_inventory")
    .select("item_id")
    .eq("account_id", accountId);
  if (error || !data) return [];
  return (data as { item_id: string }[]).map((r) => r.item_id);
}

export interface PurchaseResult {
  ok: boolean;
  balance?: number;
  reason?: "unknown_item" | "already_owned" | "insufficient_balance" | "wallet_unavailable" | string;
}

/** Buy an item: burn its price from the account wallet + record ownership. */
export async function purchaseItem(accountId: string, itemId: string): Promise<PurchaseResult> {
  const item = ARCADE_ITEM_BY_ID[itemId];
  if (!item) return { ok: false, reason: "unknown_item" };

  const wallet = await ensureAccountWallet(accountId).catch(() => null);
  if (!wallet) return { ok: false, reason: "wallet_unavailable" };

  const admin = createServiceClient();
  const { data, error } = await admin.rpc("gs_shop_purchase", {
    p_identity_id: wallet.identityId,
    p_account_id: accountId,
    p_item_id: itemId,
    p_price: item.price,
  });
  if (error) return { ok: false, reason: error.message };
  const r = data as { ok: boolean; reason?: string; balance?: number };
  // Auto-equip a freshly-bought name color so the purchase is immediately visible.
  if (r.ok && item.kind === "name_color") {
    await equipNameColor(accountId, itemId).catch(() => {});
  }
  return { ok: r.ok, balance: r.balance, reason: r.reason };
}

/** The account's equipped name-color item id (or null). */
export async function getEquippedNameColor(accountId: string): Promise<string | null> {
  if (!accountId) return null;
  const admin = createServiceClient();
  const { data, error } = await admin
    .from("users")
    .select("equipped_name_color")
    .eq("id", accountId)
    .maybeSingle();
  if (error || !data) return null;
  return (data as { equipped_name_color: string | null }).equipped_name_color ?? null;
}

/**
 * Equip an owned name color (or pass null to clear). Validates the item is a
 * name color the account actually owns.
 */
export async function equipNameColor(
  accountId: string,
  itemId: string | null,
): Promise<{ ok: boolean; reason?: string }> {
  if (!accountId) return { ok: false, reason: "invalid_args" };
  const admin = createServiceClient();
  if (itemId !== null) {
    const item = ARCADE_ITEM_BY_ID[itemId];
    if (!item || item.kind !== "name_color") return { ok: false, reason: "unknown_item" };
    const owned = await getInventory(accountId);
    if (!owned.includes(itemId)) return { ok: false, reason: "not_owned" };
  }
  const { error } = await admin.from("users").update({ equipped_name_color: itemId }).eq("id", accountId);
  if (error) return { ok: false, reason: error.message };
  return { ok: true };
}
