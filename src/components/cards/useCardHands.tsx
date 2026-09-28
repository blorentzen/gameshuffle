"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/toast/ToastProvider";
import { cardById, cardParts, cardsFor, dealCard, simpleTable, turnsLeft, type CardDraw, type PartyCard } from "@/data/party/cards";
import { drawCards } from "@/lib/party/roll";
import type { Deck } from "@/lib/party/deck";

/**
 * House rules, Chance cards, missions, card moments and the turn tracker for
 * a single-screen game night. Shared by every game with a card meta layer
 * (Mario Party, Smash); the game passes its deck family, table and length.
 */

export interface HandsOptions {
  gameSlug: string;
  /** Deck family in meta_decks (e.g. "mario-party", "smash"). */
  family: string;
  /** The code deck used until the database deck loads. */
  fallbackDeck: Deck;
  rulesetId: string | null;
  /** Length of the game in tracker units (turns, or games in a set). */
  length: number;
  seats: number;
  /** Seats 0..people-1 are people; the rest are CPUs. */
  people: number;
  seatName: (seat: number) => string;
  starterOnly: boolean;
  /** What the tracker counts: "turn" (a board game) or "game" (a set of matches). */
  unit: "turn" | "game";
  defaultMoments: string[];
  /** Reload the database deck when this changes (the viewer's account). */
  viewerKey?: string | null;
}

