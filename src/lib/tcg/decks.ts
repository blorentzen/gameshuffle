import "server-only";

/**
 * A player's own Pokémon TCG deck lists (server side). Lines are matched to
 * catalog cards here: set code + number first (a cached card costs nothing; a
 * card we've never fetched costs one Scrydex lookup, capped per paste, the way
 * a search does), then the name, from our own catalog only. Legality and "you
 * own N" are worked out on every read from the catalog and My Cards, so they're
 * never stale. Rows live in `tcg_decks` (supabase/tcg-decks-m1.sql); free
 * accounts keep FREE_DECK_LIMIT, GS Pro as many as they like.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { getCatalogCards } from "@/lib/scrydex/catalog";
import { resolveCard } from "@/lib/scrydex/ingest";
import { isProUser } from "@/lib/subscription-server";
import { getDeckBySlug } from "@/lib/decks";
import type { TcgCard } from "@/lib/scrydex/types";
import {
  FREE_DECK_LIMIT,
  STANDARD_MARKS,
  asDeckFormat,
  basicEnergyType,
  checkDeck,
  nameKey,
  parseDeckText,
  parseGuideTables,
  sectionTotals,
  type DeckCardInfo,
  type DeckCheck,
  type DeckLine,
  type DeckSection,
} from "./deckList";

/** Catalog lookups one paste may spend on cards we've never fetched. */
const MAX_LOOKUPS = 30;
const MISSING = new Set(["42P01", "PGRST205"]);
const COLS = "id, name, format, cards, source, created_at, updated_at";

export interface DeckLineView extends DeckLine {
  image: string | null;
  mark: string | null;
  /** Copies the player owns (My Cards), up to the line's count. */
  owned: number;
}

export interface DeckView {
  id: string | null;
  name: string;
  format: string;
  source: string | null;
  updatedAt: string | null;
  lines: DeckLineView[];
  totals: Record<DeckSection, number> & { all: number };
  checks: DeckCheck[];
  legal: boolean;
  unchecked: number;
  owned: number;
  cover: string | null;
}

export type DeckSummary = Pick<DeckView, "id" | "name" | "updatedAt" | "legal" | "unchecked" | "owned" | "cover"> & { total: number; problems: number; source: string | null };

export type DeckError = "missing" | "not_found" | "limit" | "empty" | "bad_name" | "busy";
export type DeckResult<T> = { ok: true; value: T } | { ok: false; error: DeckError };

interface Row { id: string; name: string; format: string; cards: DeckLine[]; source: string | null; created_at: string; updated_at: string }

const fail = <T>(error: DeckError): DeckResult<T> => ({ ok: false, error });
const isMissing = (err: { code?: string } | null) => !!err?.code && MISSING.has(err.code);

export async function decksReady(): Promise<boolean> {
  const { error } = await createServiceClient().from("tcg_decks").select("id").limit(1);
  return !isMissing(error);
}

const image = (c: TcgCard | undefined) => c?.image_small_path ?? c?.images?.small ?? null;
const englishOnly = (c: TcgCard) => !c.id.startsWith("tcgp-") && !/_ja$|_ja-/.test(c.id) && (c.language_code === "English" || c.language_code === "EN" || !c.language_code);
const sectionFor = (c: TcgCard | undefined, fallback: DeckSection): DeckSection => {
  const s = (c?.supertype ?? "").toLowerCase();
  if (s.startsWith("pok")) return "pokemon";
  if (s.startsWith("trainer")) return "trainer";
  if (s.startsWith("energy")) return "energy";
  return fallback;
};
const isStandardMark = (m: string | null | undefined) => !!m && (STANDARD_MARKS as readonly string[]).includes(m.toUpperCase());

/**
 * Match lines to catalog cards. `spend` allows Scrydex lookups for cards we've
 * never fetched (a player pasting a list); reads of saved decks never spend.
 */
