/**
 * Modes (lounge system picks 2026-11-01, https://claude.ai/artifact/1nWqceDvxZpTToXyaem9vm, pick 1A): one choice at
 * setup that sets the divisions, the MMR rules, placement, room size and formats. Staff can change any of them after.
 * Pure, client-safe.
 *
 *   mk8dx150  Mario Kart 8 Deluxe 150cc: MKCentral's divisions and model (the scale our MMR card reads), so a player
 *             coming from MKCentral can start at their own number (mkcMatch.ts).
 *   mk8dx200  Mario Kart 8 Deluxe 200cc: the 200 Lounge rules and divisions (lounge200.ts).
 *   mkw12     Mario Kart World, 12 players: MKCentral's MK World divisions and model.
 *   mkw24     Mario Kart World, 24 players: the same for 24-player rooms.
 *   knockout  Knockout Tour: 24 places by elimination order, its own pay (types.ts KNOCKOUT_PAY).
 */

import { FALLBACK_RANKS } from "@/lib/mmr/rules";
import { LOUNGE200_DIVISIONS, LOUNGE200_PLACEMENT } from "./lounge200";
import { DEFAULT_STAFF, KNOCKOUT_PAY, type LadderGame, type LadderKind, type LadderSettings } from "./types";
import { DEFAULT_DISCIPLINE } from "./discipline";

export type LadderMode = "mk8dx150" | "mk8dx200" | "mkw12" | "mkw24" | "knockout";

export interface ModeInfo {
  id: LadderMode;
  label: string;
  /** One short line for the setup choice. */
  note: string;
  game: LadderGame;
  kind: LadderKind;
  size: 12 | 24;
  formats: number[];
  /** Same scale as an MKCentral lounge game: a player coming over can start at their MKCentral MMR. */
  mkcGame: "mk8dx" | "mkworld12p" | "mkworld24p";
  sameScaleAsMkc: boolean;
}

export const MODES: Record<LadderMode, ModeInfo> = {
  mk8dx150: { id: "mk8dx150", label: "Mario Kart 8 Deluxe 150cc", note: "MKCentral's divisions and model", game: "mk8dx", kind: "race", size: 12, formats: [1, 2, 3, 4, 6], mkcGame: "mk8dx", sameScaleAsMkc: true },
  mk8dx200: { id: "mk8dx200", label: "Mario Kart 8 Deluxe 200cc", note: "200 Lounge rules", game: "mk8dx", kind: "race", size: 12, formats: [1, 2, 3, 4, 6], mkcGame: "mk8dx", sameScaleAsMkc: false },
  mkw12: { id: "mkw12", label: "Mario Kart World, 12 players", note: "MKCentral's MK World divisions and model", game: "mkworld", kind: "race", size: 12, formats: [1, 2, 3, 4, 6], mkcGame: "mkworld12p", sameScaleAsMkc: true },
  mkw24: { id: "mkw24", label: "Mario Kart World, 24 players", note: "MKCentral's 24-player divisions and model", game: "mkworld", kind: "race", size: 24, formats: [1, 2, 3, 4, 6], mkcGame: "mkworld24p", sameScaleAsMkc: true },
  knockout: { id: "knockout", label: "Knockout Tour", note: "24 places by elimination order", game: "mkworld", kind: "knockout", size: 24, formats: [1], mkcGame: "mkworld24p", sameScaleAsMkc: false },
};
export const MODE_LIST: LadderMode[] = ["mk8dx150", "mk8dx200", "mkw12", "mkw24", "knockout"];
export const isMode = (v: unknown): v is LadderMode => typeof v === "string" && v in MODES;

const steps = (ranks: Record<string, number>) => Object.entries(ranks).map(([name, at]) => ({ name, at })).sort((a, b) => a.at - b.at);

/** The settings a mode starts with (staff can change any of them after). */
export function modeSettings(mode: LadderMode): LadderSettings {
  switch (mode) {
    case "mk8dx200":
      return { rules: "lounge200", start: 2000, placementEvents: 1, placement: LOUNGE200_PLACEMENT, divisions: LOUNGE200_DIVISIONS, pay: null, staff: DEFAULT_STAFF, discipline: DEFAULT_DISCIPLINE, roles: { on: false, ids: {} } };
    case "mkw12":
      return { rules: "lounge", start: 2000, placementEvents: 5, placement: null, divisions: steps(FALLBACK_RANKS.mkworld12p), pay: null, staff: DEFAULT_STAFF, discipline: DEFAULT_DISCIPLINE, roles: { on: false, ids: {} } };
    case "mkw24":
      return { rules: "lounge", start: 2000, placementEvents: 5, placement: null, divisions: steps(FALLBACK_RANKS.mkworld24p), pay: null, staff: DEFAULT_STAFF, discipline: DEFAULT_DISCIPLINE, roles: { on: false, ids: {} } };
    case "knockout":
      return { rules: "lounge", start: 2000, placementEvents: 5, placement: null, divisions: steps(FALLBACK_RANKS.mkworld24p), pay: KNOCKOUT_PAY, staff: DEFAULT_STAFF, discipline: DEFAULT_DISCIPLINE, roles: { on: false, ids: {} } };
    default:
      return { rules: "lounge", start: 2000, placementEvents: 5, placement: null, divisions: steps(FALLBACK_RANKS.mk8dx), pay: null, staff: DEFAULT_STAFF, discipline: DEFAULT_DISCIPLINE, roles: { on: false, ids: {} } };
  }
}

/** The mode a ladder looks like it's in (for ladders made before modes, from game, kind and rules). */
export function modeOf(l: { game: LadderGame; kind: LadderKind; settings: Pick<LadderSettings, "rules"> }, size: 12 | 24 = 12): LadderMode {
  if (l.kind === "knockout") return "knockout";
  if (l.game === "mk8dx") return l.settings.rules === "lounge200" ? "mk8dx200" : "mk8dx150";
  return size === 24 ? "mkw24" : "mkw12";
}
