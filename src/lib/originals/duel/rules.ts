/**
 * Daily Duel: the rules around the engine (pure, client-safe). Picks 2026-10-21,
 * https://claude.ai/artifact/5fdauqQ8MPof41oWXYcuPk.
 *
 * Days are Pacific (src/lib/time/gsClock.ts): a new duel at midnight Pacific. Difficulty follows
 * the weekday (easy Monday, hardest Sunday, a villain team's boss on Saturday) through the
 * trainer's tier; trainers rotate inside a tier by person, without repeats until every person in
 * the tier has had a day, a person with several teams brings the next one each time they come
 * back, and nobody comes twice inside a week, whatever the tiers (trainerFor). Points come from
 * turns against the day's par; the share text is squares for your six cards and never names a card.
 */

import { gsAddDays, gsWeekday } from "@/lib/time/gsClock";
import { TURN_CAP } from "./engine";
import type { DuelCard, DuelEventAt, DuelEventKind, DuelTier, DuelTrainer, EnergyType } from "./types";

/**
 * Duel #1. May move before launch, never after: the number counts days from it, and shares and
 * boards carry the number.
 */
export const DUEL_EPOCH = "2026-10-28";

/** Duel number for a day (#1 on DUEL_EPOCH); 0 before it. */
export function duelNumber(day: string): number {
  if (day < DUEL_EPOCH) return 0;
  return Math.round((Date.parse(`${day}T12:00:00Z`) - Date.parse(`${DUEL_EPOCH}T12:00:00Z`)) / 86_400_000) + 1;
}

// ─── difficulty by weekday ───────────────────────────────────────────────────

/** A fixed Monday the tier rotation counts from. Never change it: every unbuilt day's trainer would move. */
const ANCHOR = "2026-01-05";

/**
 * Mon gym, Tue gym, Wed elite, Thu elite, Fri rival, Sat boss, Sun champion. (Saturday alternated
 * elite and rival weeks until the roster round of 2026-10-21 made it Boss day.)
 */
export function tierFor(day: string): DuelTier {
  const wd = gsWeekday(day);
  if (wd === 1 || wd === 2) return "gym";
  if (wd === 3 || wd === 4) return "elite";
  if (wd === 5) return "rival";
  if (wd === 6) return "boss";
  return "champion";
}

export const TIER_LABEL: Record<DuelTier, string> = { gym: "Gym Leader", elite: "Elite Four", rival: "Rival", boss: "Boss", champion: "Champion" };

/**
 * The par each tier accepts (the solver's fewest turns). A pack whose par falls outside its band
 * is drawn again; Monday's gym leaders are quick, Sunday's champions take a while. Tuned on the real
 * roster 2026-10-21 (3 days for each of the 74 trainers, strength-matched packs): every trainer
 * landed in band in 1 to 3 packs on average, pars gym 5-10, elite 7-14, rival 8-14, champion 11-18.
 * Checked again on the 148-trainer roster the same day (3 days each, scripts/.tmp/duel-sweep3.ts):
 * Boss day's [10, 15] gave pars 10-14 in 2.7 packs on average; every other tier stayed in its band
 * (gym 4.0 packs, the 2-card Gym teams included, with harder-hitting prints pinned where needed).
 */
export const PAR_BAND: Record<DuelTier, [number, number]> = {
  gym: [4, 9],
  elite: [7, 12],
  rival: [9, 14],
  boss: [10, 15],
  champion: [12, 18],
};

/** When a tier has no trainers yet, the nearest one that does. */
export const TIER_FALLBACK: Record<DuelTier, DuelTier[]> = {
  gym: ["elite", "rival", "boss", "champion"],
  elite: ["rival", "gym", "boss", "champion"],
  rival: ["elite", "boss", "gym", "champion"],
  boss: ["champion", "elite", "rival", "gym"],
  champion: ["boss", "elite", "rival", "gym"],
};

// ─── seeded draws ────────────────────────────────────────────────────────────

/** A seeded random number generator (sfc32 over a cyrb128 hash of the seed). Same seed, same numbers, everywhere. */
export function duelRand(seed: string): () => number {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0; i < seed.length; i++) {
    const k = seed.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  let a = (h1 ^ h2 ^ h3 ^ h4) >>> 0, b = (h2 ^ h1) >>> 0, c = (h3 ^ h1) >>> 0, d = (h4 ^ h1) >>> 0;
  return () => {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    const t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    const r = (t + d) | 0;
    c = (c + r) | 0;
    return (r >>> 0) / 4294967296;
  };
}

export function shuffleWith<T>(items: readonly T[], rand: () => number): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ─── the trainer of the day ──────────────────────────────────────────────────