export async function matchLines(input: DeckLine[], opts: { spend: boolean } = { spend: false }): Promise<{ lines: DeckLine[]; cards: Map<string, TcgCard> }> {
  const lines = input.map((l) => ({ ...l }));
  const cards = new Map<string, TcgCard>();
  const ids = [...new Set(lines.map((l) => l.cardId).filter((x): x is string => !!x))];
  for (const c of await getCatalogCards(ids)) cards.set(c.id, c);

  if (opts.spend) {
    const toFetch = ids.filter((id) => !cards.has(id)).slice(0, MAX_LOOKUPS);
    for (let i = 0; i < toFetch.length; i += 5) {
      const got = await Promise.all(toFetch.slice(i, i + 5).map((id) => resolveCard(id).catch(() => null)));
      for (const c of got) if (c) cards.set(c.id, c);
    }
  }

  // Anything still unmatched: our own catalog by name (never a Scrydex call).
  const byName = lines.filter((l) => !basicEnergyType(l.name) && (!l.cardId || !cards.has(l.cardId)));
  if (byName.length) {
    const names = [...new Set(byName.map((l) => l.name))];
    const { data } = await createServiceClient().from("tcg_cards").select("*").in("name", names).limit(500);
    const pool = ((data ?? []) as TcgCard[]).filter(englishOnly);
    for (const l of byName) {
      const options = pool.filter((c) => nameKey(c.name) === nameKey(l.name));
      if (!options.length) { l.cardId = l.cardId && cards.has(l.cardId) ? l.cardId : null; continue; }
      // A Standard printing first, then the newest set.
      options.sort((a, b) => Number(isStandardMark(b.regulation_mark)) - Number(isStandardMark(a.regulation_mark)) || (b.expansion_sort_order ?? 0) - (a.expansion_sort_order ?? 0));
      const pick = options[0];
      cards.set(pick.id, pick);
      l.cardId = pick.id;
    }
  }
  for (const l of lines) {
    if (l.cardId && !cards.has(l.cardId)) l.cardId = null;
    l.section = basicEnergyType(l.name) ? "energy" : sectionFor(l.cardId ? cards.get(l.cardId) : undefined, l.section);
  }
  return { lines, cards };
}

/** Catalog facts for the checks, with "has a Standard reprint" for older Trainers and Energy. */
async function cardInfo(lines: DeckLine[], cards: Map<string, TcgCard>): Promise<Map<string, DeckCardInfo>> {
  const info = new Map<string, DeckCardInfo>();
  const needReprint: string[] = [];
  for (const l of lines) {
    const c = l.cardId ? cards.get(l.cardId) : undefined;
    if (!c) continue;
    info.set(c.id, { supertype: c.supertype, subtypes: c.subtypes, rarity: c.rarity, mark: c.regulation_mark });
    const sect = sectionFor(c, l.section);
    if (sect !== "pokemon" && c.regulation_mark && !isStandardMark(c.regulation_mark)) needReprint.push(c.name);
  }
  if (needReprint.length) {
    const { data } = await createServiceClient().from("tcg_cards").select("name, regulation_mark").in("name", [...new Set(needReprint)]).in("regulation_mark", [...STANDARD_MARKS]).limit(200);
    const legalNames = new Set(((data ?? []) as { name: string }[]).map((r) => nameKey(r.name)));
    for (const [id, i] of info) {
      const c = cards.get(id)!;
      if (legalNames.has(nameKey(c.name)) && !isStandardMark(c.regulation_mark)) i.legalReprint = true;
    }
  }
  return info;
}

interface Owned { byId: Map<string, number>; byName: Map<string, number> }

async function ownedCards(userId: string | null): Promise<Owned> {
  const owned: Owned = { byId: new Map(), byName: new Map() };
  if (!userId) return owned;
  const { data } = await createServiceClient().from("gs_user_cards").select("card_id, quantity, card:tcg_cards(name)").eq("user_id", userId).limit(5000);
  for (const r of (data ?? []) as unknown as { card_id: string; quantity: number; card: { name: string } | null }[]) {
    owned.byId.set(r.card_id, (owned.byId.get(r.card_id) ?? 0) + r.quantity);
    if (r.card?.name) {
      const k = nameKey(r.card.name);
      owned.byName.set(k, (owned.byName.get(k) ?? 0) + r.quantity);
    }
  }
  return owned;
}

