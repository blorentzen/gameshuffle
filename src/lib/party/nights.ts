import "server-only";
import crypto from "node:crypto";
import { createServiceClient } from "@/lib/supabase/admin";
import { NIGHT_MAX_GAMES, nightGame, placePoints } from "@/lib/nights/games";
import { cardById, cardsFor, dealCard, type CardMoment, type CardTable, type PartyCard } from "@/data/party/cards";
import { loadDeck } from "@/lib/party/deckSource";
import type { Deck } from "@/lib/party/deck";
import { drawCards } from "@/lib/party/roll";
import { cardText } from "@/data/party/cards";
import { recordOverlayEvent } from "@/lib/overlay/events";
import { awardMint } from "@/lib/economy/awards";

/**
 * Live party nights (spec: gs-mario-party-jamboree-spec §7). Service-role only:
 * the tables are closed to browser roles, and everything a phone sees comes
 * from `viewFor`, which filters to what that seat may know.
 */

export type Visibility = "open" | "secret";

export interface NightRow {
  id: string;
  host_user_id: string;
  game_slug: string;
  config: Record<string, unknown>;
  visibility: Visibility;
  join_code: string;
  status: "open" | "ended";
  current_turn: number | null;
  pending_vote?: { pollId: string; effect: "help" | "crutch" | "both" } | null;
  current_game?: number;
  mvp_seat?: number | null;
  created_at: string;
}
export interface GameRow {
  id: string;
  night_id: string;
  idx: number;
  game_slug: string;
  config: Record<string, unknown>;
  status: "up" | "playing" | "done";
}
export interface ResultRow { id: string; game_id: string; seat_index: number; place: number; points: number }
export interface SeatRow {
  id: string;
  night_id: string;
  seat_index: number;
  display_name: string;
  user_id: string | null;
  guest_key_hash: string | null;
  identity_id?: string | null;
  is_cpu: boolean;
  character: string | null;
  joined_at: string | null;
}
export interface CardRow {
  id: string;
  night_id: string;
  card_id: string;
  kind: PartyCard["kind"];
  seat_index: number | null;
  rival_index: number | null;
  turns: number | null;
  dealt_turn: number | null;
  rival_obeys: boolean;
  status: "held" | "played" | "pending" | "done" | "discarded";
  claimed_at: string | null;
  confirmed_by_seat: number | null;
  created_at: string;
}

export class PartyError extends Error {
  constructor(public code: string, public status = 400) { super(code); }
}

/** A table or column this code expects is missing: the migration isn't applied yet. */
export function isMissing(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return ["42703", "42P01", "PGRST204", "PGRST205"].includes(error.code ?? "") || /does not exist|schema cache/i.test(error.message ?? "");
}
function fail(error: { code?: string; message?: string } | null): never {
  if (isMissing(error)) throw new PartyError("unavailable", 503);
  throw new PartyError(error?.message ?? "db_error", 500);
}

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export function newJoinCode(): string {
  const bytes = crypto.randomBytes(8);
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}
export function newGuestKey(): string { return crypto.randomBytes(24).toString("base64url"); }
export function hashKey(key: string): string { return crypto.createHash("sha256").update(key, "utf8").digest("hex"); }
function sameHash(a: string, b: string): boolean {
  const x = Buffer.from(a, "hex"); const y = Buffer.from(b, "hex");
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
export function normalizeCode(code: string): string { return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, ""); }

/* ── Create and load ─────────────────────────────────────────────────────── */

export interface NewSeat { name: string; isCpu: boolean; character: string | null }

