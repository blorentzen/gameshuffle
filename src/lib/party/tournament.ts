/**
 * Mario Party on the standard tournament formats (Points, Single/Double elim
 * with lobbies of 4). Client-safe; state lives in `tournaments.settings`:
 *
 *   settings.partyRounds   one shared roll per round: every table plays the
 *                          same board, rules and turns, and (optionally) the
 *                          same Chance card for each seat position.
 *   settings.missionBonus  mission points awarded by the organizer, added to
 *                          Points standings and shown as a mission table.
 */

import { partyGame } from "@/data/party";
import { cardsFor, dealCard, simpleTable, type PartyCard } from "@/data/party/cards";
import { drawCards, rollSetup, type PartySetup } from "@/lib/party/roll";

/** Steep on purpose: winning a table matters far more than scraping third. */
export const PARTY_SCORING_TABLE = [10, 6, 3, 1];
/** Mario Party tables seat four; the top two move on in elimination formats. */
export const PARTY_TABLE_SIZE = 4;
export const PARTY_TABLE_ADVANCE = 2;

export function isPartyGame(slug: string | null | undefined): boolean {
  return !!partyGame(slug);
}

export interface PartyRoundCard { seatPos: number; cardId: string; rival: number | null; n: number | null }
export interface PartyRound { round: number; setup: PartySetup; cards: PartyRoundCard[]; rolledAt: string }
export interface MissionBonus { id: string; participantId: string; cardId: string | null; note: string; points: number; round: number | null; at: string }

export interface RoundOptions {
  /** Longest board game allowed (keeps tournament rounds a sane length). */
  maxTurns: number;
  /** Deal one Chance card per seat position, the same at every table. */
  cards: boolean;
  boardIds?: string[];
  /** Limit the draw to these rulesets (e.g. Pro Rules only). Empty = any that fit. */
  rulesetIds?: string[];
}

/**
 * Roll the next round. Boards rotate: a board isn't repeated until every
 * allowed board has had a turn.
 */
export function rollPartyRound(gameSlug: string, previous: PartyRound[], opts: RoundOptions, deck?: PartyCard[]): PartyRound | null {
  const game = partyGame(gameSlug);
  if (!game) return null;
  const allowed = opts.boardIds?.length ? opts.boardIds : game.boards.map((b) => b.id);
  const used = new Set(previous.map((r) => r.setup.boardId));
  const fresh = allowed.filter((id) => !used.has(id));
  // Shortest-to-longest turn options within the cap; rulesets that can't fit are left out.
  const rulesetIds = game.rulesets
    .filter((r) => r.turns.some((t) => t <= opts.maxTurns) && (!opts.rulesetIds?.length || opts.rulesetIds.includes(r.id)))
    .map((r) => r.id);
  if (!rulesetIds.length) return null;
  let setup = rollSetup(game, { edition: "switch1", boardIds: fresh.length ? fresh : allowed, rulesetIds });
  if (!setup) return null;
  const rs = game.rulesets.find((r) => r.id === setup!.rulesetId)!;
  const fit = rs.turns.filter((t) => t <= opts.maxTurns);
  setup = { ...setup, turns: fit.length ? fit[Math.floor(Math.random() * fit.length)] : Math.min(...rs.turns) };
  const cards: PartyRoundCard[] = [];
  if (opts.cards) {
    const pool = cardsFor(game.slug, setup.rulesetId, "chance", PARTY_TABLE_SIZE, setup.turns, false, deck);
    drawCards(pool, PARTY_TABLE_SIZE).forEach((card, seatPos) => {
      const d = dealCard(card, seatPos, simpleTable(PARTY_TABLE_SIZE), setup!.turns);
      cards.push({ seatPos, cardId: card.id, rival: d.rival, n: d.n });
    });
  }
  return { round: previous.length + 1, setup, cards, rolledAt: new Date().toISOString() };
}

/** Mission bonus totals per participant. */
export function bonusTotals(bonuses: MissionBonus[] | null | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const b of bonuses ?? []) out[b.participantId] = (out[b.participantId] ?? 0) + b.points;
  return out;
}

export function newBonusId(): string {
  return Math.random().toString(36).slice(2, 10);
}
