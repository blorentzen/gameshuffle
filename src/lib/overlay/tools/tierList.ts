/**
 * Tier List tool (Streamer Tools Integration, Phase 3). A single shared tier
 * list per streamer (owner-keyed) — items from the streamer's pool are placed
 * into S/A/B/C/D tiers (or left in the unranked tray) from the Hub. Each change
 * records a *persistent* overlay event carrying the full state, so a mid-session
 * OBS reload restores it and the newest event replaces the prior one.
 *
 * Item pool + look are streamer-owned (§3.4) — read from the `tierlist` module
 * default; an unconfigured streamer gets an empty pool (the Hub prompts them to
 * add items in Stream Tools).
 */

import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { recordOverlayEvent } from "@/lib/overlay/events";
import { getStreamerModuleDefault, setStreamerModuleDefault } from "@/lib/modules/streamerDefaults";
import { DEFAULT_TIERS } from "@/lib/modules/registry";
import { TIER_ITEM_MAX } from "@/lib/modules/types";
import { trackServerEvent } from "@/lib/analytics/server";
import type { ToolSource } from "./dice";

/** Upper bound on the pool so the hub add-item control can't grow it unbounded. */
const TIER_MAX_ITEMS = 30;

export interface TierRow {
  key: string;
  label: string;
  color: string;
}
export interface TierItem {
  id: number;
  text: string;
  tier: string | null; // tier key, or null = unranked
}
export interface TierList {
  title: string | null;
  tiers: TierRow[];
  items: TierItem[];
}

interface ListRow {
  title: string | null;
  tiers: TierRow[] | null;
  items: TierItem[] | null;
}

/** The streamer's tier-list customization (pool + look + title), with fallbacks. */
export async function getTierListConfig(ownerUserId: string) {
  const cfg = await getStreamerModuleDefault({
    ownerUserId,
    moduleId: "tierlist",
    gameSlug: "*",
  });
  return {
    items: cfg?.items ?? [],
    accentColor: cfg?.accentColor ?? "#2f6fd6",
    title: cfg?.title ?? "Tier List",
  };
}

function toList(row: ListRow): TierList {
  return {
    title: row.title,
    tiers: row.tiers?.length ? row.tiers : DEFAULT_TIERS,
    items: row.items ?? [],
  };
}

async function recordListEvent(
  ownerUserId: string,
  sessionId: string | null | undefined,
  list: TierList,
  accentColor: string,
): Promise<void> {
  await recordOverlayEvent({
    ownerUserId,
    sessionId: sessionId ?? null,
    type: "tierlist",
    payload: {
      title: list.title,
      tiers: list.tiers,
      items: list.items,
      accentColor,
      cleared: false,
    },
    ttlMs: null, // persistent — replaced by the next tier-list event
  });
}

/** Start a fresh list: seed items from the pool as unranked. */
export async function newTierList(args: {
  ownerUserId: string;
  sessionId?: string | null;
  source?: ToolSource;
}): Promise<TierList> {
  const cfg = await getTierListConfig(args.ownerUserId);
  const items: TierItem[] = cfg.items.map((text, id) => ({ id, text, tier: null }));

  const admin = createServiceClient();
  await admin.from("gs_tier_lists").upsert(
    {
      owner_user_id: args.ownerUserId,
      session_id: args.sessionId ?? null,
      title: cfg.title,
      tiers: DEFAULT_TIERS,
      items,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "owner_user_id" },
  );

  void trackServerEvent("Streamer Tool", {
    props: { tool: "tierlist", surface: args.source ?? "unknown", action: "new", items: items.length },
  });

  const list = toList({ title: cfg.title, tiers: DEFAULT_TIERS, items });
  await recordListEvent(args.ownerUserId, args.sessionId, list, cfg.accentColor);
  return list;
}

/** Read the streamer's current list (null if none). */
export async function getActiveTierList(ownerUserId: string): Promise<TierList | null> {
  const admin = createServiceClient();
  const { data } = await admin
    .from("gs_tier_lists")
    .select("title, tiers, items")
    .eq("owner_user_id", ownerUserId)
    .maybeSingle();
  if (!data) return null;
  return toList(data as ListRow);
}

export interface PlaceResult {
  list: TierList | null;
  error?: "no_list" | "bad_item" | "bad_tier";
}

/** Assign an item to a tier (or null to send it back to the unranked tray). */
export async function placeTierItem(args: {
  ownerUserId: string;
  sessionId?: string | null;
  itemId: number;
  tier: string | null;
  source?: ToolSource;
}): Promise<PlaceResult> {
  const cfg = await getTierListConfig(args.ownerUserId);
  const existing = await getActiveTierList(args.ownerUserId);
  if (!existing) return { list: null, error: "no_list" };

  const item = existing.items.find((it) => it.id === args.itemId);
  if (!item) return { list: existing, error: "bad_item" };

  if (args.tier !== null && !existing.tiers.some((t) => t.key === args.tier)) {
    return { list: existing, error: "bad_tier" };
  }

  const items = existing.items.map((it) =>
    it.id === args.itemId ? { ...it, tier: args.tier } : it,
  );

  const admin = createServiceClient();
  await admin
    .from("gs_tier_lists")
    .update({ items, updated_at: new Date().toISOString() })
    .eq("owner_user_id", args.ownerUserId);

  void trackServerEvent("Streamer Tool", {
    props: { tool: "tierlist", surface: args.source ?? "unknown", action: "place" },
  });

  const list: TierList = { ...existing, items };
  await recordListEvent(args.ownerUserId, args.sessionId, list, cfg.accentColor);
  return { list };
}

