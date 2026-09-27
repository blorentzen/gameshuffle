/**
 * Personalized randomizers: what someone owns or has unlocked, per game.
 * Client-safe. A collection lists what's switched OFF (so a new character or
 * track added later is on by default), plus a few per-game preferences.
 *
 * Stored per account in `user_game_profiles` (see useGameCollection), or in
 * the browser for signed-out visitors.
 */

import mk8dxData from "@/data/mk8dx-data.json";
import mkworldData from "@/data/mkworld-data.json";
import type { GameData } from "@/data/types";
import { readCollection as readCore, type GameCollection } from "@/lib/collection/core";

export type { GameCollection } from "@/lib/collection/core";
import { PARTY_GAMES } from "@/data/party";
import { ULTIMATE } from "@/data/smash/ultimate";

export interface CollectionItem { id: string; label: string; img?: string; defaultOff?: boolean }
export interface CollectionGroup { id: string; label: string; itemIds: string[] }
export interface CollectionSection { id: string; label: string; items: CollectionItem[]; groups: CollectionGroup[] }
export interface CollectionCatalog { slug: string; label: string; sections: CollectionSection[] }

/** Booster Course Pass: cups 12..23, two cups per wave. */
const MK8DX_BASE_CUPS = 12;

function trackItems(cups: { name?: string; img?: string; courses: { name: string; img: string; type?: string }[] }[]): CollectionItem[] {
  // Retro tracks share names ("Rainbow Road"), so show the console they came from.
  const retro = (t?: string) => (t && t !== "Standard" && t !== "Tour" ? ` (${t})` : "");
  return cups.flatMap((cup, ci) => cup.courses.map((c, ti) => ({ id: `c${ci}-t${ti}`, label: `${c.name}${retro(c.type)}`, img: c.img })));
}
function cupIds(cupIdx: number, count: number): string[] {
  return Array.from({ length: count }, (_, t) => `c${cupIdx}-t${t}`);
}
function byField<T extends { name: string }>(rows: T[], field: keyof T, order?: string[]): CollectionGroup[] {
  const vals = [...new Set(rows.map((r) => r[field]).filter(Boolean) as string[])];
  const sorted = order ? [...order.filter((o) => vals.includes(o)), ...vals.filter((v) => !order.includes(v))] : vals;
  return sorted.map((v) => ({ id: `${String(field)}-${v}`, label: v, itemIds: rows.filter((r) => r[field] === v).map((r) => r.name) }));
}
const named = (rows: { name: string; img: string }[]): CollectionItem[] => rows.map((r) => ({ id: r.name, label: r.name, img: r.img }));

function mk8dx(): CollectionCatalog {
  const d = mk8dxData as unknown as GameData & { cups: { name?: string; courses: { name: string; img: string; type?: string }[] }[] };
  const waves: CollectionGroup[] = Array.from({ length: 6 }, (_, w) => ({
    id: `bcp-${w + 1}`, label: `Booster Course Pass wave ${w + 1}`,
    itemIds: [...cupIds(MK8DX_BASE_CUPS + w * 2, 4), ...cupIds(MK8DX_BASE_CUPS + w * 2 + 1, 4)],
  }));
  return {
    slug: "mario-kart-8-deluxe", label: "Mario Kart 8 Deluxe",
    sections: [
      { id: "tracks", label: "Tracks", items: trackItems(d.cups), groups: [{ id: "base", label: "Base game", itemIds: Array.from({ length: MK8DX_BASE_CUPS }, (_, c) => cupIds(c, 4)).flat() }, ...waves] },
      { id: "characters", label: "Characters", items: named(d.characters), groups: byField(d.characters, "weight", ["Light", "Medium", "Heavy"]) },
      { id: "vehicles", label: "Karts and bikes", items: named(d.vehicles), groups: [] },
      { id: "wheels", label: "Wheels", items: named(d.wheels ?? []), groups: [] },
      { id: "gliders", label: "Gliders", items: named(d.gliders ?? []), groups: [] },
    ],
  };
}

