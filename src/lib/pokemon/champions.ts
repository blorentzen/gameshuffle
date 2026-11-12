/**
 * Pokémon Champions teams (game space picks, 2026-11-11, all as recommended): the season's list, what's legal, the
 * team's weaknesses and resistances by type, filling the rest at random, and the link that rebuilds a team.
 * Pure and client-safe; the team builder, tournament team lists and the chat roll all read it.
 *
 * The list is src/data/pokemon/champions.json (Regulation M-C, the Chat Draft roster too); the regulation's dates
 * and sources are in src/data/pokemon/champions-season.ts. Names and types only, never art (the Pokémon imagery rule).
 */

import rows from "@/data/pokemon/champions.json";
import { CHAMPIONS_SEASON } from "@/data/pokemon/champions-season";

export { CHAMPIONS_SEASON };

type Row = [number, string, string[], string];

export interface ChampMon {
  /** Stable id from the name ("raichu-alolan"), used in links and stored team lists. */
  id: string;
  dex: number;
  /** With its form in brackets ("Raichu (Alolan)"). */
  name: string;
  types: string[];
  fullyEvolved: boolean;
  legendary: boolean;
  mythical: boolean;
}

/** A team holds at most six; official play takes four to six (VGC handbook 2.1). */
export const TEAM_SIZE = 6;
export const TEAM_MIN = 4;

export function monId(name: string): string {
  return name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/['.’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export const CHAMPIONS_ROSTER: ChampMon[] = (rows as Row[]).map(([dex, name, types, f]) => ({
  id: monId(name), dex, name, types, fullyEvolved: f.includes("e"), legendary: f.includes("l"), mythical: f.includes("m"),
}));

const BY_ID = new Map(CHAMPIONS_ROSTER.map((m) => [m.id, m]));
const BY_NAME = new Map(CHAMPIONS_ROSTER.map((m) => [m.name.toLowerCase(), m]));
export const championById = (id: string | null | undefined): ChampMon | null => (id ? BY_ID.get(id) ?? null : null);
/** By its name as shown (forms in brackets), or its id. */
export const championByName = (name: string | null | undefined): ChampMon | null =>
  name ? BY_NAME.get(name.trim().toLowerCase()) ?? BY_ID.get(monId(name)) ?? null : null;

/** The form part of a name ("Alolan"), or null for the plain species. */
export const formOf = (m: Pick<ChampMon, "name">): string | null => m.name.match(/\(([^)]+)\)\s*$/)?.[1] ?? null;

// ── Types ────────────────────────────────────────────────────────────────────

export const TYPES = ["Normal", "Fire", "Water", "Electric", "Grass", "Ice", "Fighting", "Poison", "Ground", "Flying", "Psychic", "Bug", "Rock", "Ghost", "Dragon", "Dark", "Steel", "Fairy"] as const;
export type PokeType = (typeof TYPES)[number];

/** Attacking type → defending types it doesn't hit for normal damage (the chart since Generation 6). */
const CHART: Record<PokeType, Partial<Record<PokeType, number>>> = {
  Normal: { Rock: 0.5, Ghost: 0, Steel: 0.5 },
  Fire: { Fire: 0.5, Water: 0.5, Grass: 2, Ice: 2, Bug: 2, Rock: 0.5, Dragon: 0.5, Steel: 2 },
  Water: { Fire: 2, Water: 0.5, Grass: 0.5, Ground: 2, Rock: 2, Dragon: 0.5 },
  Electric: { Water: 2, Electric: 0.5, Grass: 0.5, Ground: 0, Flying: 2, Dragon: 0.5 },
  Grass: { Fire: 0.5, Water: 2, Grass: 0.5, Poison: 0.5, Ground: 2, Flying: 0.5, Bug: 0.5, Rock: 2, Dragon: 0.5, Steel: 0.5 },
  Ice: { Fire: 0.5, Water: 0.5, Grass: 2, Ice: 0.5, Ground: 2, Flying: 2, Dragon: 2, Steel: 0.5 },
  Fighting: { Normal: 2, Ice: 2, Poison: 0.5, Flying: 0.5, Psychic: 0.5, Bug: 0.5, Rock: 2, Ghost: 0, Dark: 2, Steel: 2, Fairy: 0.5 },
  Poison: { Grass: 2, Poison: 0.5, Ground: 0.5, Rock: 0.5, Ghost: 0.5, Steel: 0, Fairy: 2 },
  Ground: { Fire: 2, Electric: 2, Grass: 0.5, Poison: 2, Flying: 0, Bug: 0.5, Rock: 2, Steel: 2 },
  Flying: { Electric: 0.5, Grass: 2, Fighting: 2, Bug: 2, Rock: 0.5, Steel: 0.5 },
  Psychic: { Fighting: 2, Poison: 2, Psychic: 0.5, Dark: 0, Steel: 0.5 },
  Bug: { Fire: 0.5, Grass: 2, Fighting: 0.5, Poison: 0.5, Flying: 0.5, Psychic: 2, Ghost: 0.5, Dark: 2, Steel: 0.5, Fairy: 0.5 },
  Rock: { Fire: 2, Ice: 2, Fighting: 0.5, Ground: 0.5, Flying: 2, Bug: 2, Steel: 0.5 },
  Ghost: { Normal: 0, Psychic: 2, Ghost: 2, Dark: 0.5 },
  Dragon: { Dragon: 2, Steel: 0.5, Fairy: 0 },
  Dark: { Fighting: 0.5, Psychic: 2, Ghost: 2, Dark: 0.5, Fairy: 0.5 },
  Steel: { Fire: 0.5, Water: 0.5, Electric: 0.5, Ice: 2, Rock: 2, Steel: 0.5, Fairy: 2 },
  Fairy: { Fire: 0.5, Fighting: 2, Poison: 0.5, Dragon: 2, Dark: 2, Steel: 0.5 },
};

