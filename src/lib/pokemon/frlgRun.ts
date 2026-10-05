/**
 * Pokémon Fire Red/Leaf Green run challenge (client-safe, pure).
 *
 * A seeded story run: a forced starter, then for every badge "catch X in area Y
 * before the next leader", with a level cap at the leader's strongest Pokémon,
 * a team-size limit and an optional twist. The same seed + options always build
 * the same run, so a run is shareable as a link.
 *
 * Realistic by segment: each segment's pool is only what you can reach and
 * catch before that milestone (surf after Koga, Sevii after Blaine, rods once
 * you have them; the research file already gates areas by segment). Gifts,
 * trades and one-off statics aren't targets. Trade evolutions are flagged,
 * since most players can't trade on Switch.
 *
 * Data: src/data/pokemon/frlg-run.json (trimmed from
 * specs/research/2026-10-04-randomizers/frlg-run.json, PokéAPI encounters).
 */

import data from "@/data/pokemon/frlg-run.json";

export type FrlgVersion = "firered" | "leafgreen";
export type CatchMethod = "walk" | "old-rod" | "good-rod" | "super-rod" | "surf" | "rock-smash";

interface Encounter { dex: number; name: string; min: number; max: number; method: string; ver: "both" | "fr" | "lg"; rate: number; types: string[] }
interface Area { name: string; encounters: Encounter[] }
interface Milestone {
  type: string; order: number; leader?: string; city?: string; specialty?: string; badge?: string; aceLevel: number;
  team?: { dex: number; name: string; level: number }[];
}
interface Segment { id: string; milestone: Milestone; areas: Area[] }

const SEGMENTS = (data as { segments: Segment[] }).segments;

export const FRLG_VERSIONS: { id: FrlgVersion; label: string }[] = [
  { id: "firered", label: "Fire Red" },
  { id: "leafgreen", label: "Leaf Green" },
];

export const STARTERS = [
  { dex: 1, name: "Bulbasaur", types: ["Grass", "Poison"] },
  { dex: 4, name: "Charmander", types: ["Fire"] },
  { dex: 7, name: "Squirtle", types: ["Water"] },
];

export const METHOD_LABEL: Record<string, string> = {
  walk: "In the grass or cave",
  "old-rod": "Old Rod",
  "good-rod": "Good Rod",
  "super-rod": "Super Rod",
  surf: "Surfing",
  "rock-smash": "Rock Smash",
};

/** Families that only finish evolving by trade. */
const TRADE_LINES: Record<string, string> = {
  Abra: "Kadabra", Kadabra: "Kadabra",
  Machop: "Machoke", Machoke: "Machoke",
  Geodude: "Graveler", Graveler: "Graveler",
  Gastly: "Haunter", Haunter: "Haunter",
};

export const TWISTS = [
  { id: "bench-starter", text: "Your starter sits this one out." },
  { id: "newest-leads", text: "Your newest catch leads." },
  { id: "no-items", text: "No healing items during the battle." },
  { id: "newest-in", text: "Your newest catch has to be on the team." },
] as const;

export interface RunOptions {
  version: FrlgVersion;
  /** Catches required per segment (1 or 2). */
  catches: number;
  /** Add a twist to every gym. */
  twists: boolean;
  /** Leave out fishing targets (some players skip rods). */
  noFishing: boolean;
}

export interface CatchStep {
  dex: number; name: string; types: string[];
  area: string; method: string; min: number; max: number; rate: number;
  /** "Won't evolve past Kadabra without a trade." */
  tradeNote: string | null;
}

export interface RunSegment {
  id: string;
  title: string;
  sub: string;
  levelCap: number;
  teamSize: number;
  twist: string | null;
  catches: CatchStep[];
  leaderTeam: { dex: number; name: string; level: number }[];
}

export interface Run { seed: string; options: RunOptions; starter: (typeof STARTERS)[number]; segments: RunSegment[] }

