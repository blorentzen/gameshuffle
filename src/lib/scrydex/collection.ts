import "server-only";

import type { createClient } from "@/lib/supabase/server";
import { resolveCard } from "./ingest";
import { MAX_SHOWCASE, type UserCard } from "./types";

/**
 * User collection operations. All reads/writes go through the AUTHED client
 * so RLS (`user_id = auth.uid()`) is the enforcement — the route's Pro gate is
 * the capability check on top. `resolveCard` (service-role) is called only to
 * guarantee the `tcg_cards` FK row exists before we attach it.
 */

type Supabase = Awaited<ReturnType<typeof createClient>>;

export async function listCollection(
  supabase: Supabase,
  userId: string,
): Promise<UserCard[]> {
  const { data, error } = await supabase
    .from("gs_user_cards")
    .select(
      "id, card_id, variant_name, quantity, condition, added_at, showcased_at, card:tcg_cards(*)",
    )
    .eq("user_id", userId)
    .order("added_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as UserCard[];
}

export interface AddCardInput {
  cardId: string;
  variantName?: string | null;
  quantity?: number;
  condition?: string | null;
}

/**
 * Add a card to the collection. Triggers demand-driven `resolveCard` (the
 * real-user-action that legitimizes an ingest), then increments quantity on a
 * duplicate rather than inserting a second row.
 */
export async function addToCollection(
  supabase: Supabase,
  userId: string,
  input: AddCardInput,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const qty = Math.max(1, Math.floor(input.quantity ?? 1));
  const variant = input.variantName ?? null;

  // Ensure the catalog row exists (FK) — this is the demand-driven ingest.
  const card = await resolveCard(input.cardId);
  if (!card) return { ok: false, reason: "card_not_found" };

  // Increment-on-duplicate (unique on user_id, card_id, coalesce(variant,'')).
  // Match a null variant with `.is`, a named variant with `.eq`.
  const dupeQuery = supabase
    .from("gs_user_cards")
    .select("id, quantity")
    .eq("user_id", userId)
    .eq("card_id", input.cardId);
  const { data: row } = await (variant === null
    ? dupeQuery.is("variant_name", null)
    : dupeQuery.eq("variant_name", variant)
  ).maybeSingle();

  if (row) {
    const { error } = await supabase
      .from("gs_user_cards")
      .update({ quantity: (row.quantity as number) + qty })
      .eq("id", row.id as string)
      .eq("user_id", userId);
    if (error) return { ok: false, reason: error.message };
    return { ok: true };
  }

  const { error } = await supabase.from("gs_user_cards").insert({
    user_id: userId,
    card_id: input.cardId,
    variant_name: variant,
    quantity: qty,
    condition: input.condition ?? null,
  });
  if (error) return { ok: false, reason: error.message };
  return { ok: true };
}

export async function updateCollectionRow(
  supabase: Supabase,
  userId: string,
  rowId: string,
  patch: { quantity?: number; condition?: string | null },
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const update: Record<string, unknown> = {};
  if (patch.quantity !== undefined) {
    const q = Math.floor(patch.quantity);
    if (q < 1) {
      // Quantity to zero == removal.
      return removeCollectionRow(supabase, userId, rowId);
    }
    update.quantity = q;
  }
  if (patch.condition !== undefined) update.condition = patch.condition;
  if (Object.keys(update).length === 0) return { ok: true };

  const { error } = await supabase
    .from("gs_user_cards")
    .update(update)
    .eq("id", rowId)
    .eq("user_id", userId);
  if (error) return { ok: false, reason: error.message };
  return { ok: true };
}

/**
 * Feature / unfeature a card on the owner's public profile. Turning a card on
 * sets `showcased_at` (which doubles as the display order); the cap of
 * MAX_SHOWCASE featured cards is enforced here (re-starring an already-featured
 * card is idempotent and never trips the limit).
 */
export async function setShowcase(
  supabase: Supabase,
  userId: string,
  rowId: string,
  on: boolean,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!on) {
    const { error } = await supabase
      .from("gs_user_cards")
      .update({ showcased_at: null })
      .eq("id", rowId)
      .eq("user_id", userId);
    if (error) return { ok: false, reason: error.message };
    return { ok: true };
  }

  // Already featured → no-op (don't let a re-star trip the cap).
  const { data: existing } = await supabase
    .from("gs_user_cards")
    .select("showcased_at")
    .eq("id", rowId)
    .eq("user_id", userId)
    .maybeSingle();
  if (existing?.showcased_at) return { ok: true };

  const { count } = await supabase
    .from("gs_user_cards")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .not("showcased_at", "is", null);
  if ((count ?? 0) >= MAX_SHOWCASE) {
    return { ok: false, reason: "showcase_full" };
  }

  const { error } = await supabase
    .from("gs_user_cards")
    .update({ showcased_at: new Date().toISOString() })
    .eq("id", rowId)
    .eq("user_id", userId);
  if (error) return { ok: false, reason: error.message };
  return { ok: true };
}

export async function removeCollectionRow(
  supabase: Supabase,
  userId: string,
  rowId: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const { error } = await supabase
    .from("gs_user_cards")
    .delete()
    .eq("id", rowId)
    .eq("user_id", userId);
  if (error) return { ok: false, reason: error.message };
  return { ok: true };
}
