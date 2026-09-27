import "server-only";
import crypto from "node:crypto";
import { createServiceClient } from "@/lib/supabase/admin";
import { isStaffRole } from "@/lib/subscription";
import { isProUser } from "@/lib/subscription-server";
import { CODE_DECK, deckFromRows, MOMENT_PREFIX, validateCard, type CardDraft, type Deck, type DeckCardRow } from "@/lib/party/deck";

/**
 * Card decks from the database (meta-decks-m1), with the code deck as the
 * fallback when the tables aren't there yet or the official deck is empty.
 *
 *   loadDeck(family)            the official deck (cached briefly)
 *   loadDeck(family, ownerId)   official + a Pro+ owner's own cards
 */

export class DeckError extends Error {
  constructor(public code: string, public status = 400, public details?: string[]) { super(code); }
}
function isMissing(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return ["42703", "42P01", "PGRST204", "PGRST205"].includes(error.code ?? "") || /does not exist|schema cache/i.test(error.message ?? "");
}
function fail(error: { code?: string; message?: string } | null): never {
  if (isMissing(error)) throw new DeckError("unavailable", 503);
  throw new DeckError(error?.message ?? "db_error", 500);
}

export interface DeckRow { id: string; family: string; owner_user_id: string | null; name: string; mix_official: boolean }

const CACHE_MS = 60_000;
const officialCache = new Map<string, { at: number; deck: Deck }>();

async function deckRow(family: string, ownerId: string | null): Promise<DeckRow | null> {
  const q = createServiceClient().from("meta_decks").select("id, family, owner_user_id, name, mix_official").eq("family", family);
  const { data, error } = await (ownerId ? q.eq("owner_user_id", ownerId) : q.is("owner_user_id", null)).maybeSingle();
  if (error) fail(error);
  return (data as DeckRow | null) ?? null;
}
async function cardRows(deckId: string, withDrafts = false): Promise<DeckCardRow[]> {
  let q = createServiceClient().from("meta_cards").select("*").eq("deck_id", deckId).order("kind").order("created_at");
  if (!withDrafts) q = q.neq("status", "draft");
  const { data, error } = await q;
  if (error) fail(error);
  return (data ?? []) as DeckCardRow[];
}

/** The deck to deal from and render with. Never throws: falls back to the code deck. */
export async function loadDeck(family: string, ownerId: string | null = null): Promise<Deck> {
  let official = CODE_DECK;
  try {
    const hit = officialCache.get(family);
    if (hit && Date.now() - hit.at < CACHE_MS) official = hit.deck;
    else {
      const row = await deckRow(family, null);
      const rows = row ? await cardRows(row.id) : [];
      if (rows.some((r) => r.status === "live")) official = deckFromRows(rows);
      officialCache.set(family, { at: Date.now(), deck: official });
    }
  } catch { return CODE_DECK; }
  if (!ownerId) return official;
  try {
    const own = await deckRow(family, ownerId);
    if (!own || !(await isProUser(ownerId))) return official;
    const mine = deckFromRows(await cardRows(own.id));
    if (!mine.cards.length && !mine.moments.length) return official;
    if (own.mix_official) return { cards: [...official.cards, ...mine.cards], moments: [...official.moments, ...mine.moments] };
    // Not mixing: the owner's cards replace the official ones kind by kind, but
    // retired official cards stay so earlier nights still render.
    const kinds = new Set(mine.cards.filter((c) => !c.retired).map((c) => c.kind));
    return {
      cards: [...official.cards.filter((c) => !kinds.has(c.kind) || c.retired).map((c) => (kinds.has(c.kind) ? { ...c, retired: true } : c)), ...mine.cards],
      moments: mine.moments.length ? mine.moments : official.moments,
    };
  } catch { return official; }
}

/* ── Who may edit ────────────────────────────────────────────────────────── */

/** "official" or an owner's user id. */
export type DeckScope = { kind: "official" } | { kind: "owner"; ownerId: string };

/** Parse a route's [scope]: "official", "me", or a streamer's user id (for their mods). */
export function resolveScope(scopeParam: string, userId: string): DeckScope {
  if (scopeParam === "official") return { kind: "official" };
  if (scopeParam === "me") return { kind: "owner", ownerId: userId };
  if (!/^[0-9a-f-]{36}$/i.test(scopeParam)) throw new DeckError("bad_scope");
  return { kind: "owner", ownerId: scopeParam };
}

export async function canEdit(userId: string, scope: DeckScope): Promise<boolean> {
  const svc = createServiceClient();
  if (scope.kind === "official") {
    const { data } = await svc.from("users").select("role").eq("id", userId).maybeSingle();
    return isStaffRole((data as { role?: string } | null)?.role);
  }
  if (!(await isProUser(scope.ownerId))) return false;
  if (userId === scope.ownerId) return true;
  // The streamer's active mods can author too.
  const { data } = await svc.from("streamer_mods").select("id").eq("streamer_user_id", scope.ownerId).eq("gs_user_id", userId).eq("status", "active").limit(1);
  return !!data?.length;
}

/* ── Editing ─────────────────────────────────────────────────────────────── */

async function ensureDeck(family: string, scope: DeckScope): Promise<DeckRow> {
  const ownerId = scope.kind === "owner" ? scope.ownerId : null;
  const found = await deckRow(family, ownerId);
  if (found) return found;
  const { data, error } = await createServiceClient().from("meta_decks").insert({
    family, owner_user_id: ownerId, name: ownerId ? "My cards" : "Official deck",
  }).select("id, family, owner_user_id, name, mix_official").single();
  if (error) fail(error);
  return data as DeckRow;
}

