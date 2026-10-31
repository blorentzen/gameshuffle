/**
 * Trainer Road's path (phase 2, picks 2026-10-23, https://claude.ai/artifact/6Bbdmob4u66QwdHdnxFaoC,
 * all as recommended). Pure and client-safe: each region's path through one game, what a win or a loss
 * does to a player's path, XP and levels, and the trainer card's color. The store is roadProgress.ts.
 *
 * A region: its Gym Leaders in badge order (Alola's four island kahunas), then the League back to back
 * (the Elite Four and the Champion; Galar's Champion Cup), then an end-game opponent. Beating the
 * end-game opponent clears the region and opens the next one, Kanto first and Paldea last. Only a win
 * against the next trainer on your path moves you along; free play stays open to everyone. A League
 * loss sends you back to its first challenge (badges stay).
 */

import { BAG_MAX, PRIZE_BY_TIER, TOOLS, TOOL_CAP, TOOL_IDS } from "./tools";
import type { DuelTier, ToolId } from "./types";

export interface RegionPath {
  region: string;
  /** The game the path follows ("FireRed and LeafGreen"). */
  game: string;
  /** Gym Leaders in badge order (team ids). */
  gyms: string[];
  /** The League's challenges in battle order, the Champion last (team ids). */
  league: string[];
  /** "Kanto League", Galar's "Champion Cup". */
  leagueLabel: string;
  /** The end-game opponent whose win clears the region (team id). */
  endgame: string;
}

/** Every team checked in the roster (source lines in trainers.ts); test-road-path.ts checks they exist. */
export const ROAD_PATHS: readonly RegionPath[] = [
  {
    region: "kanto", game: "FireRed and LeafGreen", leagueLabel: "Kanto League", endgame: "red-letsgo",
    gyms: ["brock-firered", "misty-firered", "lt-surge-firered", "erika-firered", "koga-firered", "sabrina-firered", "blaine-firered", "giovanni-firered"],
    league: ["lorelei-firered", "bruno-firered", "agatha-firered", "lance-firered", "blue-firered"],
  },
  {
    region: "johto", game: "HeartGold and SoulSilver", leagueLabel: "Johto League", endgame: "red-heartgold",
    gyms: ["falkner-heartgold", "bugsy-heartgold", "whitney-heartgold", "morty-heartgold", "chuck-heartgold", "jasmine-heartgold", "pryce-heartgold", "clair-heartgold"],
    league: ["will-heartgold", "koga-heartgold", "bruno-heartgold", "karen-heartgold", "lance-heartgold"],
  },
  {
    region: "hoenn", game: "Emerald", leagueLabel: "Hoenn League", endgame: "steven-omegaruby-rematch",
    gyms: ["roxanne-emerald", "brawly-emerald", "wattson-emerald", "flannery-emerald", "norman-emerald", "winona-emerald", "tate-liza-emerald", "juan-emerald"],
    league: ["sidney-emerald", "phoebe-emerald", "glacia-emerald", "drake-emerald", "wallace-emerald"],
  },
  {
    region: "sinnoh", game: "Platinum", leagueLabel: "Sinnoh League", endgame: "volo-arceus",
    // Platinum's badge order (Fantina third; Diamond and Pearl put her fifth): Walkthrough:Pokémon_Platinum Parts 6, 8 and 10 (checked 2026-10-24).
    gyms: ["roark-platinum", "gardenia-platinum", "fantina-platinum", "maylene-platinum", "crasher-wake-platinum", "byron-platinum", "candice-platinum", "volkner-platinum"],
    league: ["aaron-platinum", "bertha-platinum", "flint-platinum", "lucian-platinum", "cynthia-platinum"],
  },
  {
    region: "unova", game: "Black", leagueLabel: "Unova League", endgame: "n-black2",
    gyms: ["cilan-black", "lenora-black", "burgh-black", "elesa-black", "clay-black", "skyla-black", "brycen-black", "drayden-black"],
    league: ["shauntal-black", "grimsley-black", "caitlin-black", "marshal-black", "alder-black"],
  },
  {
    region: "kalos", game: "X and Y", leagueLabel: "Kalos League", endgame: "lysandre-ultrasun",
    gyms: ["viola-x", "grant-x", "korrina-x", "ramos-x", "clemont-x", "valerie-x", "olympia-x", "wulfric-x"],
    league: ["malva-x", "siebold-x", "wikstrom-x", "drasna-x", "diantha-x"],
  },
  {
    region: "alola", game: "Sun and Moon", leagueLabel: "Alola League", endgame: "gladion-ultrasun",
    gyms: ["hala-sun", "olivia-sun", "nanu-sun", "hapu-sun"],
    league: ["hala-sun-elite", "olivia-sun-elite", "acerola-sun", "kahili-sun", "kukui-sun"],
  },
  {
    region: "galar", game: "Sword", leagueLabel: "Champion Cup", endgame: "hop-sword-postgame",
    gyms: ["milo-sword", "nessa-sword", "kabu-sword", "bea-sword", "opal-sword", "gordie-sword", "piers-sword", "raihan-sword"],
    league: ["marnie-sword", "hop-sword", "leon-sword"],
  },
  {
    region: "paldea", game: "Scarlet and Violet", leagueLabel: "Paldea League", endgame: "kieran-indigo",
    gyms: ["katy-scarlet", "brassius-scarlet", "iono-scarlet", "kofu-scarlet", "larry-scarlet", "ryme-scarlet", "tulip-scarlet", "grusha-scarlet"],
    league: ["rika-scarlet", "poppy-scarlet", "larry-scarlet-elite", "hassel-scarlet", "geeta-scarlet"],
  },
];

