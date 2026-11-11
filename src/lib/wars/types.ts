/** What the war overlay reads (client-safe): /api/war/live/<token>. */

import type { WarGame, WarSide } from "./rules";
import type { WarLook } from "./look";

export interface WarLiveTeam { tag: string; name: string | null; logo: string | null; total: number; /** For the Team colors look. */ color: string }

export interface WarLiveData {
  id: string;
  status: "live" | "done" | "ended";
  game: WarGame;
  racesTotal: number;
  /** Players in the room (12 for 6v6) and teams in it. */
  room?: number;
  teams?: number;
  /** Your team's place among the teams (several teams). */
  rank?: number;
  us: WarLiveTeam;
  /** The other team, or with several teams the leader (the team right behind you when you lead). */
  them: WarLiveTeam;
  /** Each race's swing for `us`, in order. */
  diffs: number[];
  played: number;
  left: number;
  decided: WarSide | null;
  need: { side: WarSide; avg: number } | null;
  /** The newest race: its number, track code, swing and our places (and `them`'s; none for a race carried over with only points). */
  last: { n: number; track: string | null; diff: number; spots: number[]; theirs?: number[] } | null;
  /** A penalty given since the newest race (shown in the line for one race); `name` is the team it's on. */
  penalty: { side: WarSide; points: number; reason: string; name?: string } | null;
  updatedAt: string;
}

/** `war` is null between wars (none yet, or the last one finished a while ago). `look`: the saved look asked for. */
export type WarLiveResult = { ok: true; war: WarLiveData | null; look?: WarLook | null } | { ok: false };