/** How much one attacking type hurts a Pokémon of these types: 0, ¼, ½, 1, 2 or 4. */
export function effectiveness(attack: string, defend: string[]): number {
  const row = CHART[attack as PokeType];
  if (!row) return 1;
  return defend.reduce((x, t) => x * (row[t as PokeType] ?? 1), 1);
}

export interface TypeLine {
  type: PokeType;
  /** Takes double damage or more (names, with ×4 ones marked in `double`). */
  weak: string[];
  /** Takes four times the damage. */
  double: string[];
  /** Takes half damage or less. */
  resist: string[];
  /** Takes none. */
  immune: string[];
}

/** For every attacking type: who on the team is weak to it, resists it, or takes nothing. By type only (abilities like
 *  Levitate, items, Tera and Mega Evolution aren't counted). */
export function typeLines(team: Pick<ChampMon, "name" | "types">[]): TypeLine[] {
  return TYPES.map((type) => {
    const line: TypeLine = { type, weak: [], double: [], resist: [], immune: [] };
    for (const m of team) {
      const x = effectiveness(type, m.types);
      if (x === 0) line.immune.push(m.name);
      else if (x < 1) line.resist.push(m.name);
      else if (x > 1) { line.weak.push(m.name); if (x >= 4) line.double.push(m.name); }
    }
    return line;
  });
}

/**
 * Weak spots: types more of the team is weak to than can take them, worst first. A type counts when at least two are
 * weak and the weak outnumber the ones that resist or are immune by two or more (with a full team, three weak and
 * nobody resisting is the classic hole).
 */
export function weakSpots(lines: TypeLine[]): TypeLine[] {
  const score = (l: TypeLine) => l.weak.length + l.double.length * 0.5 - l.resist.length - l.immune.length;
  return lines.filter((l) => l.weak.length >= 2 && score(l) >= 2).sort((a, b) => score(b) - score(a) || b.weak.length - a.weak.length);
}

/** Types nobody on the team takes for less than normal damage, and two or more are weak to: "nobody resists it". */
export const unanswered = (l: TypeLine) => l.weak.length >= 2 && l.resist.length + l.immune.length === 0;

// ── Legality ─────────────────────────────────────────────────────────────────

export type TeamProblem =
  | { kind: "off_list"; name: string }
  | { kind: "same_species"; names: string[] }
  | { kind: "too_many"; count: number }
  | { kind: "too_few"; count: number };

/** One entry in a team: a Pokémon on the list, or a name that isn't (a stored team from an older regulation). */
export type TeamEntry = ChampMon | { id: string; name: string; offList: true };
export const onList = (e: TeamEntry): e is ChampMon => !("offList" in e);

/**
 * What stops a team being legal in the current regulation: anything not on the season list, two Pokémon with the same
 * Pokédex number (forms count as the same species), more than six, and with `min` fewer than that (four for an event).
 */
export function teamProblems(team: TeamEntry[], min = 0): TeamProblem[] {
  const out: TeamProblem[] = [];
  for (const e of team) if (!onList(e)) out.push({ kind: "off_list", name: e.name });
  const byDex = new Map<number, string[]>();
  for (const e of team) if (onList(e)) byDex.set(e.dex, [...(byDex.get(e.dex) ?? []), e.name]);
  for (const names of byDex.values()) if (names.length > 1) out.push({ kind: "same_species", names });
  if (team.length > TEAM_SIZE) out.push({ kind: "too_many", count: team.length });
  if (min && team.length < min) out.push({ kind: "too_few", count: team.length });
  return out;
}

