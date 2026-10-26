/**
 * The Daily Duel's look (client-safe, no React): type colors, the events' icons and gradients,
 * and the small sums the arena draws from (which cost dots are covered, HP bar color). The arena
 * is one visual world in any theme (a dark game screen), so these colors are fixed, not theme
 * tokens. Matches the picks page's playable mockup (https://claude.ai/artifact/5fdauqQ8MPof41oWXYcuPk).
 */

import type { Icon } from "@tabler/icons-react";
import {
  IconBolt, IconBulb, IconCloudRain, IconCrown, IconDroplet, IconEye, IconFirstAidKit, IconFlame, IconFlask, IconHandStop, IconHeartPlus, IconLeaf, IconLock, IconMoodAngry,
  IconMoon, IconPaw, IconRocket, IconShield, IconSkull, IconSpiral, IconStar, IconSun, IconTemperature, IconWind, IconZzz,
} from "@tabler/icons-react";
import type { DuelCardView, DuelEventView, DuelLogLine } from "@/lib/originals/duel/view";
import type { DuelCondition, DuelEventKind, EnergyType } from "@/lib/originals/duel/types";
import { CONDITION_RULES as R } from "@/lib/originals/duel/engine";

/** A type chip's background (white text on it, 4.5:1 or better). */
export const TYPE_CHIP: Record<EnergyType, string> = {
  Grass: "#23763a",
  Fire: "#b8381a",
  Water: "#1f5fbf",
  Lightning: "#7f6400",
  Psychic: "#7a33b3",
  Fighting: "#8c4519",
  Darkness: "#3b3f52",
  Metal: "#56616d",
  Dragon: "#6e5a12",
  Colorless: "#62626e",
};

/** An Energy dot on the dark arena (bright enough to read on navy). */
export const TYPE_DOT: Record<EnergyType, string> = {
  Grass: "#4cc76a",
  Fire: "#ff6a3d",
  Water: "#4a9bff",
  Lightning: "#f5d020",
  Psychic: "#c084fc",
  Fighting: "#e08a4a",
  Darkness: "#8a90b0",
  Metal: "#b8c2cc",
  Dragon: "#d4ad2c",
  Colorless: "#ececf2",
};

/**
 * Each type's icon inside its Energy dot, so color is never the only clue: the same set the site's
 * Pokémon TypeCard uses (Lightning is TypeCard's Electric, Darkness its Dark, Metal its Steel).
 */
export const TYPE_ICON: Record<EnergyType, Icon> = {
  Grass: IconLeaf,
  Fire: IconFlame,
  Water: IconDroplet,
  Lightning: IconBolt,
  Psychic: IconEye,
  Fighting: IconHandStop,
  Darkness: IconMoon,
  Metal: IconShield,
  Dragon: IconCrown,
  Colorless: IconStar,
};

/**
 * The conditions' look: a square tag with the condition's icon on its color (the TCG Companion's
 * icon language: circles are types, squares are conditions), the word for screen readers and
 * tooltips, and what it does in the Duel (the card window's key and the FAQ).
 */
export const CONDITION_LOOK: Record<DuelCondition, { word: string; icon: Icon; color: string; ink: string; what: string }> = {
  burned: { word: "Burned", icon: IconTemperature, color: "#dc2626", ink: "#ffffff", what: `Loses ${R.burn} HP at the end of every turn.` },
  poisoned: { word: "Poisoned", icon: IconSkull, color: "#9333ea", ink: "#ffffff", what: `Loses ${R.poison} HP at the end of its first turn, then ${R.poison * 2}, then ${R.poison * 3}, and so on.` },
  paralyzed: { word: "Paralyzed", icon: IconLock, color: "#facc15", ink: "#3b2a00", what: `Each turn, a ${R.paralyzed}% chance it can't move.` },
  asleep: { word: "Asleep", icon: IconZzz, color: "#64748b", ink: "#ffffff", what: `Can't move. Wakes after ${R.sleepMin} to ${R.sleepMax} turns.` },
  confused: { word: "Confused", icon: IconSpiral, color: "#ec4899", ink: "#ffffff", what: `For ${R.confusedTurns} turns, each move has a ${R.confusedSelf}% chance to hit itself for ${R.confusedHit} instead.` },
};

