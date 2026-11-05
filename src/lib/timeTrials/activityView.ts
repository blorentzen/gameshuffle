/**
 * The War room's Time trials tab (GameShuffle Competitive's Activity; app screen pick 2A on
 * https://claude.ai/artifact/5v2cNHwvZ4kh1E8EdzAzph: the whole board with your gaps, plus Add a time).
 * Client-safe shapes; the server builds them in src/lib/timeTrials/activity.ts.
 */

import type { TtClass, TtGame } from "./tracks";
import type { TtItems, TtVehicle } from "./categories";

/** Whose times a board shows: the server's players, or everyone on GameShuffle. */
export type TtRoomScope = "server" | "everyone";

export interface TtRoomRow {
  id: string;
  code: string | null;
  name: string;
  cup: string;
  /** Course picture through the Activity's own address, or null. */
  image: string | null;
  /** The board's best (the server's or everyone's, by the view's scope), or null when nobody has a time. */
  record: { ms: number; name: string; mine: boolean; checked: boolean } | null;
  /** The viewer's own best on this board, or null. */
  mine: number | null;
}

export interface TtRoomView {
  game: TtGame;
  cc: TtClass;
  items: TtItems;
  /** Whose records the rows show; `canServer` is false outside a server (everyone only). */
  scope: TtRoomScope;
  canServer: boolean;
  /** The vehicle board ("any" = the open board) and the boards this game has. */
  vehicle: TtVehicle;
  vehicles: { id: TtVehicle; label: string }[];
  /** The classes this game's boards have (World has one). */
  classes: TtClass[];
  /** The server's name when the Activity was opened in a server. */
  server: string | null;
  rows: TtRoomRow[];
  /** Tracks with a server record, and tracks where the viewer has a time. */
  withRecord: number;
  withMine: number;
  /** These boards on GameShuffle (the server's page for This server, the game's boards for Everyone). */
  boardUrl: string;
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