const list = (names: string[]) => (names.length <= 2 ? names.join(" and ") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);

export function problemText(p: TeamProblem): string {
  switch (p.kind) {
    case "off_list": return `${p.name} isn't on the ${CHAMPIONS_SEASON.name} list.`;
    case "same_species": return `${list(p.names)} are the same species. A team can have one Pokémon per Pokédex number.`;
    case "too_many": return `That's ${p.count} Pokémon. A team holds six.`;
    case "too_few": return `That's ${p.count} Pokémon. A team for an event needs four to six.`;
  }
}

/** Why this Pokémon can't join the team right now, or null when it can. */
export function blockedBy(m: ChampMon, team: (ChampMon | null)[]): string | null {
  const here = team.filter((x): x is ChampMon => !!x);
  if (here.some((x) => x.id === m.id)) return "On your team";
  const same = here.find((x) => x.dex === m.dex);
  if (same) return `Same species as ${same.name}`;
  if (here.length >= TEAM_SIZE) return "Team is full";
  return null;
}

// ── Filling at random ────────────────────────────────────────────────────────

export interface FillOptions {
  /** No two Pokémon on the team share a type (the generator's rule). */
  noRepeatTypes: boolean;
  /** Prefer Pokémon that take the team's weak spots for less than normal damage. */
  cover: boolean;
}

export const DEFAULT_FILL: FillOptions = { noRepeatTypes: false, cover: true };

type Rng = () => number;
const pick = <T,>(xs: T[], rng: Rng): T | null => (xs.length ? xs[Math.floor(rng() * xs.length)] : null);

/** Who could join these Pokémon: on the list, a different species, and (when asked) no shared type. */
export function candidates(team: ChampMon[], o: FillOptions, pool: ChampMon[] = CHAMPIONS_ROSTER): ChampMon[] {
  const dexes = new Set(team.map((m) => m.dex));
  const used = new Set(team.flatMap((m) => m.types));
  return pool.filter((m) => !dexes.has(m.dex) && (!o.noRepeatTypes || !m.types.some((t) => used.has(t))));
}

/** How well a Pokémon answers the team's weak spots: one point per weak spot it resists, two when it's immune. */
export function coverScore(m: Pick<ChampMon, "types">, team: Pick<ChampMon, "name" | "types">[]): number {
  const spots = weakSpots(typeLines(team));
  return spots.reduce((s, l) => {
    const x = effectiveness(l.type, m.types);
    return s + (x === 0 ? 2 : x < 1 ? 1 : x > 1 ? -1 : 0);
  }, 0);
}

function nextFor(team: ChampMon[], o: FillOptions, rng: Rng): ChampMon | null {
  const pool = candidates(team, o);
  if (!o.cover || !team.length) return pick(pool, rng);
  // Among everyone who fits, the ones that cover the most weak spots; a team with none to cover takes anyone.
  const scored = pool.map((m) => ({ m, s: coverScore(m, team) }));
  const best = Math.max(...scored.map((x) => x.s), 0);
  return pick(best > 0 ? scored.filter((x) => x.s === best).map((x) => x.m) : pool, rng);
}

/**
 * Fills the empty slots and keeps the ones already picked where they are. Comes back with empty slots still null when
 * nobody fits (no repeated types can run out of types).
 */
export function fillTeam(slots: (ChampMon | null)[], o: FillOptions, rng: Rng = Math.random): (ChampMon | null)[] {
  const out = Array.from({ length: TEAM_SIZE }, (_, i) => slots[i] ?? null);
  for (let i = 0; i < TEAM_SIZE; i++) {
    if (out[i]) continue;
    out[i] = nextFor(out.filter((x): x is ChampMon => !!x), o, rng);
  }
  return out;
}

/** A new Pokémon for one slot, keeping the others (and never the one it had). */
export function rerollSlot(slots: (ChampMon | null)[], index: number, o: FillOptions, rng: Rng = Math.random): ChampMon | null {
  const others = slots.filter((m, i): m is ChampMon => i !== index && !!m);
  const now = slots[index];
  const pool = candidates(others, o).filter((m) => m.id !== now?.id);
  if (!o.cover || !others.length) return pick(pool, rng) ?? now ?? null;
  const scored = pool.map((m) => ({ m, s: coverScore(m, others) }));
  const best = Math.max(...scored.map((x) => x.s), 0);
  return pick(best > 0 ? scored.filter((x) => x.s === best).map((x) => x.m) : pool, rng) ?? now ?? null;
}

