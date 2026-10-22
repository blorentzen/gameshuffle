/**
 * The Rolling layout (pure, client-safe; rolling picks 2026-10-21, all as recommended): the MMR
 * card's fifth layout shows one piece at a time and moves to the next on a timer. The slides are
 * the look's pieces (pieces.ts) in the look's order, using its switches; GS Pro's own order and
 * own line are slides too.
 *   Shapes (free): Bar (a lower third), Box (square), Tall (9:16).
 *   Name and emblem: stay on the card (pinned beside or above the slides), or roll as the first slide.
 *   Motions (free): Slide up (the default), Slide across, Flip, Fade, Deal, Ticker (every piece in one
 *     moving line: across on the bar, up on the box and tall).
 *   Each slide: 4, 6, 8 or 12 seconds (6 to start). GS Pro: a time per slide.
 *   Progress: dots, a thin line filling over the slide's time, or none.
 * When the number changes the card jumps to the MMR slide, plays the change, holds it, then carries
 * on from the slide it left (`resumeAfter`). If the MMR slide is off, the change plays on a
 * temporary one.
 */

import { MMR_GAMES, fmtMmr, signed, type MmrView } from "./rules";
import { pieceOrder, pieceText, topText, type MmrInfo, type MmrPiece } from "./pieces";
import { countryName } from "@/lib/lounge/countries";
import type { GoalProgress } from "./goal";

export type RollShape = "bar" | "box" | "tall";
export type RollMotion = "up" | "across" | "flip" | "fade" | "deal" | "ticker";
export type RollSecs = 4 | 6 | 8 | 12;
export type RollProgress = "dots" | "line" | "none";
/** A slide: a piece, or the player's name and emblem ("id") when they roll with the rest. */
export type RollSlide = MmrPiece | "id";

export interface MmrRolling {
  shape: RollShape;
  /** True: the emblem, name and division stay on the card. False: they're the first slide. */
  pin: boolean;
  motion: RollMotion;
  secs: RollSecs;
  /** GS Pro: a time per slide (null = every slide uses `secs`). */
  perSlide: Partial<Record<RollSlide, RollSecs>> | null;
  progress: RollProgress;
}

export const DEFAULT_ROLLING: MmrRolling = { shape: "bar", pin: true, motion: "up", secs: 6, perSlide: null, progress: "dots" };

export const ROLL_SHAPES: { v: RollShape; label: string }[] = [{ v: "bar", label: "Bar" }, { v: "box", label: "Box" }, { v: "tall", label: "Tall" }];
export const ROLL_MOTIONS: { v: RollMotion; label: string }[] = [
  { v: "up", label: "Slide up" }, { v: "across", label: "Slide across" }, { v: "flip", label: "Flip" },
  { v: "fade", label: "Fade" }, { v: "deal", label: "Deal" }, { v: "ticker", label: "Ticker" },
];
export const ROLL_SECS: RollSecs[] = [4, 6, 8, 12];
export const ROLL_PROGRESS: { v: RollProgress; label: string }[] = [{ v: "dots", label: "Dots" }, { v: "line", label: "Line" }, { v: "none", label: "None" }];

/** The pieces that can be slides. Name, flag, game and division make up the "id" slide or the pinned
 *  head (and the game rides under the MMR); the last change is a chip beside the MMR. */
export const ROLL_PIECES: MmrPiece[] = ["line", "mmr", "world", "country", "top", "peak", "progress", "tonight", "streak", "goal", "last10", "recent", "events", "avg"];

/** How long a slide's motion takes, and how long the change holds on the MMR slide. */
export const ROLL_MOVE_MS = 650;
export const ROLL_HOLD_MS = 5200;

const pickOne = <T extends string | number>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback);

/** Rolling settings from untrusted input, with safe defaults. */
export function cleanRolling(raw: unknown): MmrRolling {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_ROLLING;
  let perSlide: MmrRolling["perSlide"] = null;
  if (r.perSlide && typeof r.perSlide === "object") {
    const entries = Object.entries(r.perSlide as Record<string, unknown>)
      .filter(([k, v]) => (k === "id" || (ROLL_PIECES as string[]).includes(k)) && ROLL_SECS.includes(v as RollSecs));
    if (entries.length) perSlide = Object.fromEntries(entries) as MmrRolling["perSlide"];
  }
  const secs = pickOne(r.secs, ROLL_SECS, d.secs);
  // A time per slide that matches the usual time is no time of its own.
  if (perSlide) {
    for (const k of Object.keys(perSlide) as RollSlide[]) if (perSlide[k] === secs) delete perSlide[k];
    if (!Object.keys(perSlide).length) perSlide = null;
  }
  return {
    shape: pickOne(r.shape, ["bar", "box", "tall"] as const, d.shape),
    pin: r.pin !== false,
    motion: pickOne(r.motion, ["up", "across", "flip", "fade", "deal", "ticker"] as const, d.motion),
    secs,
    perSlide,
    progress: pickOne(r.progress, ["dots", "line", "none"] as const, d.progress),
  };
}

