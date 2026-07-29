import "server-only";

import { createHash } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/admin";
import { computeStaleAfter } from "./config";
import {
  fetchCardById,
  searchCardsByName,
  type NormalizedCard,
} from "./client";
import type { TcgCard, TcgExpansion } from "./types";

/**
 * Lazy, demand-driven ingest (spec Phase 3). THE RULE: no card enters
 * `tcg_cards` except in response to a real user action. No bulk / speculative
 * pre-fetch, ever — that's a Scrydex ToS §4 boundary, not a perf choice.
 * Demand-driven re-fetch of an already-cached card past `stale_after`
 * (triggered by a real read) is allowed and expected.
 */

type Svc = ReturnType<typeof createServiceClient>;

// ── Persistence helpers ─────────────────────────────────────────────────────

async function upsertExpansion(svc: Svc, exp: TcgExpansion): Promise<void> {
  await svc.from("tcg_expansions").upsert(
    {
      id: exp.id,
      name: exp.name,
      series: exp.series,
      total: exp.total,
      printed_total: exp.printed_total,
      language_code: exp.language_code,
      release_date: exp.release_date,
      is_online_only: exp.is_online_only,
      fetched_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
}

async function upsertCard(svc: Svc, n: NormalizedCard): Promise<void> {
  // Parent expansion first (FK), from the SAME response — no second call.
  if (n.expansion) await upsertExpansion(svc, n.expansion);
  const c = n.card;
  await svc.from("tcg_cards").upsert(
    {
      id: c.id,
      name: c.name,
      supertype: c.supertype,
      subtypes: c.subtypes,
      types: c.types,
      hp: c.hp,
      abilities: c.abilities,
      attacks: c.attacks,
      weaknesses: c.weaknesses,
      resistances: c.resistances,
      retreat_cost: c.retreat_cost,
      converted_retreat_cost: c.converted_retreat_cost,
      number: c.number,
      printed_number: c.printed_number,
      rarity: c.rarity,
      regulation_mark: c.regulation_mark,
      expansion_id: c.expansion_id,
      expansion_sort_order: c.expansion_sort_order,
      language_code: c.language_code,
      images: c.images,
      variants: c.variants,
      source: "scrydex",
      fetched_at: new Date().toISOString(),
      stale_after: computeStaleAfter(),
    },
    { onConflict: "id" },
  );
}

async function readFreshCard(svc: Svc, id: string): Promise<TcgCard | null> {
  const { data } = await svc
    .from("tcg_cards")
    .select("*")
    .eq("id", id)
    .gt("stale_after", new Date().toISOString())
    .maybeSingle();
  return (data as TcgCard | null) ?? null;
}

// ── Concurrency lock (see gs_tcg_ingest_locks) ──────────────────────────────

/** Try to claim the ingest lock. Returns true if WE won and should fetch. */
async function tryAcquireLock(svc: Svc, cardId: string): Promise<boolean> {
  const { data } = await svc
    .from("gs_tcg_ingest_locks")
    .upsert({ card_id: cardId }, { onConflict: "card_id", ignoreDuplicates: true })
    .select("card_id");
  return Array.isArray(data) && data.length > 0;
}

async function releaseLock(svc: Svc, cardId: string): Promise<void> {
  await svc.from("gs_tcg_ingest_locks").delete().eq("card_id", cardId);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Poll for the card to become fresh (the lock winner is fetching it). */
async function waitForFresh(
  svc: Svc,
  id: string,
  timeoutMs = 4000,
  intervalMs = 200,
): Promise<TcgCard | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await sleep(intervalMs);
    const fresh = await readFreshCard(svc, id);
    if (fresh) return fresh;
  }
  return null;
}

// ── resolveCard ─────────────────────────────────────────────────────────────

/**
 * Resolve a single card by id.
 *   1. Fresh cache hit → return. 0 credits.
 *   2. Miss / stale → 1 credit fetch, upsert (+ parent expansion), return.
 * Concurrency: simultaneous cold adds of the same card spend ONE credit —
 * the lock winner fetches, losers wait and read.
 */
export async function resolveCard(cardId: string): Promise<TcgCard | null> {
  const svc = createServiceClient();

  const fresh = await readFreshCard(svc, cardId);
  if (fresh) return fresh; // 0 credits

  const won = await tryAcquireLock(svc, cardId);
  if (!won) {
    // Another request is already fetching — wait for it (0 credits).
    const waited = await waitForFresh(svc, cardId);
    if (waited) return waited;
    // Winner stalled/crashed. Steal the lock and fetch ourselves.
    await releaseLock(svc, cardId);
    await tryAcquireLock(svc, cardId);
  }

  try {
    // Double-check after acquiring the lock (winner may have just finished).
    const recheck = await readFreshCard(svc, cardId);
    if (recheck) return recheck;

    const normalized = await fetchCardById(cardId, "resolveCard cache miss/stale"); // 1 credit
    if (!normalized) return null;
    await upsertCard(svc, normalized);
    return normalized.card;
  } finally {
    await releaseLock(svc, cardId);
  }
}

/**
 * Force a fresh fetch + upsert regardless of cache state. Operator-only
 * primitive for the curated featured-card populate script (a real, authorized
 * request — NOT bulk/speculative). Always spends 1 credit. Do NOT call from
 * request-serving paths — that's what `resolveCard` (cache-first) is for.
 */
export async function forceResolveCard(cardId: string): Promise<TcgCard | null> {
  const svc = createServiceClient();
  const normalized = await fetchCardById(cardId, "operator populate (force)");
  if (!normalized) return null;
  await upsertCard(svc, normalized);
  return normalized.card;
}

// ── searchCards ─────────────────────────────────────────────────────────────

/** Normalize a query string before hashing/searching. */
function normalizeQuery(q: string): string {
  return q.toLowerCase().replace(/\s+/g, " ").trim();
}

function hashQuery(normalized: string): string {
  return createHash("sha256").update(normalized).digest("hex");
}

async function hydrateCards(svc: Svc, ids: string[]): Promise<TcgCard[]> {
  if (ids.length === 0) return [];
  const { data } = await svc.from("tcg_cards").select("*").in("id", ids);
  const byId = new Map((data ?? []).map((r) => [(r as TcgCard).id, r as TcgCard]));
  // Preserve the cached rank order.
  return ids.map((id) => byId.get(id)).filter((c): c is TcgCard => Boolean(c));
}

const LOCAL_ENOUGH = 10; // local trigram hits that let us skip the API

/**
 * Search cards by name.
 *   1. Search-cache hit (unexpired) → hydrate from tcg_cards. 0 credits.
 *   2. Local trigram ≥ 10 results → serve local. 0 credits. (Primary cost
 *      control; improves as the catalog warms.)
 *   3. Otherwise 1-credit API search → upsert results → write cache row.
 */
export async function searchCards(rawQuery: string): Promise<TcgCard[]> {
  const svc = createServiceClient();
  const q = normalizeQuery(rawQuery);
  if (q.length < 3) return []; // mirrors the client-side floor

  // 1. Search cache.
  const hash = hashQuery(q);
  const { data: cacheRow } = await svc
    .from("gs_tcg_search_cache")
    .select("card_ids, expires_at")
    .eq("query_hash", hash)
    .maybeSingle();
  if (cacheRow && new Date(cacheRow.expires_at as string) > new Date()) {
    return hydrateCards(svc, (cacheRow.card_ids as string[]) ?? []); // 0 credits
  }

  // 2. Local trigram.
  const { data: localRows } = await svc
    .from("tcg_cards")
    .select("*")
    .ilike("name", `%${q}%`)
    .limit(25);
  const local = (localRows ?? []) as TcgCard[];
  if (local.length >= LOCAL_ENOUGH) {
    return local; // 0 credits — don't even write a cache row for local hits
  }

  // 3. API search. 1 credit.
  const results = await searchCardsByName(q, "search cache+local miss");
  for (const n of results) await upsertCard(svc, n);
  const ids = results.map((n) => n.card.id);

  // Write / refresh the search-cache row.
  await svc.from("gs_tcg_search_cache").upsert(
    {
      query_hash: hash,
      query_text: q,
      card_ids: ids,
      fetched_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    },
    { onConflict: "query_hash" },
  );

  return results.map((n) => n.card);
}