async function audit(deckId: string, cardId: string | null, actorId: string, action: string, before: unknown, after: unknown) {
  await createServiceClient().from("meta_card_audit").insert({ deck_id: deckId, card_id: cardId, actor_id: actorId, action, before, after }).then(() => {}, () => {});
}

export interface CardStats { dealt: number; played: number; done: number }

export async function editorView(family: string, scope: DeckScope) {
  const deck = await deckRow(family, scope.kind === "owner" ? scope.ownerId : null);
  const rows = deck ? await cardRows(deck.id, true) : [];
  const stats: Record<string, CardStats> = {};
  if (rows.length) {
    const { data } = await createServiceClient().from("party_cards").select("card_id, status").in("card_id", rows.map((r) => r.card_key)).limit(20000);
    for (const r of (data ?? []) as { card_id: string; status: string }[]) {
      const s = (stats[r.card_id] ??= { dealt: 0, played: 0, done: 0 });
      s.dealt++; if (r.status === "played") s.played++; if (r.status === "done") s.done++;
    }
  }
  return { deck: deck ? { id: deck.id, name: deck.name, mixOfficial: deck.mix_official } : null, cards: rows, stats };
}

function cleanDraft(d: CardDraft): CardDraft {
  const list = (v: unknown) => (Array.isArray(v) ? v.map(String).filter(Boolean).slice(0, 20) : null);
  const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Math.round(Number(v)));
  return {
    kind: d.kind, scope: d.kind === "chance" || d.kind === "mission" ? "player" : d.scope === "player" ? "player" : "table",
    title: String(d.title ?? "").trim(), text: String(d.text ?? "").trim(),
    tone: d.kind === "rule" ? d.tone ?? null : null,
    worth: d.kind === "mission" ? num(d.worth) : null,
    effect: d.kind === "chance" ? d.effect ?? null : null,
    turns_min: num(d.turns_min), turns_max: num(d.turns_max),
    turns_mode: d.text?.includes("{n}") && d.turns_mode === "until" ? "until" : "for",
    rival_obeys: !!d.rival_obeys, starter: !!d.starter,
    games: list(d.games), not_under: list(d.not_under),
  };
}

function newKey(scope: DeckScope, kind: DeckCardRow["kind"]): string {
  const rand = crypto.randomBytes(5).toString("hex");
  if (kind === "moment") return `${MOMENT_PREFIX}${scope.kind === "owner" ? "u-" : ""}${rand}`;
  return scope.kind === "owner" ? `u-${rand}` : `${kind[0]}-${rand}`;
}

export async function createCard(family: string, scope: DeckScope, actorId: string, draft: CardDraft): Promise<DeckCardRow> {
  if (!["rule", "chance", "mission", "moment"].includes(draft.kind)) throw new DeckError("bad_kind");
  const d = cleanDraft(draft);
  const errs = validateCard(d);
  if (errs.length) throw new DeckError("invalid", 422, errs);
  const deck = await ensureDeck(family, scope);
  const { data, error } = await createServiceClient().from("meta_cards").insert({
    ...d, starter: scope.kind === "official" ? d.starter : false,
    deck_id: deck.id, card_key: newKey(scope, d.kind), status: "draft", created_by: actorId, updated_by: actorId,
  }).select("*").single();
  if (error) fail(error);
  await audit(deck.id, (data as DeckCardRow).id, actorId, "create", null, data);
  return data as DeckCardRow;
}

export type CardChange =
  | { action: "update"; card: CardDraft }
  | { action: "publish"; familySafe: boolean }
  | { action: "retire" }
  | { action: "restore" };

export async function changeCard(family: string, scope: DeckScope, actorId: string, cardId: string, change: CardChange): Promise<DeckCardRow> {
  const deck = await deckRow(family, scope.kind === "owner" ? scope.ownerId : null);
  if (!deck) throw new DeckError("no_deck", 404);
  const svc = createServiceClient();
  const { data: before, error } = await svc.from("meta_cards").select("*").eq("id", cardId).eq("deck_id", deck.id).maybeSingle();
  if (error) fail(error);
  if (!before) throw new DeckError("no_card", 404);
  const cur = before as DeckCardRow;
  let patch: Partial<DeckCardRow> = {};
  let action: string = change.action;
  switch (change.action) {
    case "update": {
      const d = cleanDraft({ ...change.card, kind: cur.kind });
      const errs = validateCard(d);
      if (errs.length) throw new DeckError("invalid", 422, errs);
      patch = { ...d, starter: scope.kind === "official" ? !!d.starter : false } as Partial<DeckCardRow>;
      break;
    }
    case "publish":
      if (!change.familySafe) throw new DeckError("confirm_family_safe", 422, ["Confirm the card is family-safe before publishing."]);
      patch = { status: "live" };
      break;
    case "retire": patch = { status: "retired" }; break;
    case "restore": patch = { status: "live" }; action = "restore"; break;
  }
  const { data, error: e2 } = await svc.from("meta_cards").update({ ...patch, updated_by: actorId, updated_at: new Date().toISOString() }).eq("id", cardId).select("*").single();
  if (e2) fail(e2);
  officialCache.delete(family);
  await audit(deck.id, cardId, actorId, action, cur, data);
  return data as DeckCardRow;
}

export async function setMixOfficial(family: string, scope: DeckScope, actorId: string, mix: boolean): Promise<void> {
  if (scope.kind !== "owner") throw new DeckError("owner_only");
  const deck = await ensureDeck(family, scope);
  const { error } = await createServiceClient().from("meta_decks").update({ mix_official: mix, updated_at: new Date().toISOString() }).eq("id", deck.id);
  if (error) fail(error);
  await audit(deck.id, null, actorId, "deck_settings", { mix_official: deck.mix_official }, { mix_official: mix });
}
