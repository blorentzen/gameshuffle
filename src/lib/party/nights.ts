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
import { rivalsAmong } from "@/lib/party/rivals";
import { createPost } from "@/lib/social/feed";
import {
  AWARD_POINTS, AWARDS, bountiesForNight, ensureWeekly, rerollWeekly, tallyAwards, votesForNight, weeklyDone, weeklyRef,
  type AwardId, type BountyRow, type VoteRow, type WeeklyRow,
} from "@/lib/party/extras";

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
  awards_closed_at?: string | null;
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
  /** Extra points for a mission aimed at the player's real rival. */
  bonus?: number;
  weekly?: boolean;
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
  /** This week's community challenge for the current game's deck (open nights only). */
  weekly: WeeklyRow | null;
  bounties: BountyRow[];
  votes: VoteRow[];
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
  const [weekly, bounties, votes] = await Promise.all([
    family && n.status === "open" ? ensureWeekly(n.host_user_id, family, deck.cards).catch(() => null) : Promise.resolve(null),
    bountiesForNight(n.host_user_id, n.id).catch(() => [] as BountyRow[]),
    n.status === "ended" ? votesForNight(n.id).catch(() => [] as VoteRow[]) : Promise.resolve([] as VoteRow[]),
  ]);
  return { night: n, seats: (seats ?? []) as SeatRow[], cards: (cards ?? []) as CardRow[], games: lineup, results: (results ?? []) as ResultRow[], current, deck, lookup, weekly, bounties, votes };
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
  at: number | null; status: CardRow["status"]; involvesMe: boolean; mine: boolean; bonus: number;
}

export function canSee(l: Loaded, v: Viewer, c: CardRow): boolean {
  if (c.kind === "rule" || l.night.visibility === "open" || v.isHost) return true;
  // Played cards, and missions waiting for (or past) confirmation, are public.
  if (c.status === "played" || c.status === "pending" || c.status === "done") return true;
  if (v.seat === null) return false;
  return c.seat_index === v.seat || (c.rival_obeys && c.rival_index === v.seat);
}

/** Night points per seat: placements plus confirmed missions. */
/** Points a card is worth when confirmed: the weekly challenge's points, else the card's worth plus any rival bonus. */
function cardPoints(l: Loaded, c: CardRow): number {
  if (c.weekly) return l.weekly?.points ?? 2;
  return (cardById(c.card_id, l.lookup)?.worth ?? 1) + (c.bonus ?? 0);
}

export function nightPoints(l: Loaded): Map<number, { placements: number; missions: number; extras: number; total: number }> {
  const out = new Map<number, { placements: number; missions: number; extras: number; total: number }>();
  const add = (seat: number, k: "placements" | "missions" | "extras", n: number) => {
    const cur = out.get(seat) ?? { placements: 0, missions: 0, extras: 0, total: 0 };
    cur[k] += n; cur.total += n; out.set(seat, cur);
  };
  for (const r of l.results) add(r.seat_index, "placements", r.points);
  for (const c of l.cards) {
    if (c.kind === "mission" && c.status === "done" && c.seat_index !== null) add(c.seat_index, "missions", cardPoints(l, c));
  }
  // Bounties claimed in this night, and award winners once voting closes.
  for (const b of l.bounties) if (b.status === "claimed" && b.claimed_night === l.night.id && b.claimed_seat !== null) add(b.claimed_seat, "extras", b.points);
  if (l.night.awards_closed_at) for (const w of Object.values(tallyAwards(l.votes))) for (const seat of w.seats) add(seat, "extras", AWARD_POINTS);
  return out;
}