export async function createNight(opts: {
  hostId: string; gameSlug: string; config: Record<string, unknown>; visibility: Visibility;
  seats: NewSeat[]; hostSeat: number | null;
  /** Games after the first, in order (multi-game nights). */
  lineup?: string[];
}): Promise<{ id: string; code: string }> {
  if (!nightGame(opts.gameSlug)) throw new PartyError("unknown_game");
  const rest = (opts.lineup ?? []).filter((g) => nightGame(g)).slice(0, NIGHT_MAX_GAMES - 1);
  if (opts.seats.length < 1 || opts.seats.length > 8) throw new PartyError("bad_seats");
  if (!opts.seats.some((s) => !s.isCpu)) throw new PartyError("no_people");
  const svc = createServiceClient();
  let night: { id: string; join_code: string } | null = null;
  for (let i = 0; i < 4 && !night; i++) {
    const { data, error } = await svc.from("party_nights").insert({
      host_user_id: opts.hostId, game_slug: opts.gameSlug, config: opts.config, visibility: opts.visibility, join_code: newJoinCode(),
    }).select("id, join_code").single();
    if (!error) night = data as { id: string; join_code: string };
    else if (error.code !== "23505") fail(error); // a code collision retries
  }
  if (!night) throw new PartyError("code_collision", 500);
  const now = new Date().toISOString();
  const games = await svc.from("party_games").insert([opts.gameSlug, ...rest].map((slug, idx) => ({
    night_id: night!.id, idx, game_slug: slug, config: idx === 0 ? opts.config : {}, status: idx === 0 ? "playing" : "up", started_at: idx === 0 ? now : null,
  })));
  if (games.error) fail(games.error);
  const { error } = await svc.from("party_seats").insert(opts.seats.map((s, i) => ({
    night_id: night!.id, seat_index: i, display_name: s.name.trim().slice(0, 24) || (s.isCpu ? `CPU ${i + 1}` : `Player ${i + 1}`),
    is_cpu: s.isCpu, character: s.character,
    user_id: opts.hostSeat === i && !s.isCpu ? opts.hostId : null, joined_at: opts.hostSeat === i && !s.isCpu ? now : null,
  })));
  if (error) fail(error);
  return { id: night.id, code: night.join_code };
}

export interface Loaded {
  night: NightRow; seats: SeatRow[]; cards: CardRow[];
  games: GameRow[]; results: ResultRow[];
  /** The game being played now, and the deck it deals from (empty for placement-only games). */
  current: GameRow; deck: Deck;
  /** Every card from every deck the night can use, so earlier games' cards still render. */
  lookup: PartyCard[];
}

const EMPTY_DECK: Deck = { cards: [], moments: [] };

export async function loadNight(code: string): Promise<Loaded | null> {
  const svc = createServiceClient();
  const { data: night, error } = await svc.from("party_nights").select("*").eq("join_code", normalizeCode(code)).maybeSingle();
  if (error) fail(error);
  if (!night) return null;
  const [{ data: seats, error: e1 }, { data: cards, error: e2 }, { data: games, error: e3 }, { data: results, error: e4 }] = await Promise.all([
    svc.from("party_seats").select("*").eq("night_id", night.id).order("seat_index"),
    svc.from("party_cards").select("*").eq("night_id", night.id).order("created_at"),
    svc.from("party_games").select("*").eq("night_id", night.id).order("idx"),
    svc.from("party_results").select("id, game_id, seat_index, place, points").eq("night_id", night.id),
  ]);
  if (e1) fail(e1);
  if (e2) fail(e2);
  if (e3) fail(e3);
  if (e4) fail(e4);
  const n = night as NightRow;
  const lineup = ((games ?? []) as GameRow[]);
  // A night from before lineups existed plays its one game.
  if (!lineup.length) lineup.push({ id: "", night_id: n.id, idx: 0, game_slug: n.game_slug, config: n.config, status: "playing" });
  const current = lineup.find((g) => g.idx === (n.current_game ?? 0)) ?? lineup[0];
  // The host's decks: official cards plus their own if they're Pro+.
  const families = [...new Set(lineup.map((g) => nightGame(g.game_slug)?.family).filter((f): f is string => !!f))];
  const decks = new Map(await Promise.all(families.map(async (f) => [f, await loadDeck(f, n.host_user_id)] as const)));
  const family = nightGame(current.game_slug)?.family ?? null;
  const deck = (family && decks.get(family)) || EMPTY_DECK;
  const lookup = [...decks.values()].flatMap((d) => d.cards);
  return { night: n, seats: (seats ?? []) as SeatRow[], cards: (cards ?? []) as CardRow[], games: lineup, results: (results ?? []) as ResultRow[], current, deck, lookup };
}

/* ── Who's asking ────────────────────────────────────────────────────────── */

export interface Viewer { isHost: boolean; seat: number | null }

export function identify(l: Loaded, userId: string | null, guestKey: string | null): Viewer {
  const isHost = !!userId && l.night.host_user_id === userId;
  let seat: number | null = null;
  if (userId) seat = l.seats.find((s) => s.user_id === userId)?.seat_index ?? null;
  if (seat === null && guestKey) {
    const h = hashKey(guestKey);
    seat = l.seats.find((s) => s.guest_key_hash && sameHash(s.guest_key_hash, h))?.seat_index ?? null;
  }
  return { isHost, seat };
}