/** A short seed people can read out loud. */
export function newSeed(rng: () => number = Math.random): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  return Array.from({ length: 6 }, () => alphabet[Math.floor(rng() * alphabet.length)]).join("");
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Seeded PRNG (mulberry32), so a seed always rebuilds the same run. */
export function seededRng(seed: string): () => number {
  let a = hash(seed);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const onVersion = (e: Encounter, v: FrlgVersion) => e.ver === "both" || e.ver === (v === "firered" ? "fr" : "lg");
const isFishing = (m: string) => m.endsWith("-rod");

function weightedPick<T>(items: T[], weight: (t: T) => number, rng: () => number): T {
  const total = items.reduce((s, t) => s + Math.max(1, weight(t)), 0);
  let r = rng() * total;
  for (const t of items) { r -= Math.max(1, weight(t)); if (r <= 0) return t; }
  return items[items.length - 1];
}

/** Everything catchable in one segment, one entry per species (its best spot). */
export function segmentPool(seg: Segment, opts: Pick<RunOptions, "version" | "noFishing">): CatchStep[] {
  const best = new Map<string, CatchStep>();
  for (const a of seg.areas) {
    for (const e of a.encounters) {
      if (!onVersion(e, opts.version) || (opts.noFishing && isFishing(e.method))) continue;
      // Over the level cap (Dugtrio before Lt. Surge) wouldn't be usable yet.
      if (e.min > seg.milestone.aceLevel) continue;
      const cur = best.get(e.name);
      if (cur && cur.rate >= e.rate) continue;
      best.set(e.name, {
        dex: e.dex, name: e.name, types: e.types, area: a.name, method: e.method, min: e.min, max: e.max, rate: e.rate,
        tradeNote: TRADE_LINES[e.name] ? `Won't evolve past ${TRADE_LINES[e.name]} without a trade.` : null,
      });
    }
  }
  return [...best.values()];
}

function titleFor(m: Milestone): { title: string; sub: string } {
  if (m.type === "gym") return { title: `${m.leader}, ${m.city}`, sub: `${m.badge} · ${m.specialty} type` };
  return { title: "Elite Four and Champion", sub: "Lorelei, Bruno, Agatha, Lance, then your rival" };
}

export function buildRun(seed: string, options: RunOptions): Run {
  const rng = seededRng(`${seed}:${options.version}:${options.catches}:${options.noFishing ? 1 : 0}`);
  const starter = STARTERS[Math.floor(rng() * STARTERS.length)];
  const taken = new Set<string>([starter.name]);
  let owned = 1;
  let prevTwist = "";
  const segments: RunSegment[] = SEGMENTS.map((seg) => {
    const pool = segmentPool(seg, options);
    const catches: CatchStep[] = [];
    for (let i = 0; i < options.catches; i++) {
      // Prefer a species new to this run; fall back to anything left in the segment.
      const fresh = pool.filter((p) => !taken.has(p.name));
      const from = fresh.length ? fresh : pool.filter((p) => !catches.some((c) => c.name === p.name));
      if (!from.length) break;
      const pick = weightedPick(from, (p) => p.rate, rng);
      catches.push(pick);
      taken.add(pick.name);
    }
    owned += catches.length;
    const m = seg.milestone;
    const isLeague = m.type !== "gym";
    // Team size: 3-6 for gyms, never more than you own; the league takes a full team.
    const teamSize = isLeague ? Math.min(6, owned) : Math.min(owned, 3 + Math.floor(rng() * 4));
    let twist: string | null = null;
    if (options.twists && !isLeague) {
      // Benching the starter needs a real team behind it; never the same twist twice running.
      const fits = TWISTS.filter((t) => (t.id !== "bench-starter" || owned >= 3) && t.id !== prevTwist);
      const t = fits[Math.floor(rng() * fits.length)];
      twist = t.text;
      prevTwist = t.id;
    } else {
      rng(); // keep the sequence the same with twists off, so toggling doesn't change the catches
    }
    const { title, sub } = titleFor(m);
    return { id: seg.id, title, sub, levelCap: m.aceLevel, teamSize, twist, catches, leaderTeam: m.team ?? [] };
  });
  return { seed, options, starter, segments };
}

/** One block per segment, for pasting into chat or Discord. */
export function runText(run: Run): string {
  const v = FRLG_VERSIONS.find((x) => x.id === run.options.version)?.label ?? "";
  const lines = [`Pokémon ${v} run challenge (seed ${run.seed})`, `Starter: ${run.starter.name}`];
  for (const s of run.segments) {
    lines.push("", `Before ${s.title}:`);
    for (const c of s.catches) lines.push(`  Catch ${c.name} on ${c.area} (${METHOD_LABEL[c.method] ?? c.method}, Lv ${c.min}${c.max !== c.min ? `-${c.max}` : ""})`);
    lines.push(`  Team: up to ${s.teamSize}, level cap ${s.levelCap}${s.twist ? `. ${s.twist}` : ""}`);
  }
  return lines.join("\n");
}

/** Every checklist item in a run, in order (starter, catches, battles). */
export function checklistIds(run: Run): string[] {
  return ["starter", ...run.segments.flatMap((s) => [...s.catches.map((c) => `${s.id}:${c.name}`), `${s.id}:beat`])];
}
