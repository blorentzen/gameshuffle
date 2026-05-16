"use client";

/**
 * Races tab — series-grouped race history for the current session.
 *
 * Reads `useLiveState().events` (kept fresh by the live-events-{id}
 * realtime channel) and groups by series_total/series_index payload
 * fields the race-randomizer handlers attach to every roll. Each row
 * is one series; races inside a series lay out horizontally so viewers
 * can scan "Series 3 was these 4 tracks" at a glance.
 *
 * Data sources:
 *   - `race_randomized` events (track + items mode in one roll)
 *   - `track_randomized` events (track-only via !gs-track)
 *   - Both carry { series_index, series_total, track_id, track_name,
 *     cup, preset_id, preset_name } payloads.
 *
 * Single rolls (series_total === 1) render as their own one-race
 * "series" so the timeline reads consistently.
 */

import { useMemo } from "react";
import Image from "next/image";
import {
  getRallyById,
  getTrackById,
  type RaceGame,
  type Track,
  type Rally,
} from "@/lib/randomizers/race";
import { getImagePath } from "@/lib/images";
import { useLiveState } from "../RealtimeLiveView";

interface LiveRacesTabProps {
  game: RaceGame | null;
}

interface RaceEntry {
  /** Stable key — the underlying session_event id. */
  id: string;
  trackId: string | null;
  trackName: string | null;
  cup: string | null;
  /** "race" for race tracks, "rally" for MKW knockout rallies. */
  kind: "race" | "rally";
  seriesIndex: number;
  seriesTotal: number;
  createdAt: string;
}

interface SeriesGroup {
  /** Index of the series within the session — 1-based. */
  number: number;
  /** Stable key for React. Composed from the first race's createdAt. */
  key: string;
  total: number;
  races: RaceEntry[];
  startedAt: string;
}

const RACE_EVENT_TYPES = new Set(["race_randomized", "track_randomized"]);

export function LiveRacesTab({ game }: LiveRacesTabProps) {
  const live = useLiveState();
  // Filter race events to the current game so swapping Twitch
  // categories clears the history. Events from prior games stay in
  // the underlying buffer (so swapping BACK restores them); we just
  // hide them while the streamer is on a different game.
  const filteredEvents = useMemo(() => {
    if (!game) return live.events;
    return live.events.filter((e) => {
      if (!RACE_EVENT_TYPES.has(e.event_type)) return true;
      const p = (e.payload ?? {}) as { game?: string | null };
      // Older events without a `game` payload predate the multi-game
      // refactor — keep them visible so we don't blank existing
      // sessions on first load after deploy.
      if (p.game === undefined || p.game === null) return true;
      return p.game === game;
    });
  }, [live.events, game]);
  const series = useMemo(
    () => groupRacesIntoSeries(filteredEvents),
    [filteredEvents],
  );

  if (series.length === 0) {
    return (
      <div className="live-races__empty">
        <p className="live-races__empty-headline">No races rolled yet.</p>
        <p className="live-races__empty-sub">
          The streamer rolls races from chat with{" "}
          <code>!gs-race</code> or <code>!gs-track</code>. Single rolls and
          series both appear here as soon as they fire.
        </p>
      </div>
    );
  }

  return (
    <div className="live-races">
      <p className="live-races__intro">
        {series.length} {series.length === 1 ? "series" : "series"} rolled
        this session. Newest first.
      </p>
      <ol className="live-races__list">
        {series.map((s) => (
          <li key={s.key} className="live-races__series">
            <header className="live-races__series-header">
              <h3 className="live-races__series-title">
                Series {s.number}
                <span className="live-races__series-count">
                  {s.races.length}/{s.total}
                </span>
              </h3>
            </header>
            <ol className="live-races__races">
              {s.races.map((race) => (
                <li key={race.id}>
                  <RaceCard race={race} game={game} />
                </li>
              ))}
            </ol>
          </li>
        ))}
      </ol>
    </div>
  );
}