/** Persist the item pool to the streamer's tierlist config so hub edits stick
 *  (a "New list" and future sessions reflect them). */
async function saveTierPool(ownerUserId: string, items: string[]): Promise<void> {
  const raw = await getStreamerModuleDefault({ ownerUserId, moduleId: "tierlist", gameSlug: "*" });
  await setStreamerModuleDefault({
    ownerUserId,
    moduleId: "tierlist",
    gameSlug: "*",
    config: { items, accentColor: raw?.accentColor, title: raw?.title },
  });
}

/** Add a new item to the pool + the active list (unranked). Creates the list if
 *  none exists yet, so the streamer never has to leave the Hub to build one. */
export async function addTierItem(args: {
  ownerUserId: string;
  sessionId?: string | null;
  text: string;
  source?: ToolSource;
}): Promise<PlaceResult> {
  const text = args.text.trim().slice(0, TIER_ITEM_MAX);
  let existing = await getActiveTierList(args.ownerUserId);
  if (!text) return { list: existing, error: "bad_item" };

  // Seed a list from the pool if there isn't one yet.
  if (!existing) {
    existing = await newTierList({
      ownerUserId: args.ownerUserId,
      sessionId: args.sessionId,
      source: args.source,
    });
  }
  if (existing.items.length >= TIER_MAX_ITEMS) return { list: existing };

  const cfg = await getTierListConfig(args.ownerUserId);
  const nextId = existing.items.reduce((m, it) => Math.max(m, it.id), -1) + 1;
  const items = [...existing.items, { id: nextId, text, tier: null }];

  const admin = createServiceClient();
  await admin
    .from("gs_tier_lists")
    .update({ items, updated_at: new Date().toISOString() })
    .eq("owner_user_id", args.ownerUserId);

  if (!cfg.items.includes(text)) {
    await saveTierPool(args.ownerUserId, [...cfg.items, text].slice(0, TIER_MAX_ITEMS));
  }

  void trackServerEvent("Streamer Tool", {
    props: { tool: "tierlist", surface: args.source ?? "unknown", action: "add_item" },
  });

  const list: TierList = { ...existing, items };
  await recordListEvent(args.ownerUserId, args.sessionId, list, cfg.accentColor);
  return { list };
}

/** Remove an item from the active list + the pool. */
export async function removeTierItem(args: {
  ownerUserId: string;
  sessionId?: string | null;
  itemId: number;
  source?: ToolSource;
}): Promise<PlaceResult> {
  const existing = await getActiveTierList(args.ownerUserId);
  if (!existing) return { list: null, error: "no_list" };
  const item = existing.items.find((it) => it.id === args.itemId);
  if (!item) return { list: existing, error: "bad_item" };

  const items = existing.items.filter((it) => it.id !== args.itemId);
  const cfg = await getTierListConfig(args.ownerUserId);

  const admin = createServiceClient();
  await admin
    .from("gs_tier_lists")
    .update({ items, updated_at: new Date().toISOString() })
    .eq("owner_user_id", args.ownerUserId);

  // Drop one matching entry from the pool.
  const idx = cfg.items.indexOf(item.text);
  if (idx >= 0) {
    await saveTierPool(args.ownerUserId, [
      ...cfg.items.slice(0, idx),
      ...cfg.items.slice(idx + 1),
    ]);
  }

  void trackServerEvent("Streamer Tool", {
    props: { tool: "tierlist", surface: args.source ?? "unknown", action: "remove_item" },
  });

  const list: TierList = { ...existing, items };
  await recordListEvent(args.ownerUserId, args.sessionId, list, cfg.accentColor);
  return { list };
}

/** Clear the list off the overlay + delete the row. */
export async function clearTierList(args: {
  ownerUserId: string;
  sessionId?: string | null;
  source?: ToolSource;
}): Promise<void> {
  const admin = createServiceClient();
  await admin.from("gs_tier_lists").delete().eq("owner_user_id", args.ownerUserId);

  void trackServerEvent("Streamer Tool", {
    props: { tool: "tierlist", surface: args.source ?? "unknown", action: "clear" },
  });

  await recordOverlayEvent({
    ownerUserId: args.ownerUserId,
    sessionId: args.sessionId ?? null,
    type: "tierlist",
    payload: { cleared: true },
    ttlMs: null,
  });
}