/** "Lt. Surge" → "lt-surge", "Tate & Liza" → "tate-liza": a person's key when the roster doesn't give one. */
export function personKey(name: string): string {
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** Who a trainer is across their teams (DuelTrainer.person, else worked out from the name). */
export const personOf = (t: Pick<DuelTrainer, "name" | "person">): string => t.person ?? personKey(t.name);

/** A tier's trainers (or the nearest tier's, when it has none yet) and the tier they came from. */
function tierRoster(want: DuelTier, trainers: readonly DuelTrainer[]): { tier: DuelTier; list: DuelTrainer[] } {
  let tier = want;
  let list = trainers.filter((t) => t.tier === tier);
  for (const alt of TIER_FALLBACK[want]) {
    if (list.length) break;
    tier = alt;
    list = trainers.filter((t) => t.tier === tier);
  }
  return { tier, list };
}

/**
 * Each person in a tier with their teams there, in roster order (the first-added team first: add a
 * person's next team after the earlier ones). Persons come out sorted by key.
 */
export function peopleOf(list: readonly DuelTrainer[]): { person: string; teams: DuelTrainer[] }[] {
  const by = new Map<string, DuelTrainer[]>();
  for (const t of list) {
    const p = personOf(t);
    const teams = by.get(p);
    if (teams) teams.push(t);
    else by.set(p, [t]);
  }
  return [...by.keys()].sort().map((person) => ({ person, teams: by.get(person)! }));
}

/**
 * Days closer together than this never bring the same person, in any tier (roster round pass 2,
 * 2026-10-21): Giovanni leads Team Rainbow Rocket on Boss day and the Viridian Gym on gym days, and
 * a person with teams in two tiers must not do both inside a week.
 */
export const PERSON_GAP_DAYS = 7;

/** One weekday tier's walk through its people (see trainerFor). */
interface Stream {
  /** The tier the people come from: the weekday's own, or the nearest with trainers. */
  tier: DuelTier;
  /** Borrowing another tier's people (an incomplete roster, as in the fixtures): no week guard. */
  borrowed: boolean;
  keys: string[];
  teams: Map<string, DuelTrainer[]>;
  /** Cycles shuffled into the queue so far. */
  cycles: number;
  /** Visits still to come, in order: the rest of the current cycle, then the next. */
  queue: { person: string; visit: number }[];
  last: string | null;
}

interface DayPick { person: string; visit: number; borrowed: boolean }

interface Plan {
  /** The roster this plan walked (ids and tiers), so a changed roster starts over. */
  sig: string;
  /** picks[i] is the person on the anchor + i days, and which of their visits in that tier it is. */
  picks: (DayPick | null)[];
  streams: Map<DuelTier, Stream>;
}

/** Walked plans by roster (the builder asks for days one after another; each walk carries on). */
const PLANS = new WeakMap<readonly DuelTrainer[], Plan>();

const DAY_MS = 86_400_000;
const offsetOf = (day: string) => Math.round((Date.parse(`${day}T12:00:00Z`) - Date.parse(`${ANCHOR}T12:00:00Z`)) / DAY_MS);

function streamFor(want: DuelTier, trainers: readonly DuelTrainer[]): Stream {
  const { tier, list } = tierRoster(want, trainers);
  const people = peopleOf(list);
  return {
    tier, borrowed: tier !== want, keys: people.map((p) => p.person), teams: new Map(people.map((p) => [p.person, p.teams])),
    cycles: 0, queue: [], last: null,
  };
}

/** Walks the calendar from the anchor through day offset `upto` (see trainerFor for the rules). */
function walk(trainers: readonly DuelTrainer[], upto: number): Plan {
  const sig = trainers.map((t) => `${t.id}:${t.tier}:${personOf(t)}`).join(",");
  let plan = PLANS.get(trainers);
  if (!plan || plan.sig !== sig) {
    plan = { sig, picks: [], streams: new Map() };
    PLANS.set(trainers, plan);
  }
  for (let i = plan.picks.length; i <= upto; i++) {
    const want = tierFor(gsAddDays(ANCHOR, i));
    let st = plan.streams.get(want);
    if (!st) plan.streams.set(want, (st = streamFor(want, trainers)));
    const n = st.keys.length;
    if (!n) { plan.picks.push(null); continue; }
    // Enough visits queued to look past everyone the guard can hold back at once.
    while (st.queue.length < n + PERSON_GAP_DAYS + 1) {
      for (const person of shuffleWith(st.keys, duelRand(`duel-people:${st.tier}:${st.cycles}`))) st.queue.push({ person, visit: st.cycles });
      st.cycles++;
    }
    const held = new Set<string>();
    if (st.last) held.add(st.last);
    if (!st.borrowed) {
      for (let j = Math.max(0, i - PERSON_GAP_DAYS + 1); j < i; j++) {
        const p = plan.picks[j];
        if (p && !p.borrowed) held.add(p.person);
      }
    }
    let at = st.queue.findIndex((q) => !held.has(q.person));
    if (at < 0) at = st.queue.findIndex((q) => q.person !== st.last); // a tier too small for the guard
    if (at < 0) at = 0;
    const [take] = st.queue.splice(at, 1);
    st.last = take.person;
    plan.picks.push({ person: take.person, visit: take.visit, borrowed: st.borrowed });
  }
  return plan;
}

/**
 * The trainer for a day: a pure function of the day and the roster, worked out by walking the
 * calendar from the anchor (a few hundred days, each a handful of steps; walks are kept per roster,
 * so building a run of days walks once).
 *
 * Each weekday tier (gym, elite, rival, boss, champion) is a stream through the people of its tier
 * (or the nearest tier with trainers): a queue of visits, cycle by cycle, each cycle a seeded shuffle
 * of the tier's people (`duel-people:<tier>:<cycle>`). Every day takes the first visit in its
 * stream's queue whose person isn't held back, and a person is held back when they had the tier's
 * previous day, or any day in the last PERSON_GAP_DAYS - 1 days in any tier (the week guard).
 *
 * - No repeats inside a cycle and nobody skipped: a cycle holds each person's c-th visit once, and a
 *   held-back visit stays at the front of the queue, taken the first day its person is free (a hold
 *   lasts six days at most, and at most seven people are held at once, so a tier with eight or more
 *   people always has someone free). Near the end of a cycle a held-back person can come a day or
 *   two after the next cycle's first visits; their own visit number doesn't change.
 * - Teams: a person brings team c % teams on their c-th visit in a tier, in roster order (add a
 *   person's later teams after their earlier ones), so a second team shows on their next visit.
 * - The same person in two tiers (Giovanni in gym and boss) is one person to the guard, so the two
 *   never fall inside a week; each tier still walks its own cycles.
 * - With nobody held back this is the plain rotation from before the guard (the old cycle-start
 *   swap is the "previous day" hold), so trainers only move where the guard steps in.
 * - A stream borrowing another tier's people (a tier with no trainers yet) keeps only the
 *   "not twice in a row" rule; its days don't hold anyone back elsewhere.
 *
 * Built days keep their own copy of the trainer, so only unbuilt days move when the roster grows.
 */
export function trainerFor(day: string, trainers: readonly DuelTrainer[]): DuelTrainer | null {
  const i = offsetOf(day);
  if (i < 0) {
    const st = streamFor(tierFor(day), trainers);
    if (!st.keys.length) return null;
    return st.teams.get(shuffleWith(st.keys, duelRand(`duel-people:${st.tier}:0`))[0])![0];
  }
  const plan = walk(trainers, i);
  const pick = plan.picks[i];
  if (!pick) return null;
  const teams = plan.streams.get(tierFor(day))!.teams.get(pick.person)!;
  return teams[pick.visit % teams.length];
}

/**
 * The people the rotation puts on the days around `day` (closer than PERSON_GAP_DAYS, before or
 * after), so a stand-in for the day keeps the week guard (solver.ts buildDay).
 */
export function peopleNear(day: string, trainers: readonly DuelTrainer[]): Set<string> {
  const out = new Set<string>();
  for (let k = 1; k < PERSON_GAP_DAYS; k++) {
    for (const d of [gsAddDays(day, -k), gsAddDays(day, k)]) {
      const t = trainerFor(d, trainers);
      if (t) out.add(personOf(t));
    }
  }
  return out;
}

// ─── the Energy row and the events ───────────────────────────────────────────

const PLAIN: EnergyType[] = ["Grass", "Fire", "Water", "Lightning", "Psychic", "Fighting", "Darkness", "Metal"];

/**
 * The day's Energy row from the pack: the colored types the pack's moves ask for, each weighted by
 * how many of the six need it, dealt in shuffled rounds so no type goes missing for long.
 */
export function energyRow(pack: readonly DuelCard[], rand: () => number, length = TURN_CAP): EnergyType[] {
  const weight = new Map<EnergyType, number>();
  for (const c of pack) {
    const need = new Set<EnergyType>();
    for (const m of c.moves) for (const t of m.cost) if (t !== "Colorless") need.add(t);
    for (const t of need) weight.set(t, (weight.get(t) ?? 0) + 1);
  }
  // Only Colorless costs: the cards' own plain types will pay them.
  if (!weight.size) for (const c of pack) if (PLAIN.includes(c.t)) weight.set(c.t, (weight.get(c.t) ?? 0) + 1);
  if (!weight.size) weight.set("Colorless", 1);
  const bag: EnergyType[] = [];
  for (const t of [...weight.keys()].sort()) for (let i = 0; i < weight.get(t)!; i++) bag.push(t);
  const row: EnergyType[] = [];
  while (row.length < length) row.push(...shuffleWith(bag, rand));
  return row.slice(0, length);
}

const EVENT_DECK: DuelEventKind[] = ["rain", "sun", "sand", "rocket", "joy", "wild", "sleep", "confused", "ace", "crit", "advice", "potion", "revive"];

/**
 * The day's events: the first on turn 2 or 3, then one every 2 to 4 turns (about every third, so
 * about 4 in a duel). Drawn from a shuffled deck so nothing repeats until every kind has had a turn;
 * the trainer's signature is the 2nd or 3rd event, and Revive never comes before the 3rd (there'd
 * be nothing to bring back).
 */
export function eventPlan(rand: () => number, cap = TURN_CAP): DuelEventAt[] {
  const turns: number[] = [];
  for (let t = 2 + Math.floor(rand() * 2); t <= cap; t += 2 + Math.floor(rand() * 3)) turns.push(t);
  const kinds: DuelEventKind[] = [];
  let first = true;
  while (kinds.length < turns.length) {
    const deck = shuffleWith(EVENT_DECK, rand);
    if (first) {
      const r = deck.indexOf("revive");
      if (r < 2) { deck.splice(r, 1); deck.splice(2 + Math.floor(rand() * (deck.length - 1)), 0, "revive"); }
      deck.splice(1 + Math.floor(rand() * 2), 0, "signature");
      first = false;
    } else if (deck[0] === kinds[kinds.length - 1]) {
      [deck[0], deck[1]] = [deck[1], deck[0]];
    }
    kinds.push(...deck);
  }
  return turns.map((turn, i) => ({ turn, kind: kinds[i] }));
}

// ─── a card's species (six different ones in a pack) ─────────────────────────

/** "Cynthia's Garchomp ex" → "Garchomp"; "Mega Lucario ex" → "Lucario". */
export function speciesOf(card: Pick<DuelCard, "name" | "short" | "species">): string {
  if (card.species) return card.species.toLowerCase();
  let s = (card.short || card.name).replace(/^.*?['’]s\s+/, "");
  s = s.replace(/^(Mega|Dark|Light|Shining|Radiant|Alolan|Galarian|Hisuian|Paldean)\s+/i, "");
  s = s.replace(/\s+(ex|EX|GX|V|VMAX|VSTAR|V-UNION|LV\.?\s*X|BREAK|Prime|δ|Star|☆)$/i, "");
  return s.trim().toLowerCase();
}

// ─── points and sharing ──────────────────────────────────────────────────────

/** Board points from turns against par: par or better 10, par+1 8, par+2 6, par+3 4, slower 2, a loss 0. */
export function duelPoints(won: boolean, turns: number, par: number): number {
  if (!won) return 0;
  const over = turns - par;
  if (over <= 0) return 10;
  if (over === 1) return 8;
  if (over === 2) return 6;
  if (over === 3) return 4;
  return 2;
}

/** "3:12", "12:05", "2h 14m". */
export function duelTime(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s >= 3600) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Your six as squares: 🟩 still standing, 🟥 knocked out. */
export const duelSquares = (standing: readonly boolean[]) => standing.map((up) => (up ? "🟩" : "🟥")).join("");

export interface DuelShareFacts {
  number: number;
  trainer: string;
  won: boolean;
  turns: number;
  par: number | null;
  seconds: number | null;
  /** Your six in pack order: true while standing. */
  standing: boolean[];
  /** The trainer's cards you knocked out, and how many it had. */
  knocked: number;
  team: number;
  /** A practice duel (after the day's official one). */
  practice?: boolean;
}

/** "Won in 14 turns (par 13)", "Knocked out 4 of 6". */
export function duelHeadline(f: Pick<DuelShareFacts, "won" | "turns" | "par" | "knocked" | "team">): string {
  if (f.won) return `Won in ${f.turns} ${f.turns === 1 ? "turn" : "turns"}${f.par ? ` (par ${f.par})` : ""}`;
  return `Knocked out ${f.knocked} of ${f.team}`;
}

/** The text a result shares: the duel, the trainer, the result and time, your squares, the link. Never a card's name. */
export function duelShareText(f: DuelShareFacts, url = "https://www.gameshuffle.co/daily-duel"): string {
  const title = `Daily Duel${f.number >= 1 ? ` #${f.number}` : ""} · vs ${f.trainer}${f.practice ? " (practice)" : ""}`;
  const time = f.seconds != null ? ` ⏱ ${duelTime(f.seconds)}` : "";
  return [title, `${f.won ? "🏆" : "❌"} ${duelHeadline(f)}${time}`, duelSquares(f.standing), url].join("\n");
}

export { eventCopy, signatureText } from "./copy";
