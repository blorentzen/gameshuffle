/**
 * Card decks as stored (meta_cards) and as the engine uses them (PartyCard,
 * CardMoment), plus the validation every editor runs. Client-safe.
 */

import { CARD_MOMENTS, PARTY_CARDS, type CardMoment, type PartyCard } from "@/data/party/cards";

export type CardStatus = "draft" | "live" | "retired";

export interface DeckCardRow {
  id: string;
  deck_id: string;
  card_key: string;
  kind: PartyCard["kind"] | "moment";
  scope: "table" | "player";
  title: string;
  text: string;
  tone: "mild" | "spicy" | null;
  worth: number | null;
  effect: "help" | "crutch" | null;
  turns_min: number | null;
  turns_max: number | null;
  rival_obeys: boolean;
  starter: boolean;
  games: string[] | null;
  not_under: string[] | null;
  status: CardStatus;
  updated_at?: string;
}

/** Moment rows are keyed "mo-<id>" so they can't collide with card keys. */
export const MOMENT_PREFIX = "mo-";

export function rowToCard(r: DeckCardRow): PartyCard {
  return {
    id: r.card_key, kind: r.kind as PartyCard["kind"], scope: r.scope, title: r.title, text: r.text,
    tone: r.tone ?? undefined, worth: (r.worth ?? undefined) as PartyCard["worth"], effect: r.effect ?? undefined,
    turns: r.turns_min && r.turns_max ? [r.turns_min, r.turns_max] : undefined,
    rivalObeys: r.rival_obeys || undefined, starter: r.starter || undefined,
    games: r.games?.length ? r.games : undefined, notUnder: r.not_under?.length ? r.not_under : undefined,
    retired: r.status === "retired" || undefined,
  };
}

export function rowToMoment(r: DeckCardRow): CardMoment {
  return { id: r.card_key.replace(MOMENT_PREFIX, ""), title: r.title, text: r.text, notUnder: r.not_under?.length ? r.not_under : undefined };
}

export interface Deck { cards: PartyCard[]; moments: CardMoment[] }

/** The code deck: what everything uses until the database deck loads (or if it can't). */
export const CODE_DECK: Deck = { cards: PARTY_CARDS, moments: CARD_MOMENTS };

/** Build a deck from rows: live cards to deal, retired ones kept so old references still render. */
export function deckFromRows(rows: DeckCardRow[]): Deck {
  const usable = rows.filter((r) => r.status !== "draft");
  return {
    cards: usable.filter((r) => r.kind !== "moment").map(rowToCard),
    moments: usable.filter((r) => r.kind === "moment" && r.status === "live").map(rowToMoment),
  };
}

/* ── Validation ──────────────────────────────────────────────────────────── */

export interface CardDraft {
  kind: DeckCardRow["kind"];
  scope: "table" | "player";
  title: string;
  text: string;
  tone?: "mild" | "spicy" | null;
  worth?: number | null;
  effect?: "help" | "crutch" | null;
  turns_min?: number | null;
  turns_max?: number | null;
  rival_obeys?: boolean;
  starter?: boolean;
  games?: string[] | null;
  not_under?: string[] | null;
}

const TOKENS = new Set(["{player}", "{rival}", "{n}"]);

/** Problems that stop a card being saved, in plain words. Empty = fine. */
export function validateCard(d: CardDraft): string[] {
  const errs: string[] = [];
  const title = d.title?.trim() ?? ""; const text = d.text?.trim() ?? "";
  if (!title) errs.push("Give the card a title.");
  if (title.length > 60) errs.push("Keep the title to 60 characters.");
  if (!text) errs.push("Write what the card says.");
  if (text.length > 280) errs.push("Keep the card text to 280 characters.");
  for (const t of text.match(/\{[^}]*\}/g) ?? []) if (!TOKENS.has(t)) errs.push(`${t} isn't a placeholder the dealer knows. Use {player}, {rival} or {n}.`);
  const hasN = text.includes("{n}");
  if (hasN && !(d.turns_min && d.turns_max)) errs.push("The text uses {n}, so set a range of turns for it.");
  if (!hasN && (d.turns_min || d.turns_max)) errs.push("There's a turn range but no {n} in the text to show it.");
  if (d.turns_min && d.turns_max && d.turns_min > d.turns_max) errs.push("The shortest turn count is longer than the longest.");
  if (d.rival_obeys && !text.includes("{rival}")) errs.push("\"Rival has to follow it\" needs {rival} in the text.");
  if (d.kind === "chance") {
    if (!d.effect) errs.push("Say whether this Chance card is a help or a crutch.");
    if (!text.includes("{player}")) errs.push("A Chance card is dealt to someone, so name them with {player}.");
  }
  if (d.kind === "mission" && !(d.worth && d.worth >= 1 && d.worth <= 3)) errs.push("Missions are worth 1, 2 or 3 points.");
  if (d.kind === "rule" && !d.tone) errs.push("Mark the house rule mild or spicy.");
  if (d.kind === "moment" && /\{(player|rival|n)\}/.test(text)) errs.push("Card moments apply to the whole table, so they can't use placeholders.");
  return errs;
}