/**
 * Copies owned per line. A Pokémon counts that exact card; Trainers and
 * Energy count any printing with the name. Copies are shared out across lines
 * of the same name so nothing is counted twice.
 */
function ownedPerLine(lines: DeckLine[], owned: Owned): number[] {
  const leftById = new Map(owned.byId);
  const leftByName = new Map(owned.byName);
  return lines.map((l) => {
    const take = (pool: Map<string, number>, key: string) => {
      const have = pool.get(key) ?? 0;
      const n = Math.min(have, l.count);
      pool.set(key, have - n);
      return n;
    };
    if (l.section === "pokemon") return l.cardId ? take(leftById, l.cardId) : 0;
    return take(leftByName, nameKey(l.name));
  });
}

/** The full picture of a list: matched lines, checks, ownership. */
export async function viewOf(
  base: { id: string | null; name: string; format: string; source: string | null; updatedAt: string | null },
  input: DeckLine[],
  opts: { userId: string | null; spend: boolean; owned?: Owned },
): Promise<DeckView> {
  const { lines, cards } = await matchLines(input, { spend: opts.spend });
  const info = await cardInfo(lines, cards);
  const owned = ownedPerLine(lines, opts.owned ?? (await ownedCards(opts.userId)));
  const { checks, legal, unchecked } = checkDeck(lines, info, asDeckFormat(base.format));
  const views: DeckLineView[] = lines.map((l, i) => {
    const c = l.cardId ? cards.get(l.cardId) : undefined;
    return { ...l, image: image(c), mark: c?.regulation_mark ?? null, owned: owned[i] };
  });
  const firstPokemon = views.find((l) => l.section === "pokemon" && l.image);
  return {
    ...base,
    lines: views,
    totals: sectionTotals(lines),
    checks,
    legal,
    unchecked,
    owned: owned.reduce((n, x) => n + x, 0),
    cover: firstPokemon?.image ?? null,
  };
}

/** A pasted list, matched and checked, without saving. */
export async function previewText(userId: string, text: string): Promise<{ view: DeckView; skipped: string[] }> {
  const { lines, skipped } = parseDeckText(text);
  const view = await viewOf({ id: null, name: "", format: "standard", source: "paste", updatedAt: null }, lines, { userId, spend: true });
  return { view, skipped };
}

/** A deck guide's list (content/decks), for "Copy to my decks". */
export function guideLines(slug: string): { name: string; lines: DeckLine[] } | null {
  const guide = getDeckBySlug(slug);
  if (!guide) return null;
  const lines = parseGuideTables(guide.body);
  if (!lines.length) return null;
  return { name: (guide.frontmatter.title || slug).slice(0, 60), lines };
}