/** The conditions in a fixed order, for keys. */
export const CONDITION_ORDER: DuelCondition[] = ["burned", "poisoned", "paralyzed", "asleep", "confused"];

export interface EventLook { icon: Icon; bg: string }

/** Each event's icon tile (the mockup's set). */
export const EVENT_LOOK: Record<DuelEventKind, EventLook> = {
  rain: { icon: IconCloudRain, bg: "linear-gradient(135deg, #1f5fbf, #3fa0ff)" },
  sun: { icon: IconSun, bg: "linear-gradient(135deg, #c2410c, #f59e0b)" },
  sand: { icon: IconWind, bg: "linear-gradient(135deg, #8a6a2f, #d4a95a)" },
  rocket: { icon: IconRocket, bg: "linear-gradient(135deg, #7f1d1d, #dc2626)" },
  joy: { icon: IconFirstAidKit, bg: "linear-gradient(135deg, #be185d, #f472b6)" },
  wild: { icon: IconPaw, bg: "linear-gradient(135deg, #166534, #22c55e)" },
  sleep: { icon: IconZzz, bg: "linear-gradient(135deg, #312e81, #6366f1)" },
  confused: { icon: IconSpiral, bg: "linear-gradient(135deg, #6b21a8, #c084fc)" },
  ace: { icon: IconMoodAngry, bg: "linear-gradient(135deg, #9a3412, #fb923c)" },
  crit: { icon: IconBolt, bg: "linear-gradient(135deg, #a16207, #facc15)" },
  advice: { icon: IconBulb, bg: "linear-gradient(135deg, #0f766e, #2dd4bf)" },
  potion: { icon: IconFlask, bg: "linear-gradient(135deg, #0369a1, #38bdf8)" },
  revive: { icon: IconHeartPlus, bg: "linear-gradient(135deg, #9f1239, #fb7185)" },
  signature: { icon: IconCrown, bg: "linear-gradient(135deg, #78350f, #f5c84c)" },
};

/** The HP bar's color step: over half, a quarter to half, under a quarter. */
export const hpTone = (cur: number, hp: number) => (cur / hp > 0.5 ? "high" : cur / hp > 0.25 ? "mid" : "low");

/**
 * Which of a move's cost dots the Energy covers, in the cost's order: colored dots take their own
 * type first, then Colorless dots take whatever is left (the engine's `pays`, dot by dot).
 */
export function coveredDots(energy: readonly EnergyType[], cost: readonly EnergyType[]): boolean[] {
  const left = new Map<EnergyType, number>();
  for (const e of energy) left.set(e, (left.get(e) ?? 0) + 1);
  const out = cost.map((t) => {
    if (t === "Colorless") return false;
    const n = left.get(t) ?? 0;
    if (n > 0) { left.set(t, n - 1); return true; }
    return false;
  });
  let spare = 0;
  for (const n of left.values()) spare += n;
  return out.map((on, i) => {
    if (cost[i] !== "Colorless") return on;
    if (spare > 0) { spare--; return true; }
    return false;
  });
}

/** "Grass, Grass and Colorless" for a cost or an Energy list. */
export function energyWords(list: readonly EnergyType[]): string {
  if (!list.length) return "nothing";
  if (list.length === 1) return list[0];
  return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}

/** "Bellossom" for tight spots, the full name in words. */
export const cardLabel = (c: { short: string; name: string }) => c.short || c.name;

/** Running time as "1:23" (from milliseconds). */
export function clockText(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s >= 3600) return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Reduced motion asked for (no summon, hit or knockout pauses). */
export const reducedMotion = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// ─── the scoreline: what just happened, in rows ──────────────────────────────

