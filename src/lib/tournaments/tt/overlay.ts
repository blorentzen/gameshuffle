/**
 * The time trial piece on a streamer's GameShuffle overlay (TT picks 10A, "Live hour on stream"): the event's track
 * or round, the time left, and the standings with the streamer's own row lit up. For Swiss and brackets decided by
 * time trial, the streamer's own match (or, for an organizer, the matches in play or the Swiss standings). The piece
 * reads this small view from /api/tournament/[id]/tt/overlay every few seconds. Client-safe.
 */

export interface TtOverlayRow {
  key: string;
  /** "1", "=2", "–" (no time yet), or "" for match rows. */
  place: string;
  name: string;
  /** A time, a total, points, a record or tracks won. */
  value: string;
  you: boolean;
  /** The last row that moves on: a line goes under it. */
  cut?: boolean;
}

export interface TtOverlayData {
  /** The small line on top: the tournament's name. */
  title: string;
  /** The big line: the track, the round and group, or the match. */
  head: string;
  /** Counts down to this when set (the window, the round clock). */
  closesAt: string | null;
  rows: TtOverlayRow[];
  /** One line under the rows: who moves on, a clip waiting, the tracks. */
  line: string | null;
  /** "/tournament/<id>", printed as gameshuffle.co/… at the foot. */
  path: string;
  /** Server time, so a countdown doesn't drift with the streaming PC's clock. */
  now: number;
}

/** The layout editor's preview: a live hour on Rainbow Road. */
export const TT_OVERLAY_SAMPLE: TtOverlayData = {
  title: "Friday Live Hour",
  head: "Rainbow Road",
  closesAt: null,
  rows: [
    { key: "1", place: "1", name: "Sam", value: "2:27.118", you: false },
    { key: "2", place: "2", name: "Riley", value: "2:28.004", you: true },
    { key: "3", place: "3", name: "Jordan", value: "2:29.561", you: false },
    { key: "4", place: "4", name: "Mika", value: "2:31.930", you: false },
  ],
  line: "Add a time with /tt add in Discord",
  path: "/tournament/friday-live-hour",
  now: 0,
};
