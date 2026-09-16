/**
 * Tournament randomizer — generates shared "round directives" (the tracks /
 * combo / items everyone runs that round) from a tournament's own build rules,
 * reusing the pure randomizer logic. React-free + server-safe. See
 * specs/gs-tournament-randomizers.md.
 */

import type { GameData, KartCombo, SelectedTrack, Character } from "@/data/types";
import { randomizeKartCombo, randomizeTrackList, getRandomNumber } from "@/lib/randomizer";
import mk8dxData from "@/data/mk8dx-data.json";
import mkworldData from "@/data/mkworld-data.json";

export type RandomizerCadence = "pre_all" | "reveal_live" | "per_race";

export interface RandomizerDimensions {
  tracks?: { count: number; noDups: boolean; tourOnly: boolean };
  combo?: boolean;
  /** With `combo`: roll a different combo for each participant instead of one shared. */
  comboPerPlayer?: boolean;
  items?: { count: number };
}

/** A participant, for per-player combo generation. */
export interface RandomizerPlayer { id: string; name: string }

export interface TournamentRandomizerConfig {
  enabled: boolean;
  dimensions: RandomizerDimensions;
  cadence: RandomizerCadence;
  rounds: number;
}

/** Build rules a directive must honor (derived from tournaments.settings). */
export interface RandomizerRestrictions {
  weights?: string[];
  drift?: string[];
  vehicleTypes?: string[];
  bannedCharacters?: string[];
  allowedCharacters?: string[];
  itemPool?: string[]; // item names to draw from; empty = all items
}

export interface RoundDirective {
  tracks?: SelectedTrack[];
  combo?: KartCombo;
  /** Per-race combos (per_race cadence) — aligned to `tracks`. When set, each
   *  race has its own combo and `combo` is omitted. */
  raceCombos?: KartCombo[];
  /** Per-player combos (comboPerPlayer) — one per participant. */
  playerCombos?: { id: string; name: string; combo: KartCombo }[];
  items?: string[];
}

export interface GeneratedRound {
  n: number;
  revealed: boolean;
  directive: RoundDirective;
  /** How many times this round was re-rolled before reveal (transparency). */
  rerolls?: number;
}

/** Live "Now racing" pointer into the revealed rounds (1-based round + race). */
export interface LivePointer {
  round: number;
  race: number;
}

export const DEFAULT_RANDOMIZER_CONFIG: TournamentRandomizerConfig = {
  enabled: false,
  dimensions: { tracks: { count: 4, noDups: true, tourOnly: false } },
  cadence: "reveal_live",
  rounds: 4,
};

function gameData(slug: string): GameData | null {
  if (slug === "mario-kart-8-deluxe") return mk8dxData as unknown as GameData;
  if (slug === "mario-kart-world") return mkworldData as unknown as GameData;
  return null;
}

/** Drop the "Any" sentinel; an empty list means "no restriction". */
const clean = (arr?: string[]): string[] => (arr ?? []).filter((v) => v && v !== "Any");

/** Apply character ban/allow lists to a game's roster before combo rolls. */
function restrictCharacters(chars: Character[], r: RandomizerRestrictions): Character[] {
  const allow = clean(r.allowedCharacters);
  const ban = new Set(clean(r.bannedCharacters));
  let out = chars;
  if (allow.length) { const a = new Set(allow); out = out.filter((c) => a.has(c.name)); }
  if (ban.size) out = out.filter((c) => !ban.has(c.name));
  return out.length ? out : chars; // never strip everyone
}

/** Read a tournaments.settings blob into randomizer restrictions. */
export function restrictionsFromSettings(settings: Record<string, unknown> | null | undefined): RandomizerRestrictions {
  const s = settings ?? {};
  const arr = (k: string): string[] | undefined => (Array.isArray(s[k]) ? (s[k] as string[]) : undefined);
  const itemPool = s.items === "custom" && Array.isArray(s.customItems) ? (s.customItems as string[]) : undefined;
  return {
    weights: arr("allowedWeights"),
    drift: arr("allowedDrift"),
    vehicleTypes: arr("allowedVehicleTypes"),
    bannedCharacters: arr("bannedCharacters"),
    allowedCharacters: arr("allowedCharacters"),
    itemPool,
  };
}

/** One shared directive for a round (or race), honoring the restrictions.
 *  `perRace` (per_race cadence) rolls a fresh combo for each race. */