function RaceCard({
  race,
  game,
}: {
  race: RaceEntry;
  game: RaceGame | null;
}) {
  const trackData = useTrackOrRally(race, game);
  const label =
    race.kind === "rally" ? "Rally" : `Race ${race.seriesIndex}`;
  return (
    <article className="live-races__card">
      <div className="live-races__card-img">
        {trackData?.img ? (
          <Image
            src={getImagePath(trackData.img)}
            alt={trackData.name}
            width={120}
            height={68}
            unoptimized
          />
        ) : (
          <div className="live-races__card-img-placeholder" aria-hidden />
        )}
      </div>
      <div className="live-races__card-meta">
        <span className="live-races__card-label">{label}</span>
        <span className="live-races__card-name">
          {race.trackName ?? trackData?.name ?? "Unknown"}
        </span>
        {race.cup && race.kind === "race" && (
          <span className="live-races__card-cup">{race.cup} Cup</span>
        )}
      </div>
    </article>
  );
}

/** Resolve the catalog row (with image) for a race's track id. Falls
 *  back to using just the event payload's name when the track id isn't
 *  in the current catalog (e.g. game changed mid-session). The `game`
 *  param is unused right now — track + rally IDs don't collide between
 *  games today — kept as a hook for future game-aware lookups. */
function useTrackOrRally(
  race: RaceEntry,
  game: RaceGame | null
): { name: string; img: string } | null {
  void game;
  if (!race.trackId) return null;
  if (race.kind === "rally") {
    const rally: Rally | null = getRallyById(race.trackId);
    if (rally) return { name: rally.name, img: rally.image };
  } else {
    const track: Track | null = getTrackById(race.trackId);
    if (track) return { name: track.name, img: track.image };
  }
  return race.trackName ? { name: race.trackName, img: "" } : null;
}

/**
 * Walk the events buffer (newest-first) and bucket race rolls by
 * `(series_total, contiguous series_index sequence)`. Single rolls
 * (series_total === 1) become 1-race series. Resulting series array
 * is newest-first.
 */
function groupRacesIntoSeries(
  events: { id: string; event_type: string; payload: unknown; created_at: string }[]
): SeriesGroup[] {
  const races: RaceEntry[] = [];
  for (const e of events) {
    if (!RACE_EVENT_TYPES.has(e.event_type)) continue;
    const payload = (e.payload ?? {}) as {
      track_id?: string | null;
      track_name?: string | null;
      cup?: string | null;
      kind?: "race" | "rally" | string | null;
      preset_name?: string | null;
      series_index?: number | null;
      series_total?: number | null;
    };
    races.push({
      id: e.id,
      trackId: payload.track_id ?? null,
      trackName: payload.track_name ?? null,
      cup: payload.cup ?? null,
      kind: payload.kind === "rally" ? "rally" : "race",
      seriesIndex: payload.series_index ?? 1,
      seriesTotal: payload.series_total ?? 1,
      createdAt: e.created_at,
    });
  }

  // Events are newest-first; reverse to walk chronologically so we can
  // bucket contiguous series_index runs into a single series.
  const chrono = races.slice().reverse();
  const series: SeriesGroup[] = [];
  let current: SeriesGroup | null = null;
  for (const r of chrono) {
    if (
      current &&
      current.total === r.seriesTotal &&
      // Single-race "series" never grow.
      current.total > 1 &&
      r.seriesIndex === current.races.length + 1
    ) {
      current.races.push(r);
      continue;
    }
    current = {
      number: 0, // assigned after numbering pass
      key: `series-${r.id}`,
      total: r.seriesTotal,
      races: [r],
      startedAt: r.createdAt,
    };
    series.push(current);
  }

  // Number sequentially from 1 (chronological) but display newest-first.
  series.forEach((s, i) => {
    s.number = i + 1;
  });
  return series.slice().reverse();
}