export const regionPath = (region: string): RegionPath | null => ROAD_PATHS.find((p) => p.region === region) ?? null;

export type PathKind = "gym" | "league" | "endgame";

/** Where a team sits on a path (null when it's free play only). */
export function pathSpot(teamId: string): { region: string; kind: PathKind; index: number } | null {
  for (const p of ROAD_PATHS) {
    const g = p.gyms.indexOf(teamId);
    if (g >= 0) return { region: p.region, kind: "gym", index: g };
    const l = p.league.indexOf(teamId);
    if (l >= 0) return { region: p.region, kind: "league", index: l };
    if (p.endgame === teamId) return { region: p.region, kind: "endgame", index: 0 };
  }
  return null;
}

// ─── a player's progress ─────────────────────────────────────────────────────

/** One thing a player earned on the road (road_ledger): each key is earned once. */
export interface LedgerRow {
  key: string;
  /** "encounter": a villain team beaten on the road (encounter:<id>); "mark": a region's story battle won (mark:<region>, the trainer card's villain-team marks); "tool": a tool reward's own claim (three-stars:<team>, the Mart's first-look gift) or a tool past the bag's limit paid as tokens (tool:<reward>:<n>). */
  kind: "win" | "badge" | "league" | "region" | "endgame_hard" | "champion" | "encounter" | "mark" | "tool";
  region: string | null;
  team_id: string | null;
  xp: number;
  tokens: number;
  at: string;
}

export interface RegionProgress {
  region: string;
  /** Open on your path: Kanto, or the region before it is cleared. */
  open: boolean;
  /** Gym teams whose badge you hold, in badge order. */
  badges: string[];
  /** The League challenge you're on (0 = the first); equals the League's length once it's won. */
  leagueStep: number;
  leagueDone: boolean;
  cleared: boolean;
  /** The end-game opponent beaten in Hard (the holo card counts these). */
  endgameHard: boolean;
}

export type CardColor = "basic" | "bronze" | "silver" | "gold" | "holo";

export interface RoadProgress {
  xp: number;
  regions: RegionProgress[];
  badges: number;
  regionsCleared: number;
  /** Teams beaten at least once, any month, any mode. */
  trainersBeaten: number;
  champion: boolean;
  color: CardColor;
  startedAt: string | null;
  /** Regions whose villain team's story battle you've won (the trainer card's marks), in road order. */
  marks: string[];
}

