/**
 * What the profile card shows (round two picks 4A, 2026-11-06): the profile version of the MMR card always has the
 * number and division; each look also says whether it shows world rank, season peak, GameShuffle points this month,
 * the last ten events and a win streak. The studio's "On your profile" tab sets them; the profile page and the
 * studio's preview both build the rows here. Pure and client-safe.
 */

import type { MmrView } from "./rules";
import type { MmrLook } from "./look";
import { PIECE_IDS } from "./pieces";

/** The card pieces the profile version draws itself: name, division, the last change and tonight's goal. */
const PROFILE_PIECES = new Set<string>(["name", "division", "delta", "goal"]);

/** The look as the profile draws it: its colors, background, emblem and font, with the profile's own pieces (the
 *  rows under the number come from `profile`). Shared by the profile page and the studio's preview. */
export function profileLook(look: MmrLook): MmrLook {
  const on = Object.fromEntries(PIECE_IDS.map((id) => [id, PROFILE_PIECES.has(id)])) as MmrLook["info"]["on"];
  return { ...look, layout: "sticker", brand: "off", info: { ...look.info, on } };
}

export interface MmrProfileShow {
  world: boolean;
  peak: boolean;
  points: boolean;
  last10: boolean;
  streak: boolean;
}

/** Number and division always; world rank and peak on to start (the picks' defaults). */
export const DEFAULT_PROFILE_SHOW: MmrProfileShow = { world: true, peak: true, points: false, last10: false, streak: false };

export const PROFILE_SHOW_CHOICES: { id: keyof MmrProfileShow; label: string; note?: string }[] = [
  { id: "world", label: "World rank" },
  { id: "peak", label: "Season peak" },
  { id: "points", label: "GameShuffle points this month", note: "Shows once you have points from live nights this month." },
  { id: "last10", label: "Last ten events" },
  { id: "streak", label: "Win streak", note: "Shows from two wins in a row." },
];

export function cleanProfileShow(raw: unknown): MmrProfileShow {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out = { ...DEFAULT_PROFILE_SHOW };
  for (const k of Object.keys(out) as (keyof MmrProfileShow)[]) if (typeof r[k] === "boolean") out[k] = r[k] as boolean;
  return out;
}

export interface ProfileRow { label: string; value: string; href?: string | null }

/** The rows under the number, in a fixed order; a switched-on row with nothing to say is left out. */
export function profileRows(view: MmrView, show: MmrProfileShow, points?: { label: string; points: number; href?: string | null } | null): ProfileRow[] {
  const rows: ProfileRow[] = [];
  if (show.world && view.worldRank) rows.push({ label: "World", value: `#${view.worldRank.toLocaleString("en-US")}` });
  if (show.peak && view.peak) rows.push({ label: "Season peak", value: view.peak.toLocaleString("en-US") });
  if (show.streak && view.streak >= 2) rows.push({ label: "Win streak", value: `${view.streak} wins` });
  if (show.points && points && points.points > 0) rows.push({ label: "GameShuffle this month", value: `${points.label} · ${points.points.toLocaleString("en-US")} points`, href: points.href ?? null });
  return rows;
}