/** A whole random team (the chat roll): six different species, covering weak spots as it goes. */
export function randomTeam(o: FillOptions = DEFAULT_FILL, rng: Rng = Math.random): ChampMon[] {
  return fillTeam([], o, rng).filter((m): m is ChampMon => !!m);
}

// ── Links ────────────────────────────────────────────────────────────────────
// ?team=garchomp.incineroar.raichu-alolan rebuilds the team in that order. Ids, not list positions, so a link keeps
// working when the list grows; a Pokémon a later regulation drops comes back as off the list.

export const TEAM_PARAM = "team";

export function teamParam(team: (Pick<ChampMon, "id"> | null)[]): string {
  return team.filter((m): m is Pick<ChampMon, "id"> => !!m).map((m) => m.id).join(".");
}

/** The team in a link's `team` value: on-list Pokémon, and the ids we don't know (left out, but said). */
export function readTeamParam(value: string | null | undefined): { team: ChampMon[]; unknown: string[] } {
  const ids = String(value ?? "").toLowerCase().split(/[.,\s]+/).map((s) => s.trim()).filter(Boolean).slice(0, 12);
  const team: ChampMon[] = [];
  const unknown: string[] = [];
  for (const id of ids) {
    const m = championById(id);
    if (!m) { unknown.push(id); continue; }
    if (team.some((x) => x.id === m.id)) continue;
    team.push(m);
  }
  return { team: team.slice(0, TEAM_SIZE), unknown };
}

/** A team link pasted anywhere (the builder's address, or just the ?team= part) → its ids. */
export function teamFromText(text: string): { team: ChampMon[]; unknown: string[] } {
  const raw = text.trim();
  const m = raw.match(/[?&]team=([^&#\s]+)/i);
  return readTeamParam(m ? decodeURIComponent(m[1]) : raw.includes("/") ? "" : raw);
}

/** A readable id for something not on the list ("tapu-koko" → "Tapu Koko"). */
export const nameFromId = (id: string) => id.split("-").filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");

export const TEAM_BUILDER_PATH = "/pokemon-champions-team-builder";
export const teamBuilderHref = (team: (Pick<ChampMon, "id"> | null)[]) => {
  const p = teamParam(team);
  return p ? `${TEAM_BUILDER_PATH}?${TEAM_PARAM}=${p}` : TEAM_BUILDER_PATH;
};

/** "Regulation M-C, through Dec 1": the season line pages show. */
export function seasonLine(today?: string): string {
  const end = new Date(`${CHAMPIONS_SEASON.ends}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const over = today && today > CHAMPIONS_SEASON.ends;
  return `Regulation ${CHAMPIONS_SEASON.regulation}, ${over ? "ended" : "through"} ${end}`;
}

// ── The monthly check ────────────────────────────────────────────────────────

const dayNum = (d: string) => Math.round(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 86_400_000);
const shortDay = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/**
 * The reminder staff get on the 1st of each month (/api/cron/champions-season): which regulation the site has, when
 * it ends, when the list was last checked, and what to change. A plain reminder: nothing is read from anyone's site.
 */
export function seasonReminder(today: string): { title: string; text: string; ended: boolean } {
  const s = CHAMPIONS_SEASON;
  const left = dayNum(s.ends) - dayNum(today);
  const since = dayNum(today) - dayNum(s.checkedOn);
  const when = left > 1 ? `ends ${shortDay(s.ends)}, in ${left} days` : left === 1 ? "ends tomorrow" : left === 0 ? "ends today" : `ended ${shortDay(s.ends)}`;
  const title = left < 0
    ? `Pokémon Champions: ${s.name} has ended, the season list needs the new regulation`
    : `Pokémon Champions: check the season list (${s.name} ${when})`;
  const text = [
    `GameShuffle's Pokémon Champions list is ${s.name} (${CHAMPIONS_ROSTER.length} Pokémon). It ${when}.`,
    `Last checked against official sources: ${shortDay(s.checkedOn)} (${since} ${since === 1 ? "day" : "days"} ago).`,
    "",
    "Check whether a new regulation has been announced or the list changed:",
    ...s.sources.filter((x) => x.official).map((x) => `- ${x.label}: ${x.url}`),
    "",
    "If it changed: update src/data/pokemon/champions.json (dex, name with its form, types, flags) and",
    "src/data/pokemon/champions-season.ts (regulation, dates, checkedOn). The team builder, tournament team lists,",
    "Chat Draft and chat rolls all read them. If nothing changed, bump checkedOn.",
  ].join("\n");
  return { title, text, ended: left < 0 };
}
