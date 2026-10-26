/**
 * The road's tools (picks 2026-10-25, https://claude.ai/artifact/2Jvhc2QgmCGMZSTcLMME1o, all as
 * recommended; earlier picks XEm1jgeV2MHYnynmiLymk5). Pure and client-safe: what each tool is called,
 * what it does, the Item card its picture comes from, its Mart price, and when the road gives one.
 *
 *   - Used during your turn, before your action, like an Item card: you still play your Energy and act.
 *   - One a duel on Trainer Road or the Daily Duel (Easy and Normal), never in Hard (`TOOL_CAP`).
 *   - Patch Up heals 50 and Power Up adds 30.
 *   - Earned: a tool with each badge (the one that badge opens on the Mart shelf), two with the League,
 *     three with a region plus one kept for good (ready once a day), one for a first three-star win on a
 *     team, one for beating a villain team. Bought with tokens at the Mart (prices are levers).
 *   - At most `BAG_MAX` of each in the bag; an earned tool past that is paid as tokens (its price).
 */

import type { EnergyType, ToolId } from "./types";

export const TOOL_IDS: readonly ToolId[] = ["patch", "cure", "switch", "power", "spare", "look", "wind"];

export const isToolId = (x: unknown): x is ToolId => typeof x === "string" && (TOOL_IDS as readonly string[]).includes(x);

/** How a tool is used: on one of your standing cards, on your card on the field, on a knocked-out card, or on nothing. */
export type ToolAim = "card" | "field" | "out" | "none";

export interface ToolDef {
  id: ToolId;
  name: string;
  /** What it does, in one line for the bag and the Mart ("Heals 50 HP on one of your cards."). */
  line: string;
  /** The Item card the name and the action fit (Britton's rule): its picture is the tool's art (`art`, a TOOL_ART id). */
  card: string;
  art: string;
  aim: ToolAim;
  /** The Mart price in tokens (the `road_tool_price_<id>` lever's fallback). */
  price: number;
}

export const TOOLS: Record<ToolId, ToolDef> = {
  patch: { id: "patch", name: "Patch Up", line: "Heals 50 HP on one of your cards.", card: "Potion", art: "sv1-188", aim: "card", price: 60 },
  cure: { id: "cure", name: "Cure All", line: "Cures your card on the field of every condition.", card: "Full Heal", art: "base1-82", aim: "field", price: 80 },
  switch: { id: "switch", name: "Quick Switch", line: "Swaps in a waiting card, and it still gets this turn's move.", card: "Switch", art: "sv1-194", aim: "card", price: 120 },
  power: { id: "power", name: "Power Up", line: "Your attack this turn does 30 more.", card: "Premium Power Pro", art: "me1-124", aim: "field", price: 120 },
  spare: { id: "spare", name: "Spare Energy", line: "Play a second Energy this turn.", card: "Energy Retrieval", art: "sv1-171", aim: "card", price: 150 },
  look: { id: "look", name: "Look Ahead", line: "See the next six Energy and the next two events for three turns.", card: "Pokédex", art: "base1-87", aim: "none", price: 60 },
  wind: { id: "wind", name: "Second Wind", line: "Brings back a knocked-out card with half its HP.", card: "Night Stretcher", art: "sv6pt5-61", aim: "out", price: 250 },
};

/** Tools a duel allows: one on Trainer Road or the Daily Duel, none in Hard. */
export const TOOL_CAP = { duel: 1, hard: 0 } as const;

/** At most this many of each tool in the bag (the `road_bag_max` lever's fallback). */
export const BAG_MAX = 5;

/** Patch Up heals 50, Power Up adds 30. */
export const PATCH_FLAT = 50;
export const POWER_FLAT = 30;
/** Look Ahead lasts this turn and the next two. */
export const LOOK_TURNS = 3;

/** What Patch Up heals. */
export const patchAmount = (): number => PATCH_FLAT;

/** What Power Up adds to an attack. */
export const powerAmount = (): number => POWER_FLAT;

/**
 * Prize money: the first win against each trainer each month pays tokens by kind (levers
 * `road_prize_<tier>`). Rivals and bosses pay like the Gym or Champion battle they stand in for.
 */
export const PRIZE_BY_TIER: Record<string, number> = { grunt: 15, gym: 20, rival: 20, admin: 30, elite: 30, boss: 30, champion: 50 };

/**
 * The tool each Kanto badge gives, which is also the tool that badge opens on the Mart shelf
 * (Patch Up and Look Ahead are there from the start): Brock, Misty, Lt. Surge, Erika, then Koga's
 * opens the last. Later badges, the League and a region give from `REWARD_ROTATION`.
 */
export const BADGE_TOOLS: Record<string, readonly ToolId[]> = {
  kanto: ["cure", "switch", "power", "spare", "wind"],
};

/** The tools the League, a region and other rewards give, in turn (seeded by the reward's key). */
export const REWARD_ROTATION: readonly ToolId[] = ["patch", "power", "cure", "switch", "spare", "look", "wind"];

/** What's on the Mart shelf from the start, before any badge. */
export const SHELF_START: readonly ToolId[] = ["patch", "look"];

/**
 * The Mart's shelf in a region: the start, then each badge's tool as it's earned; everything once the
 * region is cleared (`cleared`), and in every region after Kanto (the shelves open with Kanto's badges).
 */
export function shelfFor(region: string, badges: number, cleared: boolean): ToolId[] {
  const order = BADGE_TOOLS[region];
  if (!order || cleared) return TOOL_IDS.slice();
  const open = new Set<ToolId>(SHELF_START);
  order.slice(0, badges).forEach((t) => open.add(t));
  return TOOL_IDS.filter((t) => open.has(t));
}

/** A tool picked for a reward by its key (the same reward always gives the same tool). */
export function rewardTool(key: string, k = 0): ToolId {
  let h = 2166136261;
  const seed = `${key}:${k}`;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return REWARD_ROTATION[(h >>> 0) % REWARD_ROTATION.length];
}

/** The tool a badge gives: its own for the first five in Kanto, else one from the rotation. */
export const badgeTools = (region: string, index: number): ToolId[] => {
  const own = BADGE_TOOLS[region]?.[index];
  return [own ?? rewardTool(`badge:${region}:${index}`)];
};

/** The League gives two, a region three (plus the one you keep, picked on the trainer card). */
export const leagueTools = (region: string): ToolId[] => [rewardTool(`league:${region}`, 0), rewardTool(`league:${region}`, 1)];
export const regionTools = (region: string): ToolId[] => [0, 1, 2].map((k) => rewardTool(`region:${region}`, k));

/** The Poké Mart clerk in Viridian City gives three of these to start. */
export const VIRIDIAN_GIFT: { tool: ToolId; count: number } = { tool: "patch", count: 3 };

/** Spare Energy's choices: the different types in your hand, or the row's next Energy when there's no hand. */
export const spareTypes = (hand: readonly EnergyType[] | null | undefined, rowNext: EnergyType | null): EnergyType[] =>
  hand ? hand.filter((t, i) => hand.indexOf(t) === i) : rowNext ? [rowNext] : [];
