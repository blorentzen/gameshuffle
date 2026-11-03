import "server-only";

import { createServiceClient } from "@/lib/supabase/admin";
import { resolveCard } from "@/lib/scrydex/ingest";
import type { TcgCard } from "@/lib/scrydex/types";

/**
 * Admin-managed featured shop cards (the storefront's high-value promo set).
 * Platform-global; managed by staff/admin via the admin API, displayed on
 * public promo surfaces. Reads use the service client (public pages are
 * anon-hittable and the table is service-role only). Adding a card resolves
 * its Scrydex catalog row (demand-driven ingest) so showcase data exists.
 */

/** We only ever post English or Japanese cards (Britton, 2026-11-01). */
export type CardLanguage = "en" | "ja";
export const CARD_LANGUAGES: Record<CardLanguage, string> = { en: "English", ja: "Japanese" };
export const cardLanguage = (v: unknown): CardLanguage => (v === "ja" ? "ja" : "en");

export interface FeaturedShopCard {
  id: string;
  card_id: string;
  variant_name: string | null;
  /** English by default (shop-cards-language-m1.sql; reads as English before it runs). */
  language: CardLanguage;
  label: string | null;
  product_url: string;
  is_sold: boolean;
  sold_at: string | null;
  /** Staff-curated showcase flag — featured cards lead their surface. */
  is_featured: boolean;
  sort_order: number;
  card: TcgCard | null;
}

type Svc = ReturnType<typeof createServiceClient>;

function mapRow(row: Record<string, unknown>): FeaturedShopCard {
  return {
    id: row.id as string,
    card_id: row.card_id as string,
    variant_name: (row.variant_name as string | null) ?? null,
    language: cardLanguage(row.language),
    label: (row.label as string | null) ?? null,
    product_url: row.product_url as string,
    is_sold: row.is_sold === true,
    sold_at: (row.sold_at as string | null) ?? null,
    is_featured: row.is_featured === true,
    sort_order: (row.sort_order as number) ?? 0,
    card: (row.card as TcgCard | null) ?? null,
  };
}

const COLS = "id, card_id, variant_name, label, product_url, is_sold, sold_at, is_featured, sort_order, card:tcg_cards(*)";

async function selectAll(svc: Svc): Promise<FeaturedShopCard[]> {
  const read = (cols: string) => svc
    .from("gs_featured_shop_cards")
    .select(cols)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  let { data, error } = await read(`${COLS}, language`);
  // Before shop-cards-language-m1.sql the column isn't there: read without it (every card reads as English).
  if (error?.code === "42703") ({ data, error } = await read(COLS));
  if (error) {
    // Degrade gracefully — a missing table (migration not yet applied) or any
    // read error must not 500 the public promo page; callers fall back to FPO.
    console.error("[featuredCards] read failed:", error.message);
    return [];
  }
  return ((data ?? []) as unknown[]).map((r) => mapRow(r as Record<string, unknown>));
}

/**
 * The public pages (homepage, /pokemon-tcg) read every card with its full catalog row on each visit,
 * so they share one copy per server instance for a minute; staff edits below clear it.
 */
const PUBLIC_MS = 60_000;
let publicCopy: { at: number; rows: Promise<FeaturedShopCard[]> } | null = null;
function publicCards(): Promise<FeaturedShopCard[]> {
  if (publicCopy && Date.now() - publicCopy.at < PUBLIC_MS) return publicCopy.rows;
  const rows = selectAll(createServiceClient());
  publicCopy = { at: Date.now(), rows };
  // A failed read (it returns []) isn't kept, so the next visit tries again.
  void rows.then((r) => { if (!r.length && publicCopy?.rows === rows) publicCopy = null; });
  return rows;
}
const forgetPublic = () => { publicCopy = null; };

/** All featured cards (admin view — includes sold). */
export async function listFeaturedShopCards(): Promise<FeaturedShopCard[]> {
  return selectAll(createServiceClient());
}

export interface AddFeaturedInput {
  cardId: string;
  variantName?: string | null;
  language?: CardLanguage;
  label?: string | null;
  productUrl: string;
  /** Add directly as sold (for backfilling notable past sales). */
  isSold?: boolean;
  /** ISO date/timestamp of the sale; defaults to now() when isSold + absent. */
  soldAt?: string | null;
}