/** The night's MVP: most night points, ties broken by missions, then the earlier seat. */
export function mvpOf(l: Loaded): number | null {
  const pts = nightPoints(l);
  const people = l.seats.filter((s) => !s.is_cpu);
  const ranked = people.map((s) => ({ seat: s.seat_index, p: pts.get(s.seat_index) ?? { placements: 0, missions: 0, extras: 0, total: 0 } }))
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
      placementPoints: pts.get(s.seat_index)?.placements ?? 0, missionPoints: pts.get(s.seat_index)?.missions ?? 0, extraPoints: pts.get(s.seat_index)?.extras ?? 0,
      handSize: handSize.get(s.seat_index) ?? 0,
    })),
    // Definitions of every card this viewer can see, so custom cards render on any phone.
    defs: Object.fromEntries(live.filter((c) => canSee(l, v, c)).map((c) => [c.card_id, cardById(c.card_id, l.lookup)]).filter(([, d]) => !!d)) as Record<string, PartyCard>,
    moments: l.deck.moments as CardMoment[],
    weekly: l.weekly && cardById(l.weekly.card_id, l.lookup) ? { card: cardById(l.weekly.card_id, l.lookup)!, points: l.weekly.points, weekStart: l.weekly.week_start } : null,
    bounties: l.bounties.map((b) => ({
      id: b.id, text: b.text, points: b.points, community: b.night_id === null, status: b.status,
      postedBySeat: b.night_id === l.night.id ? b.posted_by_seat : null,
      claimedSeat: b.claimed_night === l.night.id ? b.claimed_seat : null, claimedHere: b.claimed_night === l.night.id, expiresAt: b.expires_at,
    })),
    awards: {
      list: AWARDS.map((a) => ({ id: a.id, label: a.label })),
      closed: !!l.night.awards_closed_at,
      mine: v.seat === null ? {} : Object.fromEntries(l.votes.filter((x) => x.voter_seat === v.seat).map((x) => [x.award, x.nominee_seat])),
      votesCast: new Set(l.votes.map((x) => x.voter_seat)).size,
      winners: l.night.awards_closed_at ? tallyAwards(l.votes) : {},
    },
    // The recap once the night is over (the page adds its own link when copied).
    recap: l.night.status === "ended" ? recapText(l, "") : null,
    cards: live.filter((c) => canSee(l, v, c)).map((c): VisibleCard => ({
      id: c.id, cardId: c.card_id, kind: c.kind, seat: c.seat_index, rival: c.rival_index, turns: c.turns, at: c.dealt_turn, status: c.status, bonus: c.bonus ?? 0,
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
function rowsFor(l: Loaded, cards: PartyCard[], seatFor: (card: PartyCard, i: number) => number | null, rivals?: Map<number, number>) {
  const table = tableOf(l); const turns = turnsOf(l);
  return cards.map((card, i) => {
    const d = dealCard(card, seatFor(card, i), table, turns);
    // Cards that name a {rival} pick the player's real rival when they're at the table; a mission against them is worth +1.
    const aimed = card.text.includes("{rival}") && d.seat !== null && !!rivals?.has(d.seat);
    const rival = aimed ? rivals!.get(d.seat!)! : d.rival;
    const bonus = aimed && card.kind === "mission" ? 1 : 0;
    return { night_id: l.night.id, card_id: card.id, kind: card.kind, seat_index: d.seat, rival_index: rival, turns: d.n, dealt_turn: l.night.current_turn ?? 1, rival_obeys: !!card.rivalObeys, bonus, weekly: false };
  });
}

/** Each seat's rival seat, among the accounts at this table. */
async function rivalSeats(l: Loaded): Promise<Map<number, number>> {
  const accounts = l.seats.filter((s) => s.user_id);
  if (accounts.length < 2) return new Map();
  const rivals = await rivalsAmong(accounts.map((s) => s.user_id!)).catch(() => new Map<string, string>());
  const seatOf = new Map(accounts.map((s) => [s.user_id!, s.seat_index]));
  const out = new Map<number, number>();
  for (const s of accounts) { const r = rivals.get(s.user_id!); if (r && seatOf.has(r)) out.set(s.seat_index, seatOf.get(r)!); }
  return out;
}
function randomPerson(l: Loaded): number {
  const people = tableOf(l).people;
  return people[Math.floor(Math.random() * people.length)];
}

export type ActionBody =
  | { action: "deal"; chance: number; mix: "both" | "help" | "crutch"; missions: number; carryover?: boolean }
  | { action: "post_recap" }
  | { action: "weekly_reroll" }
  | { action: "bounty_post"; text: string; points: number; community?: boolean; days?: number }
  | { action: "bounty_claim" | "bounty_confirm" | "bounty_reject" | "bounty_cancel"; id: string }
  | { action: "award_vote"; award: AwardId; nominee: number }
  | { action: "award_close" }
  | { action: "draw"; effect: "help" | "crutch" | "both"; seat: number | null }
  | { action: "rules"; count: number; spicy: boolean }
  | { action: "play" | "discard" | "claim" | "confirm" | "reject"; cardRow: string }
  | { action: "turn"; to: number | null }
  | { action: "mission"; seat: number | null }
  | { action: "result"; order: number[]; characters?: Record<string, string> }
  | { action: "next"; index: number | null }
  | { action: "add"; slug: string }
  | { action: "end" };

/** What an action did, for chat replies and the overlay. */
export interface ActionOutcome {
  card?: { cardRow?: string; cardId: string; seat: number | null; text: string; title: string; effect?: string; worth?: number };
  paid?: { tokens: number } | { tokens: 0; reason: string };
  /** Things to tell the host (e.g. who carried a card over from last night). */
  notes?: string[];
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
  if (!cardById(row.card_id, l.lookup) || row.seat_index === null) return { tokens: 0, reason: "no_seat" };
  return payTokens(l, row.seat_index, "party_mission_tokens_per_point", 25, cardPoints(l, row), row.id, { surface: row.weekly ? "party_weekly" : "party_mission", card: row.card_id });
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

/**
 * Last night's MVP and last place (the host's most recent ended night), mapped
 * to seats at this table by account: the MVP carries a crutch, last place a help.
 */
async function carryoverFor(l: Loaded): Promise<Map<number, "help" | "crutch">> {
  const out = new Map<number, "help" | "crutch">();
  const { data } = await createServiceClient().from("party_nights").select("join_code")
    .eq("host_user_id", l.night.host_user_id).eq("status", "ended").neq("id", l.night.id).order("ended_at", { ascending: false }).limit(1);
  const code = (data as { join_code: string }[] | null)?.[0]?.join_code;
  const prev = code ? await loadNight(code).catch(() => null) : null;
  if (!prev) return out;
  const seatHere = (userId: string | null | undefined) => (userId ? l.seats.find((s) => s.user_id === userId)?.seat_index ?? null : null);
  const mvpUser = prev.night.mvp_seat != null ? prev.seats.find((s) => s.seat_index === prev.night.mvp_seat)?.user_id : null;
  const pts = nightPoints(prev);
  const accounts = prev.seats.filter((s) => s.user_id && !s.is_cpu);
  const last = accounts.length > 1 ? [...accounts].sort((a, b) => (pts.get(a.seat_index)?.total ?? 0) - (pts.get(b.seat_index)?.total ?? 0))[0] : null;
  const m = seatHere(mvpUser);
  if (m !== null) out.set(m, "crutch");
  const lastSeat = last && last.user_id !== mvpUser ? seatHere(last.user_id) : null;
  if (lastSeat !== null) out.set(lastSeat, "help");
  return out;
}

/** A plain-text recap of the night, for Discord or a community post. */
export function recapText(l: Loaded, url: string): string {
  const pts = nightPoints(l);
  const name = (i: number) => l.seats.find((s) => s.seat_index === i)?.display_name ?? `Seat ${i + 1}`;
  const standings = l.seats.filter((s) => !s.is_cpu).map((s) => ({ seat: s.seat_index, p: pts.get(s.seat_index)?.total ?? 0 })).sort((a, b) => b.p - a.p);
  const mvp = l.night.mvp_seat ?? mvpOf(l);
  const games = l.games.filter((g) => g.status === "done").map((g) => {
    const top = l.results.filter((r) => r.game_id === g.id).sort((a, b) => a.place - b.place).slice(0, 3).map((r) => name(r.seat_index));
    return `${nightGame(g.game_slug)?.short ?? g.game_slug}: ${top.join(", ")}`;
  });
  const missions = l.cards.filter((c) => c.kind === "mission" && c.status === "done").length;
  return [
    `Game night recap${mvp !== null ? `: ${name(mvp)} is the MVP` : ""}`,
    `Standings: ${standings.map((x, i) => `${i + 1}. ${name(x.seat)} ${x.p}`).join(" · ")}`,
    games.length ? `Games: ${games.join(" · ")}` : "",
    missions ? `Missions completed: ${missions}` : "",
    url,
  ].filter(Boolean).join("\n");
}

/** Post the recap to the host's community feed (after the night ends). */
async function postRecap(l: Loaded, v: Viewer): Promise<ActionOutcome> {
  if (!v.isHost) throw new PartyError("host_only", 403);
  if (l.night.status !== "ended") throw new PartyError("not_ended", 409);
  const svc = createServiceClient();
  const { data: ids } = await svc.from("gs_identities").select("id").eq("gs_account_id", l.night.host_user_id);
  const idList = ((ids ?? []) as { id: string }[]).map((r) => r.id);
  const { data: community } = idList.length ? await svc.from("gs_communities").select("id").in("owner_identity_id", idList).limit(1).maybeSingle() : { data: null };
  if (!community) throw new PartyError("no_community", 409);
  const base = process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.gameshuffle.co";
  const res = await createPost({ authorId: l.night.host_user_id, body: recapText(l, `${base}/party/${l.night.join_code}`), communityId: (community as { id: string }).id });
  if (!res.ok) throw new PartyError(res.reason, 429);
  return { notes: ["Posted to your community."] };
}

/** Weekly challenge reroll and points bounties (open nights). */
async function runExtras(l: Loaded, v: Viewer, body: ActionBody): Promise<ActionOutcome> {
  const svc = createServiceClient();
  const now = new Date().toISOString();
  const userAt = (seat: number | null) => (seat === null ? null : l.seats.find((s) => s.seat_index === seat)?.user_id ?? null);
  switch (body.action) {
    case "weekly_reroll": {
      if (!v.isHost) throw new PartyError("host_only", 403);
      if (!l.weekly) throw new PartyError("no_weekly", 409);
      const next = await rerollWeekly(l.weekly, l.deck.cards);
      // Unfinished copies in hands switch to the new challenge.
      if (next) await svc.from("party_cards").update({ card_id: next.card_id }).eq("night_id", l.night.id).eq("weekly", true).in("status", ["held", "pending"]);
      return {};
    }
    case "bounty_post": {
      if (!v.isHost && v.seat === null) throw new PartyError("not_in_night", 403);
      const text = String(body.text ?? "").trim().slice(0, 140);
      if (!text) throw new PartyError("empty");
      const community = !!body.community && v.isHost;
      const days = Math.max(1, Math.min(30, Math.floor(Number(body.days) || 7)));
      const ins = await svc.from("party_bounties").insert({
        host_user_id: l.night.host_user_id, night_id: community ? null : l.night.id, text, points: Math.max(1, Math.min(5, Math.floor(Number(body.points) || 1))),
        posted_by_seat: v.seat, expires_at: community ? new Date(Date.now() + days * 86400000).toISOString() : null,
      });
      if (ins.error) fail(ins.error);
      return { notes: [community ? "Community bounty posted. It stays open across nights until someone claims it." : "Bounty posted."] };
    }
    default: break;
  }
  const b = l.bounties.find((x) => x.id === (body as { id?: string }).id);
  if (!b) throw new PartyError("no_bounty", 404);
  const set = async (patch: Record<string, unknown>, from: BountyRow["status"][]) => {
    const { data, error } = await svc.from("party_bounties").update(patch).eq("id", b.id).in("status", from).select("id");
    if (error) fail(error);
    if (!data?.length) throw new PartyError("stale", 409);
  };
  switch (body.action) {
    case "bounty_claim":
      if (v.seat === null) throw new PartyError("not_in_night", 403);
      await set({ status: "pending", claimed_night: l.night.id, claimed_seat: v.seat, claimed_user: userAt(v.seat) }, ["open"]);
      return {};
    case "bounty_reject":
    case "bounty_confirm": {
      // The host or another player at this night; never the claimer.
      if (b.claimed_night !== l.night.id || b.claimed_seat === v.seat || !(v.isHost || v.seat !== null)) throw new PartyError("cant_confirm_own", 403);
      if (body.action === "bounty_reject") { await set({ status: "open", claimed_night: null, claimed_seat: null, claimed_user: null }, ["pending"]); return {}; }
      await set({ status: "claimed", confirmed_by_seat: v.seat, resolved_at: now }, ["pending"]);
      if (b.claimed_user) {
        await svc.from("party_points").insert({ user_id: b.claimed_user, night_id: l.night.id, card_row: b.id, game_slug: l.current.game_slug, source: "bounty", card_id: null, points: b.points }).then(() => {}, () => {});
      }
      return {};
    }
    case "bounty_cancel":
      if (!(v.isHost || (b.night_id === l.night.id && b.posted_by_seat !== null && b.posted_by_seat === v.seat))) throw new PartyError("not_yours", 403);
      await set({ status: "cancelled", resolved_at: now }, ["open"]);
      return {};
  }
  return {};
}

/** Table-voted awards, after the night ends: everyone votes, then the host closes and awards points. */
async function runAwards(l: Loaded, v: Viewer, body: ActionBody): Promise<ActionOutcome> {
  if (l.night.status !== "ended") throw new PartyError("not_ended", 409);
  if (l.night.awards_closed_at) throw new PartyError("awards_closed", 409);
  const svc = createServiceClient();
  if (body.action === "award_vote") {
    if (v.seat === null) throw new PartyError("not_in_night", 403);
    const nominee = l.seats.find((s) => s.seat_index === Number(body.nominee) && !s.is_cpu);
    if (!AWARDS.some((a) => a.id === body.award) || !nominee || nominee.seat_index === v.seat) throw new PartyError("bad_vote");
    const up = await svc.from("party_award_votes").upsert({ night_id: l.night.id, award: body.award, voter_seat: v.seat, nominee_seat: nominee.seat_index }, { onConflict: "night_id,award,voter_seat" });
    if (up.error) fail(up.error);
    return {};
  }
  if (!v.isHost) throw new PartyError("host_only", 403);
  const { data, error } = await svc.from("party_nights").update({ awards_closed_at: new Date().toISOString() }).eq("id", l.night.id).is("awards_closed_at", null).select("id");
  if (error) fail(error);
  if (!data?.length) throw new PartyError("awards_closed", 409);
  const winners = tallyAwards(l.votes);
  const rows = Object.entries(winners).flatMap(([award, w]) => w.seats.map((seat) => ({ award, user: l.seats.find((s) => s.seat_index === seat)?.user_id })))
    .filter((x): x is { award: string; user: string } => !!x.user)
    .map((x) => ({ user_id: x.user, night_id: l.night.id, game_slug: l.current.game_slug, source: "award", card_id: x.award, points: AWARD_POINTS, ref: `award:${l.night.id}:${x.award}` }));
  if (rows.length) await svc.from("party_points").insert(rows).then(() => {}, () => {});
  const name = (i: number) => l.seats.find((s) => s.seat_index === i)?.display_name ?? `Seat ${i + 1}`;
  return { notes: Object.entries(winners).map(([award, w]) => `${AWARDS.find((a) => a.id === award)?.label}: ${w.seats.map(name).join(" and ")}`) };
}

export async function runAction(l: Loaded, v: Viewer, body: ActionBody): Promise<ActionOutcome> {
  if (body.action === "post_recap") return postRecap(l, v);
  if (body.action === "award_vote" || body.action === "award_close") return runAwards(l, v, body);
  if (body.action.startsWith("bounty_") || body.action === "weekly_reroll") {
    if (l.night.status !== "open") throw new PartyError("ended", 410);
    return runExtras(l, v, body);
  }
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
      const rivals = await rivalSeats(l);
      const chanceDeck = deck("chance").filter((c) => body.mix === "both" || c.effect === body.mix);
      const start = Math.floor(Math.random() * people.length);
      const chance = rowsFor(l, drawCards(chanceDeck, chanceN), (_, i) => people[(start + i) % people.length], rivals);
      const missionDeck = deck("mission"); const used: string[] = [];
      const missions = people.flatMap((seat) => {
        const hand = drawCards(missionDeck, missionN, used.length + missionN <= missionDeck.length ? used : []);
        used.push(...hand.map((c) => c.id));
        return rowsFor(l, hand, () => seat, rivals);
      });
      // Balancing across nights: on the night's first deal, last night's MVP gets a crutch and last place a help.
      const notes: string[] = [];
      const extra: ReturnType<typeof rowsFor> = [];
      if (body.carryover !== false && !l.cards.some((c) => c.kind === "chance")) {
        const carry = await carryoverFor(l);
        const held = chance.map((r) => r.card_id);
        for (const [seat, effect] of carry) {
          const [card] = drawCards(deck("chance").filter((c) => c.effect === effect), 1, held);
          if (!card) continue;
          held.push(card.id);
          extra.push(...rowsFor(l, [card], () => seat, rivals));
          const name = l.seats.find((x) => x.seat_index === seat)?.display_name ?? "Someone";
          notes.push(effect === "crutch" ? `${name} was the MVP of the previous night and starts with a crutch.` : `${name} came last in the previous night and starts with a help.`);
        }
      }
      // This week's challenge: one more mission for everyone who hasn't finished it (this week, or earlier tonight).
      const weeklyRows: ReturnType<typeof rowsFor> = [];
      const weeklyCard = l.weekly ? cardById(l.weekly.card_id, l.deck.cards) : undefined;
      if (l.weekly && weeklyCard) {
        const done = await weeklyDone(l.weekly, l.seats.filter((x) => x.user_id).map((x) => x.user_id!));
        for (const seat of people) {
          const user = l.seats.find((x) => x.seat_index === seat)?.user_id;
          if ((user && done.has(user)) || l.cards.some((c) => c.weekly && c.seat_index === seat && c.status === "done")) continue;
          weeklyRows.push(...rowsFor(l, [weeklyCard], () => seat).map((r) => ({ ...r, weekly: true })));
        }
      }
      const rows = [...chance, ...missions, ...extra, ...weeklyRows];
      if (rows.length) { const ins = await svc.from("party_cards").insert(rows); if (ins.error) fail(ins.error); }
      return notes.length ? { notes } : {};
    }
    case "draw": {
      hostOnly(); needsCards();
      const held = l.cards.filter((c) => c.kind === "chance" && c.status !== "discarded").map((c) => c.card_id);
      const [card] = drawCards(deck("chance").filter((c) => body.effect === "both" || c.effect === body.effect), 1, held);
      if (!card) throw new PartyError("deck_empty", 409);
      const seat = body.seat !== null && people.includes(body.seat) ? body.seat : randomPerson(l);
      const ins = await svc.from("party_cards").insert(rowsFor(l, [card], () => seat, await rivalSeats(l))).select("*").single();
      if (ins.error) fail(ins.error);
      return { card: describe(l, ins.data as CardRow) };
    }
    case "mission": {
      hostOnly(); needsCards();
      const seat = body.seat !== null && people.includes(body.seat) ? body.seat : randomPerson(l);
      const held = l.cards.filter((c) => c.kind === "mission" && c.seat_index === seat && c.status !== "discarded").map((c) => c.card_id);
      const [card] = drawCards(deck("mission"), 1, held);
      if (!card) throw new PartyError("deck_empty", 409);
      const ins = await svc.from("party_cards").insert(rowsFor(l, [card], () => seat, await rivalSeats(l))).select("*").single();
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
      // Who played what this game: the host's pick, else the seat's character.
      const picked = (body.characters ?? {}) as Record<string, string>;
      const characterOf = (seat: number) => (String(picked[String(seat)] ?? "").slice(0, 40) || l.seats.find((s) => s.seat_index === seat)?.character) ?? null;
      const rows = order.map((seat, i) => ({ night_id: l.night.id, game_id: l.current.id, seat_index: seat, place: i + 1, points: placePoints(i + 1), character: characterOf(seat) }));
      const ins = await svc.from("party_results").insert(rows);
      if (ins.error) fail(ins.error);
      // Accounts keep placement points in their record (one row per game each).
      await svc.from("party_points").delete().eq("game_row", l.current.id).eq("source", "placement");
      const record = rows.filter((r) => r.points > 0).map((r) => ({ r, user: l.seats.find((s) => s.seat_index === r.seat_index)?.user_id }))
        .filter((x): x is { r: typeof rows[number]; user: string } => !!x.user)
        .map(({ r, user }) => ({ user_id: user, night_id: l.night.id, game_row: l.current.id, game_slug: l.current.game_slug, source: "placement", points: r.points }));
      // Remember a changed pick on the seat, so the next game starts from it.
      for (const [k, v] of Object.entries(picked)) {
        const seat = l.seats.find((x) => x.seat_index === Number(k));
        if (seat && v && v !== seat.character) await svc.from("party_seats").update({ character: String(v).slice(0, 40) }).eq("id", seat.id);
      }
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
  if (!("cardRow" in body)) throw new PartyError("bad_action");
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
        // Points only count for accounts. card_row is unique, so a retry can't double-count;
        // the weekly challenge's ref also stops a second completion in the same week.
        await svc.from("party_points").insert({
          user_id: seat.user_id, night_id: l.night.id, card_row: row.id, game_slug: l.current.game_slug,
          source: row.weekly ? "weekly" : "mission", card_id: row.card_id, points: cardPoints(l, row),
          ...(row.weekly && l.weekly ? { ref: weeklyRef(l.weekly) } : {}),
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
