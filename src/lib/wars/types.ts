/** What the war overlay reads (client-safe): /api/war/live/<token>. */

import type { WarGame, WarSide } from "./rules";
import type { WarLook } from "./look";

export interface WarLiveTeam { tag: string; name: string | null; logo: string | null; total: number; /** For the Team colors look. */ color: string }

export interface WarLiveData {
  id: string;
  status: "live" | "done" | "ended";
  game: WarGame;
  racesTotal: number;
  us: WarLiveTeam;
  them: WarLiveTeam;
  /** Each race's swing for `us`, in order. */
  diffs: number[];
  played: number;
  left: number;
  decided: WarSide | null;
  need: { side: WarSide; avg: number } | null;
  /** The newest race: its number, track code, swing and our places. */
  last: { n: number; track: string | null; diff: number; spots: number[] } | null;
  /** A penalty given since the newest race (shown in the line for one race). */
  penalty: { side: WarSide; points: number; reason: string } | null;
  updatedAt: string;
}

/** `war` is null between wars (none yet, or the last one finished a while ago). `look`: the saved look asked for. */
export type WarLiveResult = { ok: true; war: WarLiveData | null; look?: WarLook | null } | { ok: false };
