/**
 * Client-safe shapes for levels from players (picks 2026-11-11): the streamer's queue on the dashboard, the overlay
 * piece, and the board in each game's space.
 */

import type { LevelGame, QueueGame } from "./games";
import type { LevelResult, MarkOutcome, SeedEdition, SeedSpot } from "./rules";

export interface QueueEntryView {
  id: string;
  game: QueueGame;
  code: string;
  from: string;
  /** Its name on the board, when someone shared it there. */
  title: string | null;
  result: LevelResult | null;
  addedAt: string;
  playedAt: string | null;
  /** Tokens its sender got as a thank-you (null = none). */
  thanked: number | null;
}

/** The streamer's queue as the dashboard and control room read it. */
export interface QueueView {
  /** The tables exist (supabase/levels-m1.sql). */
  ready: boolean;
  pro: boolean;
  /** Twitch is connected (chat is how viewers add levels). */
  twitch: boolean;
  status: "open" | "closed";
  /** The game the queue takes now (the one on stream when it's a level game, else `picked`). */
  game: QueueGame;
  /** The dashboard's pick. */
  picked: QueueGame;
  /** The games the dashboard can pick (Geometry Dash once supabase/levels-m2.sql has run). */
  games: QueueGame[];
  /** The level game on stream (Twitch category), or null. */
  onStream: QueueGame | null;
  /** The Twitch category's name when it isn't one of the three (shown on the dashboard), or null. */
  category: string | null;
  thanks: number;
  now: QueueEntryView | null;
  line: QueueEntryView[];
  /** Levels waiting for another game (they come back when it's on). */
  held: number;
  /** Played this stream, newest first. */
  played: QueueEntryView[];
}

/** The overlay's Level queue piece. */
export interface LevelQueueOverlayData {
  game: QueueGame;
  open: boolean;
  now: { code: string; from: string; title: string | null } | null;
  next: string[];
  waiting: number;
}

/** A level's card on the board. */
export interface LevelCardView {
  id: string;
  game: LevelGame;
  code: string;
  title: string;
  tags: string[];
  by: { name: string; username: string | null };
  createdAt: string;
  /** Where it was played and how it went ("Cleared on Nova's stream"), or null. */
  played: string | null;
  plays: number;
  isNew: boolean;
  /** The viewer shared it (or is staff): they can take it down. */
  canRemove: boolean;
  /** With the curation tables (supabase/levels-m2.sql); absent before. */
  curation?: LevelCuration;
  /** A Minecraft seed's world. */
  seed?: { edition: SeedEdition | null; version: string | null; note: string | null; spots: SeedSpot[] };
}

/** What the curation picks add to a card. */
export interface LevelCuration {
  likes: number;
  likesWeek: number;
  /** "Cleared by 4 of 18" once it has 5 marks, else null (the tags say how hard it is until then). */
  clears: string | null;
  mayNotWork: boolean;
  /** The viewer's own mark and like. */
  mine: { outcome: MarkOutcome | null; liked: boolean };
  /** A GameShuffle pick, with its note. */
  pick: string | null;
  /** The weeks it was level of the week ("Nov 9"), newest first. */
  weeks: string[];
  /** The sharer's Mario Maker 2 maker ID, shown on their levels. */
  makerId: string | null;
  /** Hidden after three reports until staff look (only staff see it on the board). */
  held: boolean;
}

/** A list of levels. */
export interface LevelListView {
  id: string;
  game: LevelGame;
  title: string;
  public: boolean;
  featured: boolean;
  by: { name: string; username: string | null };
  mine: boolean;
  count: number;
  updatedAt: string;
}

/** Everything a board needs beyond its cards (curation picks). */
export interface BoardExtras {
  curation: boolean;
  /** GameShuffle picks, shown first. */
  picks: LevelCardView[];
  /** This week's level of the week. */
  week: LevelCardView | null;
  /** The viewer: staff can pin and pick; GS Pro streamers can add to their queue. */
  viewer: { signedIn: boolean; staff: boolean; queue: boolean };
  /** The viewer's own lists in this game (for "Add to a list"). */
  myLists: { id: string; title: string; count: number }[];
}
