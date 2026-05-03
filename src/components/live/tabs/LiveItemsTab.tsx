"use client";

/**
 * Items tab — round-based item-mode history for the current session.
 *
 * Per the live-page reorganization: shows a chronological list of
 * "rounds" (newest first). Each round is one item-mode roll moment —
 * either a `!gs-items` direct fire OR the lobby-mode chosen for a
 * `!gs-race` series. The card surfaces every curated item in the
 * rolled mode, so viewers see exactly what's in the box.
 *
 * Round bucketing rules (mirrors how race.ts assigns modes):
 *   - A `!gs-items` direct fire emits one items_randomized event with
 *     a preset_id + literal_item_ids → its own round.
 *   - A `!gs-race [N]` series emits N race_randomized events, all
 *     sharing the same preset_id (mode is a lobby setting per series).
 *     Collapses into one round.
 *   - A standalone `!gs-track` doesn't carry a preset_id → skipped.
 */

import { useMemo } from "react";
import Image from "next/image";
import {
  getItemById,
  getItemModeById,
  type Item,
  type RaceGame,
} from "@/lib/randomizers/race";
import { getImagePath } from "@/lib/images";
import { useLiveState } from "../RealtimeLiveView";

interface LiveItemsTabProps {
  game: RaceGame | null;
  /** Reserved for future tactile actions on the rounds (e.g. "rerun
   *  this mode"). Not used today. */
  requestAction?: unknown;
}

interface RoundEntry {
  /** Stable key — first event id in the round. */
  key: string;
  /** 1-based round number (chronological). Display newest-first. */
  number: number;
  presetId: string;
  /** Mode display name. Falls back to event payload when the catalog
   *  lookup fails (e.g. game changed between sessions). */
  presetName: string;
  /** Resolved item list for the mode. May be empty if the mode has no
   *  catalog entry but the event still carries literal_item_ids — we
   *  fall back to those ids directly. */
  items: Item[];
  /** Direct-roll flag for cards that came from `!gs-items` rather than
   *  a race series (rendered with a small "Items roll" label). */
  source: "items_command" | "race_series";
  /** Race-series total when the round came from a series — used to
   *  render the "covers Series N — N races" subline. */
  raceCount: number;
  startedAt: string;
}

const PRESET_EVENT_TYPES = new Set(["items_randomized", "race_randomized"]);

export function LiveItemsTab({ game }: LiveItemsTabProps) {
  const live = useLiveState();
  const rounds = useMemo(
    () => groupRoundsFromEvents(live.events, game),
    [live.events, game]
  );

  if (rounds.length === 0) {
    return (
      <div className="live-items__empty">
        <p className="live-items__empty-headline">
          No item rounds rolled yet.
        </p>
        <p className="live-items__empty-sub">
          The streamer rolls item modes from chat with{" "}
          <code>!gs-items</code> or as part of <code>!gs-race</code>.
          Each round shows up here with the full item box.
        </p>
      </div>
    );
  }

  return (
    <div className="live-items">
      <p className="live-items__intro">
        {rounds.length} {rounds.length === 1 ? "round" : "rounds"} rolled
        this session. Newest first.
      </p>
      <ol className="live-items__rounds">
        {rounds.map((round) => (
          <li key={round.key}>
            <RoundCard round={round} />
          </li>
        ))}
      </ol>
    </div>
  );
}

function RoundCard({ round }: { round: RoundEntry }) {
  const subline =
    round.source === "race_series"
      ? round.raceCount > 1
        ? `${round.raceCount}-race series`
        : "Race"
      : "Items roll";
  return (
    <article className="live-items__round">
      <header className="live-items__round-header">
        <div className="live-items__round-meta">
          <span className="live-items__round-number">
            Round {round.number}
          </span>
          <span className="live-items__round-source">{subline}</span>
        </div>
        <h3 className="live-items__round-mode">🎯 {round.presetName}</h3>
      </header>
      {round.items.length > 0 ? (
        <ul className="live-items__round-items">
          {round.items.map((item) => (
            <li key={item.id} className="live-items__item">
              {item.image ? (
                <div className="live-items__item-img">
                  <Image
                    src={getImagePath(item.image)}
                    alt={item.name}
                    width={48}
                    height={48}
                    unoptimized
                  />
                </div>
              ) : (
                <div
                  className="live-items__item-img live-items__item-img--placeholder"
                  aria-hidden
                />
              )}
              <span className="live-items__item-name">{item.name}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="live-items__round-empty">
          No item catalog for this mode — appears in chat only.
        </p>
      )}
    </article>
  );
}

/**
 * Walk events chronologically and bucket each preset_id roll into a
 * round. Consecutive race_randomized events sharing the same preset_id
 * belong to one series-round; a fresh preset_id starts a new round.
 * Standalone items_randomized events are always their own round.
 */
function groupRoundsFromEvents(
  events: { id: string; event_type: string; payload: unknown; created_at: string }[],
  game: RaceGame | null
): RoundEntry[] {
  // Events are newest-first; reverse for chronological walk.
  const chrono = events.slice().reverse();
  const rounds: RoundEntry[] = [];
  let lastRaceSeriesPresetKey: string | null = null;

  for (const e of chrono) {
    if (!PRESET_EVENT_TYPES.has(e.event_type)) continue;
    const payload = (e.payload ?? {}) as {
      preset_id?: string | null;
      preset_name?: string | null;
      series_total?: number | null;
      literal_item_ids?: string[] | null;
    };
    const presetId = payload.preset_id ?? null;
    if (!presetId) continue;

    const isRace = e.event_type === "race_randomized";
    const seriesTotal = payload.series_total ?? 1;

    // Race-series rolls sharing the same preset collapse into the
    // current round. The "key" combines preset id + the round's start
    // time so a new series picking the same preset starts a fresh
    // round (rather than appearing as a continuation of an old one).
    const racePresetKey = isRace ? `race:${presetId}` : null;
    if (
      isRace &&
      racePresetKey &&
      racePresetKey === lastRaceSeriesPresetKey &&
      rounds.length > 0
    ) {
      rounds[rounds.length - 1].raceCount += 1;
      continue;
    }

    const items = resolveModeItems(presetId, payload.literal_item_ids ?? null, game);
    rounds.push({
      key: `round-${e.id}`,
      number: 0, // assigned after the chronological pass
      presetId,
      presetName:
        payload.preset_name ??
        getItemModeById(presetId, game ?? undefined)?.name ??
        presetId,
      items,
      source: isRace ? "race_series" : "items_command",
      raceCount: isRace ? 1 : seriesTotal,
      startedAt: e.created_at,
    });
    lastRaceSeriesPresetKey = racePresetKey;
  }

  rounds.forEach((r, i) => {
    r.number = i + 1;
  });
  return rounds.slice().reverse(); // newest-first for render
}

/** Resolve the items for a mode. Prefer the catalog lookup; fall back
 *  to the event's literal_item_ids when the mode isn't in the
 *  catalog (e.g. legacy session pre themed-modes ship). */
function resolveModeItems(
  presetId: string,
  literalIds: string[] | null,
  game: RaceGame | null
): Item[] {
  const mode = getItemModeById(presetId, game ?? undefined);
  const ids = mode?.items ?? literalIds ?? [];
  const out: Item[] = [];
  for (const id of ids) {
    const item = getItemById(id, game ?? undefined);
    if (item) out.push(item);
  }
  return out;
}
