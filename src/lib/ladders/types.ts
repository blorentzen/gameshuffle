/**
 * Lounge ladders (lounge plan picks 2026-11-01, https://claude.ai/artifact/Y3uf63y4B2KEg6YMVwsSq8, all as
 * recommended): a lounge's own ladder run on GameShuffle Competitive, in its own Discord server under its own name.
 * Step 1 is results first: the lounge keeps its queue, reporters submit tables, updaters verify, MMR moves.
 * Client-safe types and defaults; rules in rules.ts, the database in store.ts.
 */

import { FALLBACK_RANKS, type DivisionStep } from "@/lib/mmr/rules";
import type { ScorePlacement } from "./lounge200";
import { cleanDiscipline, DEFAULT_DISCIPLINE, type DisciplineSettings } from "./discipline";

export type LadderGame = "mk8dx" | "mkworld";
/** race: 12-player rooms scored by points (FFA to 6v6). knockout: Mario Kart World's Knockout Tour, 24 places. */
export type LadderKind = "race" | "knockout";
export type LadderStatus = "active" | "paused" | "archived";

/**
 * How a verified table moves MMR. lounge: the lounge model (Elo per pair of teams, src/lib/lounge/odds.ts).
 * lounge200: the 200cc Lounge's own formula (src/lib/ladders/lounge200.ts), turned on by its history import.
 */
export type LadderRules = "lounge" | "lounge200";
export const LADDER_RULES: Record<LadderRules, string> = { lounge: "Lounge rules", lounge200: "200 Lounge rules" };

export interface LadderSettings {
  rules: LadderRules;
  /** Where a new player starts (lounge rules; 200 Lounge rules place by the first table's score instead). */
  start: number;
  /** Tables a new player shows as Placement. Under lounge rules they also move twice as far, so they find their
   *  level sooner (0 turns it off); under 200 Lounge rules it's 1 (placed by the first table). */
  placementEvents: number;
  /** 200 Lounge rules: where a new player starts from their first table's score. */
  placement: ScorePlacement | null;
  /** Division starts, lowest first. */
  divisions: DivisionStep[];
  /** The pair value and rating scale (null: the format's own, src/lib/lounge/odds.ts). */
  pay: { k: number; scale: number } | null;
  /** How staff work (name, web and docs pick 6A; automation picks 1, 4 and 5). */
  staff: StaffSettings;
  /** Penalties, strikes, breaks and reduced loss (discipline.ts). */
  discipline: DisciplineSettings;
  /** Division roles in the lounge's Discord (lounge system pick 12A): on, and the role made for each division. */
  roles: { on: boolean; ids: Record<string, string> };
}

export interface StaffSettings {
  /** Where tables waiting on an updater show: a card in the results channel, the staff page, or both (the staff page
   *  always works). */
  workIn: "discord" | "web" | "both";
  /** A table verifies on its own after a short hold when nothing about it needs a person (autoVerify.ts). */
  autoVerify: boolean;
  /** A name change approves itself when nothing about it needs a person (playerChecks.ts). */
  autoNames: boolean;
  /** A new player is added on the spot when MKCentral vouches for them (playerChecks.ts verificationCheck). */
  autoJoin: boolean;
}
export const DEFAULT_STAFF: StaffSettings = { workIn: "both", autoVerify: false, autoNames: false, autoJoin: false };

export interface Ladder {
  id: string;
  slug: string;
  name: string;
  game: LadderGame;
  kind: LadderKind;
  guildId: string;
  resultsChannelId: string | null;
  updaterRoles: string[];
  reporterRoles: string[];
  settings: LadderSettings;
  season: number;
  status: LadderStatus;
  tableCount: number;
  createdBy: string;
}

export const LADDER_GAMES: Record<LadderGame, string> = { mk8dx: "Mario Kart 8 Deluxe", mkworld: "Mario Kart World" };
export const LADDER_KINDS: Record<LadderKind, string> = { race: "Races", knockout: "Knockout Tour" };

/** Players per team a race room can be scored as. */
export const FORMATS = [1, 2, 3, 4, 6] as const;
export type Format = (typeof FORMATS)[number];
export const formatLabel = (f: number) => (f === 1 ? "FFA" : `${f}v${f}`);
export const isFormat = (v: unknown): v is Format => FORMATS.includes(Number(v) as Format);

/** Players in a room. */
export const roomSize = (kind: LadderKind): 12 | 24 => (kind === "knockout" ? 24 : 12);
/** Every point a full room hands out (12 races, 15 points for 1st down to 1; 24 players: 15 down to 1 over 24 places). */
export const ROOM_POINTS: Record<12 | 24, number> = { 12: 984, 24: 1728 };

/** How much further a placement table moves. */
export const PLACEMENT_BOOST = 2;
/** A knockout room's pair value: 24 places make about the swing of a 12-player FFA room. */
export const KNOCKOUT_PAY = { k: 20, scale: 7000 };

export function defaultSettings(game: LadderGame, kind: LadderKind): LadderSettings {
  const ranks = kind === "knockout" ? FALLBACK_RANKS.mkworld24p : game === "mk8dx" ? FALLBACK_RANKS.mk8dx : FALLBACK_RANKS.mkworld12p;
  return {
    rules: "lounge",
    start: 2000,
    placementEvents: 5,
    placement: null,
    divisions: Object.entries(ranks).map(([name, at]) => ({ name, at })).sort((a, b) => a.at - b.at),
    pay: kind === "knockout" ? KNOCKOUT_PAY : null,
    staff: DEFAULT_STAFF,
    discipline: DEFAULT_DISCIPLINE,
    roles: { on: false, ids: {} },
  };
}