/* ── What a viewer sees ──────────────────────────────────────────────────── */

export interface VisibleCard {
  id: string; cardId: string; kind: CardRow["kind"]; seat: number | null; rival: number | null; turns: number | null;
  at: number | null; status: CardRow["status"]; involvesMe: boolean; mine: boolean;
}

export function canSee(l: Loaded, v: Viewer, c: CardRow): boolean {
  if (c.kind === "rule" || l.night.visibility === "open" || v.isHost) return true;
  // Played cards, and missions waiting for (or past) confirmation, are public.
  if (c.status === "played" || c.status === "pending" || c.status === "done") return true;
  if (v.seat === null) return false;
  return c.seat_index === v.seat || (c.rival_obeys && c.rival_index === v.seat);
}

/** Night points per seat: placements plus confirmed missions. */
export function nightPoints(l: Loaded): Map<number, { placements: number; missions: number; total: number }> {
  const out = new Map<number, { placements: number; missions: number; total: number }>();
  const add = (seat: number, k: "placements" | "missions", n: number) => {
    const cur = out.get(seat) ?? { placements: 0, missions: 0, total: 0 };
    cur[k] += n; cur.total += n; out.set(seat, cur);
  };
  for (const r of l.results) add(r.seat_index, "placements", r.points);
  for (const c of l.cards) {
    if (c.kind === "mission" && c.status === "done" && c.seat_index !== null) add(c.seat_index, "missions", cardById(c.card_id, l.lookup)?.worth ?? 1);
  }
  return out;
}

/** The night's MVP: most night points, ties broken by missions, then the earlier seat. */
export function mvpOf(l: Loaded): number | null {
  const pts = nightPoints(l);
  const people = l.seats.filter((s) => !s.is_cpu);
  const ranked = people.map((s) => ({ seat: s.seat_index, p: pts.get(s.seat_index) ?? { placements: 0, missions: 0, total: 0 } }))
    .sort((a, b) => b.p.total - a.p.total || b.p.missions - a.p.missions || a.seat - b.seat);
  return ranked[0] && ranked[0].p.total > 0 ? ranked[0].seat : null;
}

export function viewFor(l: Loaded, v: Viewer) {
  const live = l.cards.filter((c) => c.status !== "discarded");
  const pts = nightPoints(l);
  const game = nightGame(l.current.game_slug);
  const handSize = new Map<number, number>();
  for (const c of live) if (c.seat_index !== null && c.kind !== "rule" && c.status === "held") handSize.set(c.seat_index, (handSize.get(c.seat_index) ?? 0) + 1);
  return {
    night: {
      code: l.night.join_code, gameSlug: l.current.game_slug, config: l.current.config,
      visibility: l.night.visibility, status: l.night.status, createdAt: l.night.created_at,
      currentTurn: l.night.current_turn ?? null, totalTurns: turnsOf(l),
      unit: game?.unit ?? "turn", hasCards: !!game?.family, currentGame: l.current.idx, mvpSeat: l.night.mvp_seat ?? null,
    },
    games: l.games.map((g) => ({
      index: g.idx, slug: g.game_slug, status: g.status,
      results: l.results.filter((r) => r.game_id === g.id).sort((a, b) => a.place - b.place).map((r) => ({ seat: r.seat_index, place: r.place, points: r.points })),
    })),
    me: v,
    seats: l.seats.map((s) => ({
      index: s.seat_index, name: s.display_name, isCpu: s.is_cpu, character: s.character,
      taken: !!(s.user_id || s.guest_key_hash || s.identity_id), hasAccount: !!s.user_id, points: pts.get(s.seat_index)?.total ?? 0,
      placementPoints: pts.get(s.seat_index)?.placements ?? 0, missionPoints: pts.get(s.seat_index)?.missions ?? 0,
      handSize: handSize.get(s.seat_index) ?? 0,
    })),
    // Definitions of every card this viewer can see, so custom cards render on any phone.
    defs: Object.fromEntries(live.filter((c) => canSee(l, v, c)).map((c) => [c.card_id, cardById(c.card_id, l.lookup)]).filter(([, d]) => !!d)) as Record<string, PartyCard>,
    moments: l.deck.moments as CardMoment[],
    cards: live.filter((c) => canSee(l, v, c)).map((c): VisibleCard => ({
      id: c.id, cardId: c.card_id, kind: c.kind, seat: c.seat_index, rival: c.rival_index, turns: c.turns, at: c.dealt_turn, status: c.status,
      mine: v.seat !== null && c.seat_index === v.seat,
      involvesMe: v.seat !== null && c.seat_index !== v.seat && c.rival_obeys && c.rival_index === v.seat,
    })),
  };
}