export function useCardHands(o: HandsOptions) {
  const toast = useToast();
  const [deck, setDeck] = useState<Deck>(o.fallbackDeck);
  const byId = useCallback((id: string) => cardById(id, deck.cards), [deck]);
  useEffect(() => {
    let live = true;
    void fetch(`/api/decks/public?family=${o.family}`).then((r) => (r.ok ? r.json() : null)).then((j) => {
      if (live && j?.cards?.length) setDeck({ cards: j.cards, moments: j.moments ?? [] });
    }).catch(() => {});
    return () => { live = false; };
  }, [o.family, o.viewerKey]);

  const [ruleCount, setRuleCount] = useState(1);
  const [spicy, setSpicy] = useState(false);
  const [rules, setRules] = useState<CardDraw[]>([]);
  const [chanceCount, setChanceCount] = useState(2);
  const [chanceMix, setChanceMix] = useState<"both" | "help" | "crutch">("both");
  const [chance, setChance] = useState<CardDraw[]>([]);
  const [missionsPer, setMissionsPer] = useState(2);
  const [missions, setMissions] = useState<CardDraw[][]>([]);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [turn, setTurn] = useState<number | null>(null);
  const [reminder, setReminder] = useState<{ text: string; drawAll?: boolean } | null>(null);
  const [secret, setSecret] = useState(false);
  const [peek, setPeek] = useState<number | null>(null);
  const [moments, setMoments] = useState<string[]>(o.defaultMoments);
  const [drawFor, setDrawFor] = useState("any");

  const { seats, people, length: gameTurns } = o;
  const randomPerson = () => Math.floor(Math.random() * people);
  const fitsTable = (c: PartyCard) => seats > 1 || !c.text.includes("{rival}");
  // Timed cards count from when they're dealt (the start, before the tracker runs).
  const deal = (card: PartyCard, seat: number | null): CardDraw => ({ ...dealCard(card, seat, simpleTable(seats, people), gameTurns), at: turn ?? 1 });
  const pool = (kind: PartyCard["kind"]) => cardsFor(o.gameSlug, o.rulesetId, kind, people, gameTurns, o.starterOnly, deck.cards).filter(fitsTable);

  const drawRules = () => {
    setRules(drawCards(pool("rule").filter((c) => spicy || c.tone === "mild"), ruleCount).map((card) => deal(card, card.scope === "player" ? randomPerson() : null)));
  };
  const chanceDeck = (mix: "both" | "help" | "crutch" = chanceMix) => pool("chance").filter((c) => mix === "both" || c.effect === mix);
  const drawChance = () => {
    // Deal round the table from a random start, so one person doesn't get the lot.
    const picked = drawCards(chanceDeck(), chanceCount);
    const start = randomPerson();
    setChance(picked.map((card, i) => deal(card, (start + i) % people)));
  };
  /** Everyone playing draws one Chance card (the final stretch, intermissions). */
  const drawForEveryone = () => {
    const picks = drawCards(chanceDeck("both"), people, chance.map((d) => d.id));
    setChance((cur) => [...cur, ...picks.map((card, i) => deal(card, i % people))]);
    setReminder(null);
  };
  /** One more card mid-game, for a chosen person (or anyone) and of a chosen kind. */
  const drawOne = (effect: "help" | "crutch" | "both", seat: number | null) => {
    const [card] = drawCards(chanceDeck(effect), 1, chance.map((d) => d.id));
    if (!card) { toast.info("Every card of that kind is already in play."); return; }
    setChance((cur) => [...cur, deal(card, seat ?? randomPerson())]);
  };
  /** Hand a dealt card to a different person. */
  const passCard = (i: number) => setChance((cur) => cur.map((d, j) => {
    if (j !== i || people < 2) return d;
    const next = ((d.seat ?? 0) + 1 + Math.floor(Math.random() * (people - 1))) % people;
    return { ...deal(byId(d.id)!, next), n: d.n };
  }));
  const discardCard = (i: number) => setChance((cur) => cur.filter((_, j) => j !== i));
  const drawMissions = () => {
    const missionPool = pool("mission");
    // Different missions for each person where the deck allows, so no two race for the same card.
    const used: string[] = [];
    setMissions(Array.from({ length: people }, (_, seat) => {
      const hand = drawCards(missionPool, missionsPer, used.length + missionsPer <= missionPool.length ? used : []);
      used.push(...hand.map((c) => c.id));
      return hand.map((card) => deal(card, seat));
    }));
    setDone(new Set());
  };

  const u = o.unit;
  /** Move the tracker. Forward expires "for n" cards and raises card moments. */
  const moveTurn = (to: number) => {
    const next = Math.max(1, Math.min(gameTurns, to));
    const forward = turn !== null && next > turn;
    setTurn(next);
    if (!forward) { setReminder(null); return; }
    const over = (d: CardDraw) => {
      const card = byId(d.id);
      if (!card || card.turnsMode === "until") return false;
      const left = turnsLeft(card, d, next);
      return left !== null && left <= 0;
    };
    const ended = chance.filter(over).map((d) => `${byId(d.id)!.title}${d.seat !== null ? ` (${o.seatName(d.seat)})` : ""}`);
    setChance(chance.filter((d) => !over(d)));
    if (ended.length) toast.info(`Over now: ${ended.join(", ")}`);
    if (next === gameTurns) setReminder({ text: `Last ${u}. After it, tick off missions and count the points.` });
    else if (moments.includes("homestretch") && next === gameTurns - 4) setReminder({ text: `The last five ${u}s start now: every player draws a Chance card.`, drawAll: true });
    else if (moments.includes("catch-up") && next % 5 === 0) setReminder({ text: "Catch-up: whoever is last draws a help, and whoever is first draws a crutch. Use the draw buttons below." });
    else setReminder(null);
  };

  const renderParts = (d: CardDraw) => cardParts(byId(d.id)!, d).map((part, k) =>
    typeof part === "string" ? <span key={k}>{part}</span> : <strong key={k}>{o.seatName(part.seat)}</strong>);
  const missionPoints = (seat: number) => (missions[seat] ?? []).reduce((sum, d) => sum + (done.has(`${seat}:${d.id}`) ? byId(d.id)?.worth ?? 1 : 0), 0);

  return {
    deck, byId, options: o,
    ruleCount, setRuleCount, spicy, setSpicy, rules, setRules,
    chanceCount, setChanceCount, chanceMix, setChanceMix, chance, setChance,
    missionsPer, setMissionsPer, missions, setMissions, done, setDone,
    turn, setTurn, reminder, setReminder, secret, setSecret, peek, setPeek, moments, setMoments, drawFor, setDrawFor,
    drawRules, drawChance, drawForEveryone, drawOne, passCard, discardCard, drawMissions, moveTurn, renderParts, missionPoints,
  };
}

export type CardHands = ReturnType<typeof useCardHands>;
