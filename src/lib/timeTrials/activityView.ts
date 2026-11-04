/**
 * The War room's Time trials tab (GameShuffle Competitive's Activity; app screen pick 2A on
 * https://claude.ai/artifact/5v2cNHwvZ4kh1E8EdzAzph: the whole board with your gaps, plus Add a time).
 * Client-safe shapes; the server builds them in src/lib/timeTrials/activity.ts.
 */

import type { TtClass, TtGame } from "./tracks";
import type { TtItems } from "./categories";

export interface TtRoomRow {
  id: string;
  code: string | null;
  name: string;
  cup: string;
  /** Course picture through the Activity's own address, or null. */
  image: string | null;
  /** The server's best on this board, or null when nobody in the server has a time. */
  record: { ms: number; name: string; mine: boolean; checked: boolean } | null;
  /** The viewer's own best on this board, or null. */
  mine: number | null;
}

export interface TtRoomView {
  game: TtGame;
  cc: TtClass;
  items: TtItems;
  /** The classes this game's boards have (World has one). */
  classes: TtClass[];
  /** The server's name when the Activity was opened in a server. */
  server: string | null;
  rows: TtRoomRow[];
  /** Tracks with a server record, and tracks where the viewer has a time. */
  withRecord: number;
  withMine: number;
  /** The server's board on GameShuffle, or null outside a server. */
  boardUrl: string | null;
  /** Screenshot reads left today. */
  readsLeft: number;
}

/** What a dropped screenshot read as, for the player to check before saving. */
export interface TtRoomRead {
  proofUrl: string;
  /** The screenshot through the Activity's own address (Discord loads nothing else), or null. */
  preview: string | null;
  /** Signed note of what the screen showed (the add route checks it, so a read can't be made up). */
  token: string;
  game: TtGame | null;
  track: string | null;
  cc: TtClass | null;
  timeMs: number | null;
  notResult: boolean;
  readsLeft: number;
}

/** After a time is saved. */
export interface TtRoomSaved {
  best: boolean;
  previousMs: number | null;
  place: number;
  total: number;
  server: { place: number; total: number } | null;
  /** A top-ten time waiting for its clip. */
  needsVideo: boolean;
  /** The server's record fell and was posted in the panel channel. */
  recordPosted: boolean;
}