/* ── Joining ─────────────────────────────────────────────────────────────── */

/** Take a seat. Signed-in people link it to their account; guests get a key back. */
export async function joinSeat(l: Loaded, seatIndex: number, name: string, userId: string | null): Promise<{ guestKey: string | null }> {
  if (l.night.status !== "open") throw new PartyError("ended", 410);
  const seat = l.seats.find((s) => s.seat_index === seatIndex);
  if (!seat || seat.is_cpu) throw new PartyError("bad_seat");
  if (seat.user_id || seat.guest_key_hash || seat.identity_id) throw new PartyError("taken", 409);
  if (userId && l.seats.some((s) => s.user_id === userId)) throw new PartyError("already_seated", 409);
  const guestKey = userId ? null : newGuestKey();
  const display = name.trim().slice(0, 24) || seat.display_name;
  const { data, error } = await createServiceClient().from("party_seats").update({
    user_id: userId, guest_key_hash: guestKey ? hashKey(guestKey) : null, display_name: display, joined_at: new Date().toISOString(),
  }).eq("id", seat.id).is("user_id", null).is("guest_key_hash", null).is("identity_id", null).select("id");
  if (error) fail(error);
  if (!data?.length) throw new PartyError("taken", 409);
  return { guestKey };
}

/* ── Actions ─────────────────────────────────────────────────────────────── */

function tableOf(l: Loaded): CardTable {
  return { seats: l.seats.map((s) => s.seat_index), people: l.seats.filter((s) => !s.is_cpu).map((s) => s.seat_index) };
}
function turnsOf(l: Loaded): number {
  const setup = l.current.config.setup as { turns?: number } | null | undefined;
  return setup?.turns ?? nightGame(l.current.game_slug)?.defaultLength ?? 20;
}
function rulesetOf(l: Loaded): string | null {
  return (l.current.config.setup as { rulesetId?: string } | null | undefined)?.rulesetId ?? null;
}
function rowsFor(l: Loaded, cards: PartyCard[], seatFor: (card: PartyCard, i: number) => number | null) {
  const table = tableOf(l); const turns = turnsOf(l);
  return cards.map((card, i) => {
    const d = dealCard(card, seatFor(card, i), table, turns);
    return { night_id: l.night.id, card_id: card.id, kind: card.kind, seat_index: d.seat, rival_index: d.rival, turns: d.n, dealt_turn: l.night.current_turn ?? 1, rival_obeys: !!card.rivalObeys };
  });
}
function randomPerson(l: Loaded): number {
  const people = tableOf(l).people;
  return people[Math.floor(Math.random() * people.length)];
}

export type ActionBody =
  | { action: "deal"; chance: number; mix: "both" | "help" | "crutch"; missions: number }
  | { action: "draw"; effect: "help" | "crutch" | "both"; seat: number | null }
  | { action: "rules"; count: number; spicy: boolean }
  | { action: "play" | "discard" | "claim" | "confirm" | "reject"; cardRow: string }
  | { action: "turn"; to: number | null }
  | { action: "mission"; seat: number | null }
  | { action: "result"; order: number[] }
  | { action: "next"; index: number | null }
  | { action: "add"; slug: string }
  | { action: "end" };

/** What an action did, for chat replies and the overlay. */
export interface ActionOutcome {
  card?: { cardRow?: string; cardId: string; seat: number | null; text: string; title: string; effect?: string; worth?: number };
  paid?: { tokens: number } | { tokens: 0; reason: string };
}

function describe(l: Loaded, row: { card_id: string; seat_index: number | null; rival_index: number | null; turns: number | null; dealt_turn?: number | null; id?: string }): ActionOutcome["card"] | undefined {
  const card = cardById(row.card_id, l.lookup);
  if (!card) return undefined;
  const name = (i: number) => l.seats.find((s) => s.seat_index === i)?.display_name ?? `Seat ${i + 1}`;
  return {
    cardRow: row.id, cardId: row.card_id, seat: row.seat_index, title: card.title, effect: card.effect, worth: card.worth,
    text: cardText(card, { id: row.card_id, seat: row.seat_index, rival: row.rival_index, n: row.turns, at: row.dealt_turn ?? null }, name),
  };
}

