/**
 * Pure draw logic for Mario Party games. No React, no I/O, so the randomizer,
 * chat commands and tournaments can all share it. `rng` is injectable for tests.
 */

import { inEdition, type PartyEdition, type PartyGame, type PartyMinigame, type PartyMode } from "@/lib/party/types";

export type Rng = () => number;

export function pick<T>(rows: readonly T[], rng: Rng = Math.random): T | undefined {
  return rows.length ? rows[Math.floor(rng() * rows.length)] : undefined;
}

export function shuffle<T>(rows: readonly T[], rng: Rng = Math.random): T[] {
  const out = [...rows];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/* ── Board and rules ─────────────────────────────────────────────────────── */

export interface PartySetup {
  boardId: string;
  rulesetId: string;
  turns: number;
  bonusModeId: string;
}

export type SetupField = keyof PartySetup;

export interface SetupOptions {
  edition: PartyEdition;
  /** Board ids the player can pick (unlocked, within the difficulty band). */
  boardIds: string[];
  /** Ruleset ids in the draw. Empty = every ruleset in their edition. */
  rulesetIds?: string[];
}

/**
 * Roll a setup. Locked fields keep their value from `current`; a locked turn
 * count or Bonus Star mode that the new ruleset can't use is rerolled.
 */
export function rollSetup(
  game: PartyGame,
  opts: SetupOptions,
  current: PartySetup | null = null,
  locked: Partial<Record<SetupField, boolean>> = {},
  rng: Rng = Math.random,
): PartySetup | null {
  const boards = game.boards.filter((b) => opts.boardIds.includes(b.id));
  const rulesets = inEdition(game.rulesets, opts.edition)
    .filter((r) => !opts.rulesetIds?.length || opts.rulesetIds.includes(r.id));
  if (!boards.length || !rulesets.length) return null;

  const keep = <K extends SetupField>(k: K) => (locked[k] && current ? current[k] : undefined);
  const boardId = keep("boardId") ?? pick(boards, rng)!.id;
  const lockedRuleset = rulesets.find((r) => r.id === keep("rulesetId"));
  const ruleset = lockedRuleset ?? pick(rulesets, rng)!;
  const lockedTurns = keep("turns");
  const turns = lockedTurns !== undefined && ruleset.turns.includes(lockedTurns) ? lockedTurns : pick(ruleset.turns, rng)!;
  const lockedBonus = keep("bonusModeId");
  const bonusModeId = lockedBonus && ruleset.bonus.includes(lockedBonus) ? lockedBonus : pick(ruleset.bonus, rng)!;
  return { boardId, rulesetId: ruleset.id, turns, bonusModeId };
}

/* ── Characters ──────────────────────────────────────────────────────────── */

export interface CharacterOptions {
  /** Include characters that have to be unlocked. */
  unlockables: boolean;
}

export function characterPool(game: PartyGame, opts: CharacterOptions): string[] {
  return game.characters.filter((c) => opts.unlockables || !c.unlockable).map((c) => c.name);
}

/**
 * Fill every seat with a different character. Seats with a name in `keep` hold
 * it (a per-seat reroll passes everyone else's pick as `keep`).
 */
export function drawCharacters(
  game: PartyGame,
  seats: number,
  opts: CharacterOptions,
  keep: (string | null)[] = [],
  rng: Rng = Math.random,
): string[] {
  const pool = characterPool(game, opts);
  const held = new Set(keep.filter((k): k is string => !!k && pool.includes(k)));
  const free = shuffle(pool.filter((n) => !held.has(n)), rng);
  return Array.from({ length: seats }, (_, i) => {
    const k = keep[i];
    return k && held.has(k) ? k : free.shift() ?? "";
  });
}

/** Split seats into two teams of two, for team rulesets. Returns seat indexes. */
export function drawTeams(seats: number, rng: Rng = Math.random): [number[], number[]] {
  const order = shuffle(Array.from({ length: seats }, (_, i) => i), rng);
  return [order.slice(0, 2).sort(), order.slice(2, 4).sort()];
}

/* ── Minigames ───────────────────────────────────────────────────────────── */

export interface MinigameFilters {
  edition: PartyEdition;
  categories: string[];
  /** Include motion-control minigames. */
  motion: boolean;
  /** Only coin-collecting minigames. */
  coinOnly: boolean;
  /** Include minigames that need a camera (Bowser Live). */
  camera: boolean;
  /** Leave out minigames that can't come up under this ruleset. */
  rulesetId?: string | null;
}

export function minigamePool(game: PartyGame, f: MinigameFilters): PartyMinigame[] {
  const cats = new Set(inEdition(game.minigameCategories, f.edition).map((c) => c.id).filter((id) => f.categories.includes(id)));
  return inEdition(game.minigames, f.edition).filter((m) =>
    cats.has(m.category)
    && (f.motion || !m.motion)
    && (!f.coinOnly || m.coin)
    && (f.camera || m.controls !== "camera")
    && !(f.rulesetId === "pro" && (m.noPro || m.category === "item")),
  );
}

/** Draw `n` different minigames (fewer if the pool is smaller). */
export function drawMinigames(pool: PartyMinigame[], n: number, rng: Rng = Math.random): PartyMinigame[] {
  return shuffle(pool, rng).slice(0, n);
}

/* ── Cards ───────────────────────────────────────────────────────────────── */

/** Draw `n` different cards, skipping ids already in play. */
export function drawCards<T extends { id: string }>(deck: T[], n: number, exclude: string[] = [], rng: Rng = Math.random): T[] {
  return shuffle(deck.filter((c) => !exclude.includes(c.id)), rng).slice(0, n);
}

/* ── Night plan ──────────────────────────────────────────────────────────── */

export interface NightSegment {
  modeId: string;
  /** Rolled value for the mode's option ("5 Stars", "Remix"). */
  option: string | null;
  minutes: number;
  /** Board game only: turns sized to fit the night. */
  turns: number | null;
}

export interface NightOptions {
  edition: PartyEdition;
  /** People playing (CPUs don't count toward mode limits). */
  humans: number;
  /** Rough length of the night in minutes. */
  minutes: number;
  /** Whether the board game is in: always, maybe (usually), or never. */
  board: "always" | "maybe" | "never";
  /** Turn counts the board game may use (from the rolled or chosen ruleset). */
  turns: number[];
  coop: boolean;
  motion: boolean;
  /** Unlockable modes the players have unlocked. */
  unlocked: string[];
}

/**
 * Plan a night: optionally the board game sized to take most of it, plus other
 * modes to fill the rest, each at most once. A short warm-up goes before the
 * board game and the rest after it.
 */
export function planNight(game: PartyGame, o: NightOptions, rng: Rng = Math.random): NightSegment[] {
  const eligible = inEdition(game.modes, o.edition).filter((m) =>
    o.humans >= m.minPlayers && o.humans <= m.maxPlayers
    && (o.coop || !m.coop) && (o.motion || !m.motion)
    && (!m.unlockable || o.unlocked.includes(m.id)));
  const boardMode = eligible.find((m) => m.board);
  const withOption = (m: PartyMode): NightSegment => ({
    modeId: m.id, option: m.options ? pick(m.options.values, rng) ?? null : null, minutes: m.minutes, turns: null,
  });

  const segments: NightSegment[] = [];
  let left = o.minutes;
  const wantBoard = boardMode && o.turns.length && (o.board === "always" || (o.board === "maybe" && rng() < 0.75));
  let boardSeg: NightSegment | null = null;
  if (wantBoard) {
    // The biggest turn count that leaves some room, else the shortest game.
    const fits = [...o.turns].sort((a, b) => a - b).filter((t) => t * game.minutesPerTurn <= o.minutes * 0.75);
    const turns = fits.length ? fits[fits.length - 1] : Math.min(...o.turns);
    boardSeg = { modeId: boardMode!.id, option: null, minutes: Math.round(turns * game.minutesPerTurn), turns };
    left -= boardSeg.minutes;
  }
  const fillers = shuffle(eligible.filter((m) => !m.board), rng);
  const extras: NightSegment[] = [];
  for (const m of fillers) {
    if (m.minutes <= left) { extras.push(withOption(m)); left -= m.minutes; }
  }
  if (!boardSeg) return extras.length ? extras : fillers.slice(0, 1).map(withOption);
  // Warm up with the shortest extra, then the main event, then the rest.
  extras.sort((a, b) => a.minutes - b.minutes);
  const warmup = extras.shift();
  if (warmup) segments.push(warmup);
  segments.push(boardSeg, ...extras);
  return segments;
}