/** A player's progress from their ledger and League steps (road_league: region → step). */
export function progressFrom(ledger: readonly LedgerRow[], league: Readonly<Record<string, number>>): RoadProgress {
  const has = new Set(ledger.map((r) => r.key));
  const regions: RegionProgress[] = [];
  let open = true;
  for (const p of ROAD_PATHS) {
    // Badges count in order: a badge only ever lands as the next one, so the held ones are a prefix.
    const badges = p.gyms.filter((t) => has.has(badgeKey(p.region, t)));
    const leagueDone = has.has(leagueKey(p.region));
    const cleared = has.has(regionKey(p.region));
    regions.push({
      region: p.region, open, badges, leagueDone, cleared,
      leagueStep: leagueDone ? p.league.length : Math.min(Math.max(0, league[p.region] ?? 0), p.league.length - 1),
      endgameHard: has.has(hardKey(p.region)),
    });
    open = cleared;
  }
  const regionsCleared = regions.filter((r) => r.cleared).length;
  const hardEnds = regions.filter((r) => r.endgameHard).length;
  return {
    xp: ledger.reduce((n, r) => n + r.xp, 0),
    regions,
    badges: regions.reduce((n, r) => n + r.badges.length, 0),
    regionsCleared,
    trainersBeaten: new Set(ledger.filter((r) => r.kind === "win" && r.team_id).map((r) => r.team_id)).size,
    champion: regionsCleared === ROAD_PATHS.length,
    color: cardColor(regionsCleared, hardEnds),
    startedAt: ledger.reduce<string | null>((min, r) => (!min || r.at < min ? r.at : min), null),
    marks: ROAD_PATHS.map((p) => p.region).filter((region) => has.has(markKey(region))),
  };
}

export const badgeKey = (region: string, team: string) => `badge:${region}:${team}`;
export const leagueKey = (region: string) => `league:${region}`;
export const regionKey = (region: string) => `region:${region}`;
export const hardKey = (region: string) => `endgame-hard:${region}`;
export const winKey = (team: string, month: string) => `win:${team}:${month}`;
export const encounterKey = (id: string) => `encounter:${id}`;
export const markKey = (region: string) => `mark:${region}`;
export const CHAMPION_KEY = "champion";

/** The card's color (picks: bronze for the first region, silver for five, gold for all nine, holo for every end-game opponent beaten in Hard). */
export function cardColor(regionsCleared: number, hardEndgames: number): CardColor {
  const all = ROAD_PATHS.length;
  if (regionsCleared >= all && hardEndgames >= all) return "holo";
  if (regionsCleared >= all) return "gold";
  if (regionsCleared >= 5) return "silver";
  if (regionsCleared >= 1) return "bronze";
  return "basic";
}

export const CARD_COLOR_LABEL: Record<CardColor, string> = { basic: "Basic", bronze: "Bronze", silver: "Silver", gold: "Gold", holo: "Holo" };

/** What a team is to a player right now: done, the next step, later on an open path, or not open yet. */
export type StepState = "done" | "next" | "later" | "locked";

let fresh: RoadProgress | null = null;

/** Signed out or brand new: the path as a new player sees it (Brock next, everything past Kanto locked). */
export function stepState(progress: RoadProgress | null, teamId: string): { region: string; kind: PathKind; index: number; state: StepState } | null {
  const spot = pathSpot(teamId);
  if (!spot) return null;
  const p = regionPath(spot.region)!;
  const r = (progress ?? (fresh ??= progressFrom([], {}))).regions.find((x) => x.region === spot.region);
  if (!r || !r.open) return { ...spot, state: "locked" };
  if (spot.kind === "gym") {
    const state: StepState = r.badges.includes(teamId) ? "done" : r.badges.length === spot.index ? "next" : "later";
    return { ...spot, state };
  }
  if (spot.kind === "league") {
    if (r.leagueDone || r.leagueStep > spot.index) return { ...spot, state: "done" };
    const ready = r.badges.length === p.gyms.length;
    return { ...spot, state: ready && r.leagueStep === spot.index ? "next" : "later" };
  }
  if (r.cleared) return { ...spot, state: "done" };
  return { ...spot, state: r.leagueDone ? "next" : "later" };
}