/** Show a card on the host's OBS overlay (stream mode). Best effort. */
export async function showOnOverlay(l: Loaded, c: NonNullable<ActionOutcome["card"]>, triggeredBy: string | null) {
  const who = c.seat !== null ? l.seats.find((s) => s.seat_index === c.seat)?.display_name ?? null : null;
  await recordOverlayEvent({
    ownerUserId: l.night.host_user_id, type: "party_card", ttlMs: 9000,
    payload: { kind: c.effect ?? (c.worth ? "mission" : "rule"), title: c.title, text: c.text, player: who, worth: c.worth ?? null, triggeredBy },
  }).catch(() => null);
}

/**
 * Pay tokens for a confirmed mission: worth x party_mission_tokens_per_point,
 * through the streamer's award allowance, to the seat's chat identity (or the
 * identity linked to their account). Only when the host runs a community.
 */
async function payMission(l: Loaded, row: CardRow): Promise<ActionOutcome["paid"]> {
  const card = cardById(row.card_id, l.lookup);
  if (!card || row.seat_index === null) return { tokens: 0, reason: "no_seat" };
  return payTokens(l, row.seat_index, "party_mission_tokens_per_point", 25, card.worth ?? 1, row.id, { surface: "party_mission", card: row.card_id });
}

/**
 * Pay a seat tokens from the host's community allowance: `units` x the economy
 * lever. Only when the host runs a community and the seat has a chat identity.
 */
async function payTokens(l: Loaded, seatIndex: number, lever: string, fallback: number, units: number, refId: string, meta: Record<string, unknown>): Promise<ActionOutcome["paid"]> {
  const svc = createServiceClient();
  const seat = l.seats.find((s) => s.seat_index === seatIndex);
  if (!seat) return { tokens: 0, reason: "no_seat" };
  let identityId = seat.identity_id ?? null;
  if (!identityId && seat.user_id) {
    const { data } = await svc.from("gs_identities").select("id").eq("gs_account_id", seat.user_id).order("created_at").limit(1);
    identityId = (data as { id: string }[] | null)?.[0]?.id ?? null;
  }
  if (!identityId) return { tokens: 0, reason: "no_identity" };
  const { data: hostIds } = await svc.from("gs_identities").select("id").eq("gs_account_id", l.night.host_user_id);
  const ids = ((hostIds ?? []) as { id: string }[]).map((r) => r.id);
  if (!ids.length) return { tokens: 0, reason: "no_community" };
  const { data: community } = await svc.from("gs_communities").select("id").in("owner_identity_id", ids).limit(1).maybeSingle();
  if (!community) return { tokens: 0, reason: "no_community" };
  const { data: per } = await svc.rpc("gs_economy_config_value", { p_key: lever, p_default: fallback });
  const amount = units * Number(per ?? fallback);
  if (amount <= 0) return { tokens: 0, reason: "off" };
  try {
    const res = await awardMint({ communityId: (community as { id: string }).id, toIdentityId: identityId, amount, refId, meta });
    return res.ok ? { tokens: res.minted } : { tokens: 0, reason: res.reason };
  } catch { return { tokens: 0, reason: "award_failed" }; }
}