export function generateRoundDirective(
  slug: string,
  dimensions: RandomizerDimensions,
  restrictions: RandomizerRestrictions,
  perRace = false,
  players?: RandomizerPlayer[],
): RoundDirective {
  const data = gameData(slug);
  if (!data) return {};
  const directive: RoundDirective = {};

  if (dimensions.tracks && (data.cups?.length ?? 0) > 0) {
    directive.tracks = randomizeTrackList(
      data.cups!,
      Math.max(1, dimensions.tracks.count),
      dimensions.tracks.noDups,
      dimensions.tracks.tourOnly,
    );
  }

  if (dimensions.combo) {
    const scoped: GameData = { ...data, characters: restrictCharacters(data.characters, restrictions) };
    const roll = () => randomizeKartCombo(scoped, clean(restrictions.weights), clean(restrictions.drift), clean(restrictions.vehicleTypes));
    if (dimensions.comboPerPlayer && players && players.length > 0) {
      directive.playerCombos = players.map((p) => ({ id: p.id, name: p.name, combo: roll() }));
    } else if (perRace && directive.tracks && directive.tracks.length > 0) {
      directive.raceCombos = directive.tracks.map(() => roll());
    } else {
      directive.combo = roll();
    }
  }

  if (dimensions.items) {
    const pool = (restrictions.itemPool && restrictions.itemPool.length)
      ? restrictions.itemPool
      : (data.items ?? []).map((i) => i.name);
    const count = Math.min(Math.max(1, dimensions.items.count), pool.length);
    const picked: string[] = [];
    const remaining = [...pool];
    for (let i = 0; i < count && remaining.length; i++) {
      picked.push(remaining.splice(getRandomNumber(remaining.length), 1)[0]);
    }
    directive.items = picked;
  }

  return directive;
}

/** Generate every round's directive up front (pre_all) or seed the list. */
export function generateRounds(
  slug: string,
  config: TournamentRandomizerConfig,
  restrictions: RandomizerRestrictions,
  players?: RandomizerPlayer[],
): GeneratedRound[] {
  const n = Math.max(1, Math.min(config.rounds, 64));
  const perRace = config.cadence === "per_race";
  return Array.from({ length: n }, (_, i) => ({
    n: i + 1,
    revealed: false,
    rerolls: 0,
    directive: generateRoundDirective(slug, config.dimensions, restrictions, perRace, players),
  }));
}

/** Number of races in a round's directive (tracks drive it; else 1). */
export function roundRaceCount(round: GeneratedRound): number {
  return Math.max(1, round.directive.tracks?.length ?? 1);
}

/** The next live pointer after `current`, walking races then revealed rounds.
 *  Returns null when there's nothing further to advance to. */
export function advanceLive(rounds: GeneratedRound[], current: LivePointer | null): LivePointer | null {
  const revealed = rounds.filter((r) => r.revealed).sort((a, b) => a.n - b.n);
  if (revealed.length === 0) return null;
  if (!current) return { round: revealed[0].n, race: 1 };
  const idx = revealed.findIndex((r) => r.n === current.round);
  if (idx === -1) return { round: revealed[0].n, race: 1 };
  const races = roundRaceCount(revealed[idx]);
  if (current.race < races) return { round: current.round, race: current.race + 1 };
  if (idx + 1 < revealed.length) return { round: revealed[idx + 1].n, race: 1 };
  return null; // at the end
}

/** Resolve the current race for display: its round, race index (0-based),
 *  track, and the combo that applies (per-race if present, else round combo). */
export function resolveLive(rounds: GeneratedRound[], live: LivePointer | null): {
  round: GeneratedRound;
  raceIndex: number;
  track: SelectedTrack | null;
  combo: KartCombo | null;
  items: string[] | null;
  totalRaces: number;
} | null {
  if (!live) return null;
  const round = rounds.find((r) => r.n === live.round && r.revealed);
  if (!round) return null;
  const totalRaces = roundRaceCount(round);
  const raceIndex = Math.max(0, Math.min(live.race - 1, totalRaces - 1));
  const track = round.directive.tracks?.[raceIndex] ?? null;
  const combo = round.directive.raceCombos?.[raceIndex] ?? round.directive.combo ?? null;
  return { round, raceIndex, track, combo, items: round.directive.items ?? null, totalRaces };
}