/** The GS Pro choices in the rolling settings, by label. */
export const proRollingUsed = (r: MmrRolling): string[] => (r.perSlide && Object.keys(r.perSlide).length ? ["A time per slide"] : []);

/** A free card: one time for every slide (the per-slide times are dropped). */
export const freeRolling = (r: MmrRolling): MmrRolling => ({ ...r, perSlide: null });

/** The slides in order: the "id" slide first when the name and emblem roll, then each piece that's on
 *  and has something to show, in the look's order. Never empty: the MMR slide stands in. */
export function rollSlides(info: MmrInfo, rolling: Pick<MmrRolling, "pin">, has: (p: MmrPiece) => boolean, idShown = true): RollSlide[] {
  const out: RollSlide[] = [];
  if (!rolling.pin && idShown) out.push("id");
  for (const p of pieceOrder(info)) if (ROLL_PIECES.includes(p) && info.on[p] && has(p)) out.push(p);
  return out.length ? out : ["mmr"];
}

/** How long a slide stays up, in seconds (GS Pro's time for that slide, else the usual). */
export const slideSecs = (r: Pick<MmrRolling, "secs" | "perSlide">, slide: RollSlide): RollSecs => r.perSlide?.[slide] ?? r.secs;

/** One full turn through the slides, in seconds. */
export const rollRound = (r: Pick<MmrRolling, "secs" | "perSlide">, slides: RollSlide[]) => slides.reduce((n, s) => n + slideSecs(r, s), 0);

/** The next slide after `at`, wrapping round. */
export const nextSlide = (slides: RollSlide[], at: number) => (slides.length ? (at + 1) % slides.length : 0);

/** Where a change jumps: the MMR slide's place, or -1 when the MMR slide is off (it plays on a temporary one). */
export const jumpTarget = (slides: RollSlide[]) => slides.indexOf("mmr");

/** Where the card carries on after a change: the slide it left, or the next one when it was already on the MMR slide. */
export function resumeAfter(slides: RollSlide[], left: number): number {
  if (!slides.length) return 0;
  const at = Math.min(Math.max(0, left), slides.length - 1);
  return slides[at] === "mmr" ? nextSlide(slides, at) : at;
}

/** A slide as words: a small label, the big value and a line under it (the card adds bars, squares and rows). */
export interface SlideText { label: string; value: string; sub: string | null }

const dateWord = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Los_Angeles" });

/** Each slide's words. Nothing repeats what another slide that's on already says. */
export function slideText(s: RollSlide, v: MmrView, info: MmrInfo, goal: GoalProgress | null): SlideText | null {
  const t = s === "id" ? null : pieceText(s, v, info, goal);
  const game = info.on.game ? MMR_GAMES[v.game].short : null;
  switch (s) {
    case "id": return { label: "", value: v.name, sub: v.division };
    case "mmr": return { label: "MMR", value: v.mmr != null ? fmtMmr(v.mmr) : "?", sub: game };
    case "world": {
      if (!t) return null;
      const top = !info.on.top ? topText(v.worldRank, v.totalPlayers) : null;
      return { label: "World rank", value: t.value, sub: top ? `${top} of the lounge` : null };
    }
    case "country": return t && v.country ? { label: "Country rank", value: t.value, sub: `in ${countryName(v.country)}` } : null;
    case "top": return t ? { label: "Top %", value: t.value, sub: v.totalPlayers ? `of ${fmtMmr(v.totalPlayers)} players this season` : null } : null;
    case "peak": return t ? { label: "Season peak", value: t.value, sub: v.peakAt ? `Set on ${dateWord(v.peakAt)}` : null } : null;
    case "progress": return t ? { label: t.label, value: t.value, sub: null } : null;
    case "tonight": {
      const n = v.tonight;
      const sub = n.events ? `${n.w} ${n.w === 1 ? "win" : "wins"}, ${n.l} ${n.l === 1 ? "loss" : "losses"}` : "No events yet";
      return { label: "Tonight", value: signed(n.delta), sub };
    }
    case "streak": return t ? { label: "Win streak", value: `${v.streak} in a row`, sub: null } : null;
    case "goal": return goal ? { label: "Tonight's goal", value: fmtMmr(goal.goal), sub: goal.reached ? "Reached" : `${fmtMmr(goal.toGo)} to go` } : null;
    case "last10": {
      if (!t) return null;
      const w = v.squares.filter((q) => q !== "l").length;
      return { label: "Last 10", value: "", sub: `${w} up, ${v.squares.length - w} down` };
    }
    case "recent": return t ? { label: "Recent events", value: "", sub: null } : null;
    case "events": return t ? { label: "This season", value: `${fmtMmr(v.season.events)} ${v.season.events === 1 ? "event" : "events"}`, sub: `${Math.round((v.season.wins / v.season.events) * 100)}% won` } : null;
    case "avg": return t ? { label: "Average score", value: t.value, sub: "per event this season" } : null;
    case "line": return t ? { label: "", value: t.value, sub: null } : null;
    default: return null;
  }
}