/** A row of the scoreline. `at` is the log line it comes from (rows appear with their beat). */
export type ScoreRow =
  | { key: string; at: number; kind: "move"; side: "you" | "foe"; move: string; damage: number; weak: boolean; ko: boolean }
  | { key: string; at: number; kind: "skip"; side: "you" | "foe"; why: "asleep" | "stubborn" | "paralyzed" }
  | { key: string; at: number; kind: "swap"; side: "you"; card: string }
  | { key: string; at: number; kind: "sand"; hits: { side: "you" | "foe"; card: string; damage: number }[] }
  /** A condition landed on a card (side = whose card). */
  | { key: string; at: number; kind: "cond"; side: "you" | "foe"; card: string; cond: DuelCondition }
  /** Burned or Poisoned took its HP at the end of the turn. */
  | { key: string; at: number; kind: "tick"; side: "you" | "foe"; card: string; cond: DuelCondition; damage: number; ko: boolean }
  /** Confused: the card hit itself. */
  | { key: string; at: number; kind: "self"; side: "you" | "foe"; card: string; damage: number; ko: boolean }
  | { key: string; at: number; kind: "wake"; side: "you" | "foe"; card: string }
  /** A tool you used this turn (tools picks 2026-10-25): its name and the card it went on. */
  | { key: string; at: number; kind: "tool"; side: "you"; tool: string; card: string }
  /** An Energy played (side = whose), or a card coming back in with Energy after a knockout (`back`). */
  | { key: string; at: number; kind: "energy"; side: "you" | "foe"; card: string; type: EnergyType | null; back: number };

/**
 * A line written by the turn's event (a heal, Team Rocket's grab, a revive). Lines stored before
 * the `ev` field existed fall back to their kind: only events write heal, revive and event lines.
 */
export const isEventLine = (l: DuelLogLine) => l.ev != null || l.kind === "heal" || l.kind === "revive" || l.kind === "event";

const MOVE_NAME = /used (.+?): \d+/;
type Named = Pick<DuelCardView, "short" | "name">;
const nameOf = (cards: readonly Named[], i: number | undefined) => (i != null && cards[i] ? cardLabel(cards[i]) : "");

/**
 * The turn's log as scoreline rows: one per move (×2 on a Weakness, KO when it knocked the card
 * out), a skipped move, a swap, the sandstorm's hits. Lines the board already shows are left out
 * (Energy going on, waiting, a card coming out), and so are the event's own lines (the banner says
 * what it did). Old stored lines without the structured fields read from their text.
 */
export function scoreRows(log: readonly DuelLogLine[], you: readonly Named[], foe: readonly Named[]): ScoreRow[] {
  const rows: ScoreRow[] = [];
  let sand: Extract<ScoreRow, { kind: "sand" }> | null = null;
  log.forEach((l, i) => {
    if (isEventLine(l)) return;
    if (l.kind === "move" && l.side) {
      rows.push({ key: `m${i}`, at: i, kind: "move", side: l.side, move: l.move ?? l.text.match(MOVE_NAME)?.[1] ?? "", damage: l.damage ?? 0, weak: !!l.weak, ko: false });
    } else if (l.kind === "ko") {
      const last = rows[rows.length - 1];
      if (last && last.kind === "move" && last.side !== l.side) last.ko = true;
      else if (last && (last.kind === "tick" || last.kind === "self") && last.side === l.side) last.ko = true;
    } else if (l.kind === "skip" && l.side) {
      rows.push({ key: `s${i}`, at: i, kind: "skip", side: l.side, why: l.why ?? (/asleep/i.test(l.text) ? "asleep" : "stubborn") });
    } else if (l.kind === "cond" && l.side && l.cond) {
      rows.push({ key: `c${i}`, at: i, kind: "cond", side: l.side, card: nameOf(l.side === "you" ? you : foe, l.card), cond: l.cond });
    } else if (l.kind === "tick" && l.side && l.cond) {
      rows.push({ key: `t${i}`, at: i, kind: "tick", side: l.side, card: nameOf(l.side === "you" ? you : foe, l.card), cond: l.cond, damage: l.damage ?? 0, ko: false });
    } else if (l.kind === "self" && l.side) {
      rows.push({ key: `x${i}`, at: i, kind: "self", side: l.side, card: nameOf(l.side === "you" ? you : foe, l.card), damage: l.damage ?? 0, ko: false });
    } else if (l.kind === "tool" && l.tool) {
      rows.push({ key: `u${i}`, at: i, kind: "tool", side: "you", tool: l.text.match(/^You use (.+?):/)?.[1] ?? "", card: l.tool === "look" ? "" : nameOf(you, l.card) });
    } else if (l.kind === "wake" && l.side) {
      rows.push({ key: `k${i}`, at: i, kind: "wake", side: l.side, card: nameOf(l.side === "you" ? you : foe, l.card) });
    } else if (l.kind === "energy" && l.side) {
      const back = l.text.match(/comes in with (an|\d+) Energy for coming back/);
      const type = l.type ?? ((l.text.match(/^(\w+) Energy goes on|plays (\w+) Energy on |gets (\w+) Energy\.$/)?.slice(1).find(Boolean) as EnergyType | undefined) ?? null);
      rows.push({ key: `e${i}`, at: i, kind: "energy", side: l.side, card: nameOf(l.side === "you" ? you : foe, l.card), type: back ? null : type, back: back ? (back[1] === "an" ? 1 : Number(back[1])) : 0 });
    } else if (l.kind === "swap" && l.side === "you") {
      rows.push({ key: `w${i}`, at: i, kind: "swap", side: "you", card: nameOf(you, l.card) });
    } else if (l.kind === "sand" && l.side) {
      if (!sand) { sand = { key: `d${i}`, at: i, kind: "sand", hits: [] }; rows.push(sand); }
      sand.hits.push({ side: l.side, card: nameOf(l.side === "you" ? you : foe, l.card), damage: l.damage ?? 10 });
    }
  });
  return rows;
}