/** The next trainer on a player's path (the first open region not cleared), or null once everything is cleared. */
export function nextStep(progress: RoadProgress | null): { region: string; kind: PathKind; index: number; team: string } | null {
  const regions = progress?.regions ?? [];
  for (const p of ROAD_PATHS) {
    const r = regions.find((x) => x.region === p.region);
    if (r?.cleared) continue;
    if (r && !r.open) return null;
    const badges = r?.badges.length ?? 0;
    if (badges < p.gyms.length) return { region: p.region, kind: "gym", index: badges, team: p.gyms[badges] };
    if (!r?.leagueDone) { const step = r?.leagueStep ?? 0; return { region: p.region, kind: "league", index: step, team: p.league[step] }; }
    return { region: p.region, kind: "endgame", index: 0, team: p.endgame };
  }
  return null;
}

// ─── what a finished duel does ───────────────────────────────────────────────

export type PathOutcome =
  | { kind: "badge"; region: string; team: string; index: number; of: number }
  | { kind: "league_step"; region: string; team: string; step: number; of: number }
  | { kind: "league"; region: string; team: string }
  | { kind: "league_reset"; region: string; team: string; from: number }
  | { kind: "region"; region: string; team: string; next: string | null; hard: boolean }
  | { kind: "endgame_hard"; region: string; team: string }
  | { kind: "champion" };

/**
 * What a finished duel against a team does to a player's path. Only the next trainer on an open path
 * counts: a win earns that badge, moves the League along (its last win is the League), or clears the
 * region; a League loss on the challenge you're on sends you back to the first one. An end-game win in
 * Hard also counts toward the holo card, even after the region is cleared.
 */
export function judgePath(progress: RoadProgress, teamId: string, won: boolean, hard: boolean): PathOutcome[] {
  const st = stepState(progress, teamId);
  if (!st) return [];
  const p = regionPath(st.region)!;
  const r = progress.regions.find((x) => x.region === st.region)!;
  const out: PathOutcome[] = [];
  if (st.kind === "endgame" && won && hard && r.open && (st.state === "next" || st.state === "done") && !r.endgameHard) {
    out.push({ kind: "endgame_hard", region: st.region, team: teamId });
  }
  if (st.state !== "next") return out;
  if (!won) {
    if (st.kind === "league" && st.index > 0) out.push({ kind: "league_reset", region: st.region, team: teamId, from: st.index });
    return out;
  }
  if (st.kind === "gym") out.push({ kind: "badge", region: st.region, team: teamId, index: st.index, of: p.gyms.length });
  else if (st.kind === "league") {
    if (st.index === p.league.length - 1) out.push({ kind: "league", region: st.region, team: teamId });
    else out.push({ kind: "league_step", region: st.region, team: teamId, step: st.index + 1, of: p.league.length });
  } else {
    const i = ROAD_PATHS.findIndex((x) => x.region === st.region);
    out.push({ kind: "region", region: st.region, team: teamId, next: ROAD_PATHS[i + 1]?.region ?? null, hard });
    if (progress.regionsCleared + 1 === ROAD_PATHS.length) out.push({ kind: "champion" });
  }
  return out;
}

// ─── XP and levels ───────────────────────────────────────────────────────────