export async function addFeaturedShopCard(
  input: AddFeaturedInput,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const svc = createServiceClient();
  // Ensure the catalog row exists (FK) — demand-driven ingest.
  const card = await resolveCard(input.cardId);
  if (!card) return { ok: false, reason: "card_not_found" };

  // Append to the end of the current order.
  const { data: last } = await svc
    .from("gs_featured_shop_cards")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = ((last?.sort_order as number | undefined) ?? -1) + 1;

  const isSold = input.isSold === true;
  const row = {
    card_id: input.cardId,
    variant_name: input.variantName ?? null,
    label: input.label ?? null,
    product_url: input.productUrl,
    sort_order: nextOrder,
    is_sold: isSold,
    sold_at: isSold ? (input.soldAt ?? new Date().toISOString()) : null,
  };
  let { error } = await svc.from("gs_featured_shop_cards").insert({ ...row, language: cardLanguage(input.language) });
  if (error?.code === "42703") ({ error } = await svc.from("gs_featured_shop_cards").insert(row));
  if (error) return { ok: false, reason: error.message };
  forgetPublic();
  return { ok: true };
}

export async function updateFeaturedShopCard(
  id: string,
  patch: {
    isSold?: boolean;
    soldAt?: string | null;
    label?: string | null;
    productUrl?: string;
    sortOrder?: number;
    isFeatured?: boolean;
    language?: CardLanguage;
    variantName?: string | null;
  },
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.isFeatured !== undefined) update.is_featured = patch.isFeatured;
  if (patch.isSold !== undefined) {
    update.is_sold = patch.isSold;
    // Marking sold defaults the date to now; marking available clears it.
    // (An explicit soldAt below overrides the default.)
    update.sold_at = patch.isSold ? new Date().toISOString() : null;
  }
  if (patch.soldAt !== undefined) update.sold_at = patch.soldAt;
  if (patch.label !== undefined) update.label = patch.label;
  if (patch.productUrl !== undefined) update.product_url = patch.productUrl;
  if (patch.sortOrder !== undefined) update.sort_order = patch.sortOrder;
  if (patch.language !== undefined) update.language = cardLanguage(patch.language);
  if (patch.variantName !== undefined) update.variant_name = patch.variantName;

  const { error } = await createServiceClient()
    .from("gs_featured_shop_cards")
    .update(update)
    .eq("id", id);
  if (error) return { ok: false, reason: error.message };
  forgetPublic();
  return { ok: true };
}

/**
 * Persist a new order for the featured (available) cards. Reassigns
 * `sort_order = index` across the given id list (drag-and-drop reorder). Sold
 * cards are surfaced by sale date, not sort_order, so they're unaffected.
 */
export async function reorderFeaturedShopCards(
  ids: string[],
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const svc = createServiceClient();
  const now = new Date().toISOString();
  const results = await Promise.all(
    ids.map((id, index) =>
      svc
        .from("gs_featured_shop_cards")
        .update({ sort_order: index, updated_at: now })
        .eq("id", id),
    ),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) return { ok: false, reason: failed.error.message };
  forgetPublic();
  return { ok: true };
}

export async function removeFeaturedShopCard(
  id: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const { error } = await createServiceClient()
    .from("gs_featured_shop_cards")
    .delete()
    .eq("id", id);
  if (error) return { ok: false, reason: error.message };
  forgetPublic();
  return { ok: true };
}

/** Public "Featured cards in the shop" — AVAILABLE cards only (sold cards move
 *  to the Recently Sold surface). Read-only, 0 credits. */
export async function getPublicFeaturedShopCards(): Promise<FeaturedShopCard[]> {
  const all = await publicCards();
  // Featured cards lead the carousel; the rest keep their sort_order after them.
  return all
    .filter((c) => !c.is_sold)
    .sort((a, b) => Number(b.is_featured) - Number(a.is_featured));
}

/** Public "Recently Sold" — sold cards, most recent first (FOMO). */
export async function getRecentlySoldCards(
  limit = 12,
): Promise<FeaturedShopCard[]> {
  const all = await publicCards();
  return all
    .filter((c) => c.is_sold)
    .sort((a, b) => {
      // Featured big sales lead; otherwise most recent first.
      const feat = Number(b.is_featured) - Number(a.is_featured);
      if (feat) return feat;
      const ta = a.sold_at ? Date.parse(a.sold_at) : 0;
      const tb = b.sold_at ? Date.parse(b.sold_at) : 0;
      return tb - ta;
    })
    .slice(0, limit);
}