/** The lines the turn's event wrote (for the banner and the turn log). */
export function eventLines(log: readonly DuelLogLine[]): DuelLogLine[] {
  const tagged = log.some((l) => l.ev != null);
  return log.filter((l) => (tagged ? l.ev != null : isEventLine(l)));
}

/**
 * When the turn's event did nothing, what to say instead of its short line ("Hippowdon is already
 * at full HP"); null when it did what it says.
 */
export function eventOutcome(event: DuelEventView, log: readonly DuelLogLine[], you: readonly Named[], foe: readonly Named[]): string | null {
  const lines = eventLines(log);
  if (!lines.length) return null;
  if (event.kind === "joy" || event.kind === "potion" || event.kind === "signature") {
    const h = lines.find((l) => l.kind === "heal");
    if (!h || !h.side) return null;
    const healed = h.amount ?? Number(h.text.match(/heals (\d+)/)?.[1] ?? 1);
    return healed === 0 ? `${nameOf(h.side === "you" ? you : foe, h.card)} is already at full HP` : null;
  }
  if (event.kind === "rocket") return lines.some((l) => l.side === "you") ? null : "Nothing to grab";
  if (event.kind === "revive") return lines.some((l) => l.kind === "revive") ? null : "Nothing to revive yet";
  return null;
}

/** A log line as the turn log and screen readers say it ("heals 0" reads as already at full HP). */
export const lineText = (l: DuelLogLine) => (l.kind === "heal" && / heals 0\.$/.test(l.text) ? l.text.replace(/ heals 0\.$/, " is already at full HP.") : l.text);

/** The weather's chip word and icon. */
export const WEATHER_CHIP: Record<"rain" | "sun" | "sand", { word: string; icon: Icon; line: string }> = {
  rain: { word: "Rain", icon: IconCloudRain, line: "Water moves +30, Fire moves −30" },
  sun: { word: "Sun", icon: IconSun, line: "Fire moves +30, Water moves −30" },
  sand: { word: "Sandstorm", icon: IconWind, line: "Cards on the field that aren't Fighting or Metal take 10 a turn" },
};

/** Every dot of a cost covered by this Energy (the engine's pays, for the page). */
export const covers = (energy: readonly EnergyType[], cost: readonly EnergyType[]) => coveredDots(energy, cost).every(Boolean);

/**
 * Rules 5: which Energy in the hand to start on for a card (the player can pick another): the one that
 * covers its hardest-hitting move now, else the one that covers the most of its strongest move's dots,
 * else the first.
 */
export function handPick(card: Pick<DuelCardView, "energy" | "moves">, hand: readonly EnergyType[]): number {
  let best = -1;
  let bestD = 0;
  hand.forEach((h, i) => {
    for (const m of card.moves) {
      const d = m.damage ?? m.d;
      if (d > bestD && covers([...card.energy, h], m.cost)) { best = i; bestD = d; }
    }
  });
  if (best >= 0) return best;
  const top = [...card.moves].sort((a, b) => (b.damage ?? b.d) - (a.damage ?? a.d))[0];
  if (!top) return 0;
  const count = (e: readonly EnergyType[]) => coveredDots(e, top.cost).filter(Boolean).length;
  const now = count(card.energy);
  const gain = hand.map((h) => count([...card.energy, h]) - now);
  const i = gain.indexOf(Math.max(...gain));
  return gain[i] > 0 ? i : 0;
}