export async function runAction(l: Loaded, v: Viewer, body: ActionBody): Promise<ActionOutcome> {
  if (l.night.status !== "open") throw new PartyError("ended", 410);
  const svc = createServiceClient();
  const people = tableOf(l).people;
  const deck = (kind: PartyCard["kind"]) => cardsFor(l.current.game_slug, rulesetOf(l), kind, people.length, turnsOf(l), false, l.deck.cards)
    .filter((c) => l.seats.length > 1 || !c.text.includes("{rival}"));
  const hostOnly = () => { if (!v.isHost) throw new PartyError("host_only", 403); };
  const needsCards = () => { if (!l.deck.cards.length) throw new PartyError("no_cards", 409); };

  switch (body.action) {
    case "deal": {
      hostOnly(); needsCards();
      const chanceN = Math.max(0, Math.min(8, Math.floor(body.chance)));
      const missionN = Math.max(0, Math.min(3, Math.floor(body.missions)));
      // New hands replace unfinished ones. Confirmed missions stay: they're the record.
      const del = await svc.from("party_cards").delete().eq("night_id", l.night.id).in("kind", ["chance", "mission"]).neq("status", "done");
      if (del.error) fail(del.error);
      const chanceDeck = deck("chance").filter((c) => body.mix === "both" || c.effect === body.mix);
      const start = Math.floor(Math.random() * people.length);
      const chance = rowsFor(l, drawCards(chanceDeck, chanceN), (_, i) => people[(start + i) % people.length]);
      const missionDeck = deck("mission"); const used: string[] = [];
      const missions = people.flatMap((seat) => {
        const hand = drawCards(missionDeck, missionN, used.length + missionN <= missionDeck.length ? used : []);
        used.push(...hand.map((c) => c.id));
        return rowsFor(l, hand, () => seat);
      });
      const rows = [...chance, ...missions];
      if (rows.length) { const ins = await svc.from("party_cards").insert(rows); if (ins.error) fail(ins.error); }
      return {};
    }
    case "draw": {
      hostOnly(); needsCards();
      const held = l.cards.filter((c) => c.kind === "chance" && c.status !== "discarded").map((c) => c.card_id);
      const [card] = drawCards(deck("chance").filter((c) => body.effect === "both" || c.effect === body.effect), 1, held);
      if (!card) throw new PartyError("deck_empty", 409);
      const seat = body.seat !== null && people.includes(body.seat) ? body.seat : randomPerson(l);
      const ins = await svc.from("party_cards").insert(rowsFor(l, [card], () => seat)).select("*").single();
      if (ins.error) fail(ins.error);
      return { card: describe(l, ins.data as CardRow) };
    }
    case "mission": {
      hostOnly(); needsCards();
      const seat = body.seat !== null && people.includes(body.seat) ? body.seat : randomPerson(l);
      const held = l.cards.filter((c) => c.kind === "mission" && c.seat_index === seat && c.status !== "discarded").map((c) => c.card_id);
      const [card] = drawCards(deck("mission"), 1, held);
      if (!card) throw new PartyError("deck_empty", 409);
      const ins = await svc.from("party_cards").insert(rowsFor(l, [card], () => seat)).select("*").single();
      if (ins.error) fail(ins.error);
      return { card: describe(l, ins.data as CardRow) };
    }
    case "rules": {
      hostOnly(); needsCards();
      const del = await svc.from("party_cards").delete().eq("night_id", l.night.id).eq("kind", "rule");
      if (del.error) fail(del.error);
      const picks = drawCards(deck("rule").filter((c) => body.spicy || c.tone === "mild"), Math.max(0, Math.min(3, Math.floor(body.count))));
      if (picks.length) {
        const ins = await svc.from("party_cards").insert(rowsFor(l, picks, (c) => (c.scope === "player" ? randomPerson(l) : null)));
        if (ins.error) fail(ins.error);
      }
      return {};
    }
    case "turn": {
      hostOnly();
      // null stops tracking; otherwise clamp to the game's length.
      const to = body.to === null ? null : Math.max(1, Math.min(turnsOf(l), Math.floor(Number(body.to))));
      const up = await svc.from("party_nights").update({ current_turn: to, updated_at: new Date().toISOString() }).eq("id", l.night.id);
      if (up.error) fail(up.error);
      if (to !== null && (l.night.current_turn ?? 0) < to) {
        // Moving forward: "for the next n turns" cards that have run out leave the hands.
        const over = l.cards.filter((c) => {
          if (c.kind !== "chance" || c.status !== "held" || c.turns === null) return false;
          const card = cardById(c.card_id, l.lookup);
          if (!card?.turns || card.turnsMode === "until") return false;
          return (c.dealt_turn ?? 1) + c.turns - to <= 0;
        }).map((c) => c.id);
        if (over.length) { const del = await svc.from("party_cards").update({ status: "discarded" }).in("id", over).eq("status", "held"); if (del.error) fail(del.error); }
      }
      return {};
    }
    case "result": {
      hostOnly();
      if (!l.current.id) throw new PartyError("no_lineup", 409);
      // Finishing order, first place first. Seats can be left out (they score 0).
      const valid = new Set(l.seats.map((s) => s.seat_index));
      const order = [...new Set((Array.isArray(body.order) ? body.order : []).map(Number))].filter((i) => valid.has(i));
      if (!order.length) throw new PartyError("bad_order");
      // Re-entering a game's results replaces them.
      const del = await svc.from("party_results").delete().eq("game_id", l.current.id);
      if (del.error) fail(del.error);
      const rows = order.map((seat, i) => ({ night_id: l.night.id, game_id: l.current.id, seat_index: seat, place: i + 1, points: placePoints(i + 1) }));
      const ins = await svc.from("party_results").insert(rows);
      if (ins.error) fail(ins.error);
      // Accounts keep placement points in their record (one row per game each).
      await svc.from("party_points").delete().eq("game_row", l.current.id).eq("source", "placement");
      const record = rows.filter((r) => r.points > 0).map((r) => ({ r, user: l.seats.find((s) => s.seat_index === r.seat_index)?.user_id }))
        .filter((x): x is { r: typeof rows[number]; user: string } => !!x.user)
        .map(({ r, user }) => ({ user_id: user, night_id: l.night.id, game_row: l.current.id, game_slug: l.current.game_slug, source: "placement", points: r.points }));
      if (record.length) await svc.from("party_points").insert(record).then(() => {}, () => {});
      const done = await svc.from("party_games").update({ status: "done", ended_at: new Date().toISOString() }).eq("id", l.current.id);
      if (done.error) fail(done.error);
      return {};
    }
    case "next": {
      hostOnly();
      const open = l.games.filter((g) => g.status !== "done" && g.idx !== l.current.idx);
      if (!open.length) throw new PartyError("no_games_left", 409);
      // null spins for it: a random game from those still to play.
      const pick = body.index === null ? open[Math.floor(Math.random() * open.length)] : open.find((g) => g.idx === Number(body.index));
      if (!pick) throw new PartyError("bad_game");
      // Hands and house rules belong to the game they were dealt for. Confirmed missions stay: they're the record.
      const clear = await svc.from("party_cards").update({ status: "discarded" }).eq("night_id", l.night.id).in("status", ["held", "played", "pending"]);
      if (clear.error) fail(clear.error);
      const now = new Date().toISOString();
      const g = await svc.from("party_games").update({ status: "playing", started_at: now }).eq("id", pick.id);
      if (g.error) fail(g.error);
      const up = await svc.from("party_nights").update({ current_game: pick.idx, current_turn: null, updated_at: now }).eq("id", l.night.id);
      if (up.error) fail(up.error);
      return {};
    }
    case "add": {
      hostOnly();
      if (!nightGame(body.slug)) throw new PartyError("unknown_game");
      if (l.games.length >= NIGHT_MAX_GAMES) throw new PartyError("too_many_games", 409);
      const idx = Math.max(...l.games.map((g) => g.idx)) + 1;
      const ins = await svc.from("party_games").insert({ night_id: l.night.id, idx, game_slug: body.slug, config: {}, status: "up" });
      if (ins.error) fail(ins.error);
      return {};
    }
    case "end": {
      hostOnly();
      const mvp = mvpOf(l);
      const up = await svc.from("party_nights").update({ status: "ended", mvp_seat: mvp, ended_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", l.night.id).eq("status", "open").select("id");
      if (up.error) fail(up.error);
      // The MVP's token bonus, once (the status guard above stops a second payout).
      if (mvp !== null && up.data?.length && l.results.length) {
        return { paid: await payTokens(l, mvp, "night_mvp_tokens", 50, 1, `${l.night.id}:mvp`, { surface: "night_mvp" }) };
      }
      return {};
    }
    default: break;
  }

  // Card actions
  const row = l.cards.find((c) => c.id === body.cardRow);
  if (!row) throw new PartyError("no_card", 404);
  const owner = row.seat_index !== null && v.seat === row.seat_index;
  const set = async (patch: Partial<CardRow>, from: CardRow["status"][]) => {
    const { data, error } = await svc.from("party_cards").update(patch).eq("id", row.id).in("status", from).select("id");
    if (error) fail(error);
    if (!data?.length) throw new PartyError("stale", 409);
  };
  switch (body.action) {
    case "play": {
      if (row.kind !== "chance" || !(owner || v.isHost)) throw new PartyError("not_yours", 403);
      await set({ status: "played" }, ["held"]);
      const c = describe(l, row);
      if (c) await showOnOverlay(l, c, null);
      return { card: c };
    }
    case "discard":
      if (row.kind === "rule" || !(owner || v.isHost)) throw new PartyError("not_yours", 403);
      await set({ status: "discarded" }, ["held", "played"]);
      return {};
    case "claim":
      if (row.kind !== "mission" || !owner) throw new PartyError("not_yours", 403);
      await set({ status: "pending", claimed_at: new Date().toISOString() }, ["held"]);
      return {};
    case "reject":
    case "confirm": {
      if (row.kind !== "mission") throw new PartyError("not_a_mission");
      // The host or any other seated player; never the person themselves.
      if (owner || !(v.isHost || v.seat !== null)) throw new PartyError("cant_confirm_own", 403);
      if (body.action === "reject") { await set({ status: "held", claimed_at: null }, ["pending"]); return {}; }
      // The host can confirm straight from held (a streamer ticking it off on stream).
      await set({ status: "done", confirmed_by_seat: v.seat, confirmed_at: new Date().toISOString() } as Partial<CardRow>, v.isHost ? ["pending", "held"] : ["pending"]);
      const seat = l.seats.find((s) => s.seat_index === row.seat_index);
      const card = cardById(row.card_id, l.lookup);
      if (seat?.user_id && card) {
        // Points only count for accounts. card_row is unique, so a retry can't double-count.
        await svc.from("party_points").insert({
          user_id: seat.user_id, night_id: l.night.id, card_row: row.id, game_slug: l.current.game_slug, source: "mission", card_id: row.card_id, points: card.worth ?? 1,
        }).then(() => {}, () => {});
      }
      return { card: describe(l, row), paid: await payMission(l, row) };
    }
  }
  return {};
}

/** Lifetime points for an account (the start of the meta-game record). */
export async function pointsFor(userId: string): Promise<{ total: number; missions: number; nights: number } | null> {
  const { data, error } = await createServiceClient().from("party_points").select("points, night_id, source").eq("user_id", userId);
  if (error) return null;
  const rows = (data ?? []) as { points: number; night_id: string | null; source: string }[];
  return { total: rows.reduce((s, r) => s + r.points, 0), missions: rows.filter((r) => r.source === "mission").length, nights: new Set(rows.map((r) => r.night_id).filter(Boolean)).size };
}

/* ── Stream mode ─────────────────────────────────────────────────────────── */

/** The streamer's live night on stream right now: their newest open night from the last day. */
export async function activeNightForHost(hostUserId: string): Promise<Loaded | null> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await createServiceClient().from("party_nights").select("join_code")
    .eq("host_user_id", hostUserId).eq("status", "open").gte("created_at", since).order("created_at", { ascending: false }).limit(1);
  if (error) fail(error);
  const code = (data as { join_code: string }[] | null)?.[0]?.join_code;
  return code ? loadNight(code) : null;
}

/** A chatter takes the first open seat (or gets back the one they have). */
export async function joinFromChat(l: Loaded, identity: { id: string; displayName: string; accountUserId: string | null }): Promise<{ seat: number; already: boolean }> {
  if (l.night.status !== "open") throw new PartyError("ended", 410);
  const mine = l.seats.find((s) => s.identity_id === identity.id || (identity.accountUserId && s.user_id === identity.accountUserId));
  if (mine) return { seat: mine.seat_index, already: true };
  const open = l.seats.find((s) => !s.is_cpu && !s.user_id && !s.guest_key_hash && !s.identity_id);
  if (!open) throw new PartyError("full", 409);
  const { data, error } = await createServiceClient().from("party_seats").update({
    identity_id: identity.id, user_id: identity.accountUserId, display_name: identity.displayName.slice(0, 24), joined_at: new Date().toISOString(),
  }).eq("id", open.id).is("identity_id", null).is("user_id", null).is("guest_key_hash", null).select("id");
  if (error) fail(error);
  if (!data?.length) throw new PartyError("taken", 409);
  return { seat: open.seat_index, already: false };
}

/** Match "@name" or "name" to a seated person by display name. */
export function seatByName(l: Loaded, raw: string): number | null {
  const q = raw.trim().replace(/^@/, "").toLowerCase();
  if (!q) return null;
  const seat = l.seats.find((s) => !s.is_cpu && s.display_name.toLowerCase() === q)
    ?? l.seats.find((s) => !s.is_cpu && s.display_name.toLowerCase().startsWith(q));
  return seat?.seat_index ?? null;
}