/** The numbers (all levers on Platform ▸ Token economy; these are the defaults). */
export interface RoadLevers {
  xpWin: Record<DuelTier, number>;
  xpEndgame: number;
  xpStar: number;
  /** Hard's XP as a percent of Normal's (150 = half again). */
  xpHardPercent: number;
  xpBadge: number;
  xpLeague: number;
  xpRegion: number;
  tokensBadge: number;
  tokensLeague: number;
  tokensRegion: number;
  tokensChampion: number;
  /** Road encounters (picks 2026-10-24): what a villain team swipes when it turns up, what beating it pays on top of getting them back, its XP, and the chance (percent) a grunt turns up after a badge. */
  encounterSwipe: number;
  encounterTokens: number;
  xpEncounter: number;
  encounterChance: number;
  /** Tools (picks 2026-10-25, tools.ts): prize money for a first win each month by kind, Mart prices, the bag's limit, and how many a duel allows. */
  prize: Record<DuelTier, number>;
  toolPrice: Record<ToolId, number>;
  bagMax: number;
  toolsDuel: number;
}

export const ROAD_LEVER_DEFAULTS: RoadLevers = {
  xpWin: { gym: 100, rival: 120, elite: 150, boss: 180, champion: 200, grunt: 60, admin: 120 },
  xpEndgame: 300,
  xpStar: 25,
  xpHardPercent: 150,
  xpBadge: 150,
  xpLeague: 500,
  xpRegion: 1000,
  tokensBadge: 50,
  tokensLeague: 250,
  tokensRegion: 500,
  tokensChampion: 1000,
  encounterSwipe: 50,
  encounterTokens: 25,
  xpEncounter: 100,
  encounterChance: 25,
  prize: { grunt: PRIZE_BY_TIER.grunt, gym: PRIZE_BY_TIER.gym, rival: PRIZE_BY_TIER.rival, admin: PRIZE_BY_TIER.admin, elite: PRIZE_BY_TIER.elite, boss: PRIZE_BY_TIER.boss, champion: PRIZE_BY_TIER.champion },
  toolPrice: Object.fromEntries(TOOL_IDS.map((t) => [t, TOOLS[t].price])) as Record<ToolId, number>,
  bagMax: BAG_MAX,
  toolsDuel: TOOL_CAP.duel,
};

/** XP for a win (the first win against each team each month): by role, plus each star, Hard half again. */
export function winXp(levers: RoadLevers, tier: DuelTier, endgame: boolean, stars: number, hard: boolean): number {
  const base = (endgame ? levers.xpEndgame : levers.xpWin[tier]) + levers.xpStar * Math.max(0, Math.min(3, stars));
  return Math.round(hard ? (base * levers.xpHardPercent) / 100 : base);
}

/** XP and tokens for each milestone a duel earned. */
export function outcomeRewards(levers: RoadLevers, o: PathOutcome): { xp: number; tokens: number } {
  switch (o.kind) {
    case "badge": return { xp: levers.xpBadge, tokens: levers.tokensBadge };
    case "league": return { xp: levers.xpLeague, tokens: levers.tokensLeague };
    case "region": return { xp: levers.xpRegion, tokens: levers.tokensRegion };
    case "champion": return { xp: 0, tokens: levers.tokensChampion };
    default: return { xp: 0, tokens: 0 };
  }
}

export const MAX_LEVEL = 100;
/** Level 2 at 100 XP, each level about 6% more than the last (clearing every region lands near 60). */
const LEVEL_BASE = 100;
const LEVEL_GROWTH = 1.06;

/** Total XP that reaches a level. */
export const xpForLevel = (level: number) => (level <= 1 ? 0 : Math.round((LEVEL_BASE * (LEVEL_GROWTH ** (level - 1) - 1)) / (LEVEL_GROWTH - 1)));

export function levelOf(xp: number): { level: number; into: number; need: number } {
  let level = 1;
  while (level < MAX_LEVEL && xp >= xpForLevel(level + 1)) level++;
  if (level >= MAX_LEVEL) return { level: MAX_LEVEL, into: 0, need: 0 };
  const from = xpForLevel(level);
  return { level, into: xp - from, need: xpForLevel(level + 1) - from };
}