function mkworld(): CollectionCatalog {
  const d = mkworldData as unknown as GameData & { cups: { name?: string; courses: { name: string; img: string }[] }[] };
  return {
    slug: "mario-kart-world", label: "Mario Kart World",
    sections: [
      { id: "tracks", label: "Tracks", items: trackItems(d.cups), groups: d.cups.map((c, i) => ({ id: `cup-${i}`, label: c.name ?? `Cup ${i + 1}`, itemIds: cupIds(i, c.courses.length) })) },
      { id: "characters", label: "Characters", items: named(d.characters), groups: byField(d.characters, "weight", ["Light", "Medium", "Heavy"]) },
      { id: "vehicles", label: "Vehicles", items: named(d.vehicles), groups: byField(d.vehicles, "type", ["Kart", "Bike", "ATV"]) },
    ],
  };
}

function party(slug: string): CollectionCatalog | null {
  const g = PARTY_GAMES[slug];
  if (!g) return null;
  const unlockBoards = g.boards.filter((b) => b.unlockable);
  const unlockChars = g.characters.filter((c) => c.unlockable);
  return {
    slug, label: g.label,
    sections: [
      { id: "boards", label: "Boards", items: g.boards.map((b) => ({ id: b.id, label: b.name, defaultOff: !!b.unlockable })), groups: unlockBoards.length ? [{ id: "unlockable", label: "Unlockable boards", itemIds: unlockBoards.map((b) => b.id) }] : [] },
      { id: "characters", label: "Characters", items: g.characters.map((c) => ({ id: c.name, label: c.name, defaultOff: !!c.unlockable })), groups: unlockChars.length ? [{ id: "unlockable", label: "Unlockable characters", itemIds: unlockChars.map((c) => c.name) }] : [] },
    ],
  };
}

function smash(): CollectionCatalog {
  const g = ULTIMATE;
  const packGroups = (rows: { pack?: string }[], ids: string[]) => g.packs.map((pk) => ({
    id: `pack-${pk.id}`, label: pk.label, itemIds: ids.filter((_, i) => rows[i].pack === pk.id),
  })).filter((grp) => grp.itemIds.length);
  const fIds = g.fighters.map((f) => f.name);
  const sIds = g.stages.map((s) => s.id);
  return {
    slug: g.slug, label: g.label,
    sections: [
      { id: "fighters", label: "Fighters", items: g.fighters.map((f) => ({ id: f.name, label: f.name, defaultOff: !!f.pack })),
        groups: [...packGroups(g.fighters, fIds), { id: "echoes", label: "Echo Fighters", itemIds: g.fighters.filter((f) => f.echoOf).map((f) => f.name) }, { id: "miis", label: "Mii Fighters", itemIds: g.fighters.filter((f) => f.mii).map((f) => f.name) }] },
      { id: "stages", label: "Stages", items: g.stages.map((s) => ({ id: s.id, label: s.name, defaultOff: !!s.pack })),
        groups: [{ id: "competitive", label: "Competitive list", itemIds: g.stages.filter((s) => s.status === "starter" || s.status === "counterpick").map((s) => s.id) }, ...packGroups(g.stages, sIds)] },
    ],
  };
}

export const COLLECTION_GAMES = ["mario-kart-8-deluxe", "mario-kart-world", ...Object.keys(PARTY_GAMES), ULTIMATE.slug];

const cache = new Map<string, CollectionCatalog | null>();
export function collectionCatalog(slug: string): CollectionCatalog | null {
  if (!cache.has(slug)) {
    cache.set(slug, slug === "mario-kart-8-deluxe" ? mk8dx() : slug === "mario-kart-world" ? mkworld() : slug === ULTIMATE.slug ? smash() : party(slug));
  }
  return cache.get(slug) ?? null;
}

/** A fresh collection: everything owned except items that start locked. */
export function defaultCollection(slug: string): GameCollection {
  const cat = collectionCatalog(slug);
  const off: Record<string, string[]> = {};
  for (const s of cat?.sections ?? []) {
    const ids = s.items.filter((i) => i.defaultOff).map((i) => i.id);
    if (ids.length) off[s.id] = ids;
  }
  return { enabled: true, off, prefs: {} };
}

/** Normalize stored data for a game, with its locked-by-default items as the starting point. */
export function readCollection(slug: string, raw: unknown): GameCollection {
  return readCore(raw, defaultCollection(slug));
}

/** How many items in each section are switched off. */
export function offCounts(slug: string, col: GameCollection): { section: string; label: string; off: number; total: number }[] {
  return (collectionCatalog(slug)?.sections ?? []).map((s) => ({
    section: s.id, label: s.label, total: s.items.length, off: s.items.filter((i) => (col.off[s.id] ?? []).includes(i.id)).length,
  }));
}