function cleanRoles(raw: unknown): LadderSettings["roles"] {
  const r = (raw && typeof raw === "object" ? raw : {}) as { on?: unknown; ids?: unknown };
  const ids = r.ids && typeof r.ids === "object" ? Object.fromEntries(Object.entries(r.ids as Record<string, unknown>).filter(([k, v]) => k.length <= 24 && typeof v === "string" && /^\d{5,25}$/.test(v)).slice(0, 40)) as Record<string, string> : {};
  return { on: r.on === true, ids };
}

export function cleanStaff(raw: unknown): StaffSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<keyof StaffSettings, unknown>>;
  return {
    workIn: r.workIn === "discord" || r.workIn === "web" ? r.workIn : "both",
    autoVerify: r.autoVerify === true,
    autoNames: r.autoNames === true,
    autoJoin: r.autoJoin === true,
  };
}

const int = (v: unknown, lo: number, hi: number, fallback: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : fallback;
};

/** Stored settings read safely: anything missing or odd falls back to the defaults. */
export function cleanSettings(raw: unknown, game: LadderGame, kind: LadderKind): LadderSettings {
  const d = defaultSettings(game, kind);
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<keyof LadderSettings, unknown>>;
  const divisions = Array.isArray(r.divisions)
    ? (r.divisions as { name?: unknown; at?: unknown }[])
      .map((x) => ({ name: String(x?.name ?? "").trim().slice(0, 24), at: Math.round(Number(x?.at)) }))
      .filter((x) => x.name && Number.isFinite(x.at))
      .sort((a, b) => a.at - b.at)
    : [];
  const pay = r.pay && typeof r.pay === "object" ? r.pay as { k?: unknown; scale?: unknown } : null;
  const rules: LadderRules = r.rules === "lounge200" ? "lounge200" : "lounge";
  return {
    rules,
    start: int(r.start, 1, 30000, d.start),
    placementEvents: rules === "lounge200" ? 1 : int(r.placementEvents, 0, 10, d.placementEvents),
    placement: rules === "lounge200" ? cleanPlacement(r.placement) : null,
    divisions: divisions.length ? divisions.slice(0, 30) : d.divisions,
    pay: pay ? { k: int(pay.k, 1, 400, d.pay?.k ?? 40), scale: int(pay.scale, 500, 20000, d.pay?.scale ?? 7000) } : d.pay,
    staff: cleanStaff(r.staff),
    discipline: cleanDiscipline(r.discipline),
    roles: cleanRoles(r.roles),
  };
}

function cleanPlacement(raw: unknown): ScorePlacement {
  const r = (raw && typeof raw === "object" ? raw : {}) as { steps?: unknown; tierExtra?: unknown; countZero?: unknown };
  const steps = Array.isArray(r.steps)
    ? (r.steps as { score?: unknown; mmr?: unknown }[]).map((x) => ({ score: int(x?.score, 0, 200, -1), mmr: int(x?.mmr, 1, 30000, -1) })).filter((x) => x.score >= 0 && x.mmr > 0).slice(0, 10)
    : [];
  const extra: Record<string, number> = {};
  if (r.tierExtra && typeof r.tierExtra === "object") for (const [k, v] of Object.entries(r.tierExtra as Record<string, unknown>).slice(0, 12)) extra[k.trim().toLowerCase().slice(0, 12)] = int(v, 0, 100, 0);
  return {
    steps: steps.length ? steps.sort((a, b) => b.score - a.score) : [{ score: 110, mmr: 5250 }, { score: 80, mmr: 3750 }, { score: 50, mmr: 2250 }, { score: 0, mmr: 1000 }],
    tierExtra: steps.length ? extra : { c: 10 },
    countZero: r.countZero !== false,
  };
}

/** A ladder's address: lowercase letters, digits and dashes. */
export function cleanSlug(v: unknown): string | null {
  const s = String(v ?? "").trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/-{2,}/g, "-").replace(/^-|-$/g, "");
  return /^[a-z0-9][a-z0-9-]{0,30}[a-z0-9]$/.test(s) ? s : null;
}

/**
 * The product's name (Britton, 2026-11-01: "GS Ranked sounds good for now, we can roll with that"). Kept here so a
 * rename is one change: the line under a lounge's name, the Discord command and the pages' address. The code keeps
 * calling a lounge's ranked board a ladder.
 */
export const RANKED = { name: "GS Ranked", line: "Ranked on GameShuffle", command: "ranked", base: "/ranked" } as const;
export const RANKED_CMD = `/${RANKED.command}`;

export const ladderPath = (slug: string) => `${RANKED.base}/${slug}`;
export const ladderPlayerPath = (slug: string, name: string) => `${RANKED.base}/${slug}/players/${encodeURIComponent(name)}`;
export const ladderTablePath = (slug: string, n: number) => `${RANKED.base}/${slug}/tables/${n}`;
export const ladderStaffPath = (slug: string) => `${RANKED.base}/${slug}/staff`;