const cleanName = (raw: unknown): string | null => {
  const s = String(raw ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
  return s || null;
};

const rowView = (row: Row, userId: string, owned?: Owned, format?: string) =>
  viewOf({ id: row.id, name: row.name, format: format ?? row.format, source: row.source, updatedAt: row.updated_at }, row.cards ?? [], { userId, spend: false, owned });

/** A player's decks; `format` checks them against another format (a tournament's) instead of their own. */
export async function listDecks(userId: string, format?: string): Promise<DeckResult<{ decks: DeckSummary[]; limit: number | null }>> {
  const svc = createServiceClient();
  const { data, error } = await svc.from("tcg_decks").select(COLS).eq("user_id", userId).order("updated_at", { ascending: false }).limit(200);
  if (error) return fail(isMissing(error) ? "missing" : "busy");
  const owned = await ownedCards(userId);
  const decks: DeckSummary[] = [];
  for (const row of (data ?? []) as Row[]) {
    const v = await rowView(row, userId, owned, format);
    decks.push({ id: v.id, name: v.name, updatedAt: v.updatedAt, legal: v.legal, unchecked: v.unchecked, owned: v.owned, cover: v.cover, total: v.totals.all, problems: v.checks.filter((c) => c.level === "bad").length, source: v.source });
  }
  const limit = (await isProUser(userId)) ? null : FREE_DECK_LIMIT;
  return { ok: true, value: { decks, limit } };
}

export async function getDeck(userId: string, id: string): Promise<DeckResult<DeckView>> {
  const { data, error } = await createServiceClient().from("tcg_decks").select(COLS).eq("user_id", userId).eq("id", id).maybeSingle();
  if (error) return fail(isMissing(error) ? "missing" : "busy");
  if (!data) return fail("not_found");
  return { ok: true, value: await rowView(data as Row, userId) };
}

/** The deck's matched cards (for the companion's card picker). */
export async function deckCards(userId: string, id: string): Promise<DeckResult<{ name: string; cards: TcgCard[] }>> {
  const { data, error } = await createServiceClient().from("tcg_decks").select("name, cards").eq("user_id", userId).eq("id", id).maybeSingle();
  if (error) return fail(isMissing(error) ? "missing" : "busy");
  if (!data) return fail("not_found");
  const row = data as { name: string; cards: DeckLine[] };
  const ids = [...new Set((row.cards ?? []).map((l) => l.cardId).filter((x): x is string => !!x))];
  return { ok: true, value: { name: row.name, cards: await getCatalogCards(ids) } };
}

/** Save a new deck (matched lines). Free accounts keep FREE_DECK_LIMIT. */
export async function createDeck(userId: string, input: { name: unknown; lines: DeckLine[]; source: string }): Promise<DeckResult<DeckView>> {
  const name = cleanName(input.name);
  if (!name) return fail("bad_name");
  if (!input.lines.length) return fail("empty");
  const svc = createServiceClient();
  if (!(await isProUser(userId))) {
    const { count, error } = await svc.from("tcg_decks").select("id", { count: "exact", head: true }).eq("user_id", userId);
    if (error) return fail(isMissing(error) ? "missing" : "busy");
    if ((count ?? 0) >= FREE_DECK_LIMIT) return fail("limit");
  }
  const { lines } = await matchLines(input.lines, { spend: true });
  const { data, error } = await svc.from("tcg_decks").insert({ user_id: userId, name, cards: lines, source: input.source }).select(COLS).single();
  if (error) return fail(isMissing(error) ? "missing" : "busy");
  return { ok: true, value: await rowView(data as Row, userId) };
}

export async function updateDeck(userId: string, id: string, input: { name?: unknown; lines?: DeckLine[] }): Promise<DeckResult<DeckView>> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.name !== undefined) {
    const name = cleanName(input.name);
    if (!name) return fail("bad_name");
    patch.name = name;
  }
  if (input.lines) {
    if (!input.lines.length) return fail("empty");
    patch.cards = (await matchLines(input.lines, { spend: true })).lines;
  }
  const { data, error } = await createServiceClient().from("tcg_decks").update(patch).eq("user_id", userId).eq("id", id).select(COLS).maybeSingle();
  if (error) return fail(isMissing(error) ? "missing" : "busy");
  if (!data) return fail("not_found");
  return { ok: true, value: await rowView(data as Row, userId) };
}

export async function deleteDeck(userId: string, id: string): Promise<DeckResult<true>> {
  const { error } = await createServiceClient().from("tcg_decks").delete().eq("user_id", userId).eq("id", id);
  if (error) return fail(isMissing(error) ? "missing" : "busy");
  return { ok: true, value: true };
}

/** The decks a player can start a companion game with: names and ids only. */
export async function deckChoices(userId: string): Promise<{ id: string; name: string }[]> {
  const { data } = await createServiceClient().from("tcg_decks").select("id, name").eq("user_id", userId).order("updated_at", { ascending: false }).limit(50);
  return (data ?? []) as { id: string; name: string }[];
}
