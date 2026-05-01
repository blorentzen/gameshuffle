"use client";

/**
 * Hero section for the live view — current track + items + series
 * progression. Reads the most recent race_randomized event (or
 * track/items_randomized fallback) from the realtime context to derive
 * "race N of M" + the active picks.
 *
 * Per spec §4.4 + §2.7. When no race has been randomized yet, renders a
 * "waiting for the streamer" placeholder.
 */

import Image from "next/image";
import { Badge } from "@empac/cascadeds";
import { getImagePath } from "@/lib/images";
import { getTrackById, getItemPresetById } from "@/lib/randomizers/race";
import { useLiveState } from "./RealtimeLiveView";
import type { SessionStateProps } from "./LiveStreamView";

interface LiveRaceStateProps {
  sessionState: SessionStateProps;
  participantCount: number;
}

interface DerivedRaceState {
  trackId: string | null;
  trackName: string | null;
  trackCup: string | null;
  presetId: string | null;
  presetName: string | null;
  seriesIndex: number | null;
  seriesTotal: number | null;
  randomizedAt: string | null;
}

function deriveCurrentRace(events: ReturnType<typeof useLiveState>["events"]): DerivedRaceState | null {
  // Walk events newest-first. First match wins. We accept any of the
  // three race-randomizer event types — race_randomized carries the
  // richest payload but track/items_randomized standalone calls
  // (and series rolls of !gs-track) populate partial state too.
  for (const event of events) {
    const p = event.payload ?? {};
    if (event.event_type === "race_randomized") {
      return {
        trackId: (p.track_id as string | null) ?? null,
        trackName: (p.track_name as string | null) ?? null,
        trackCup: (p.cup as string | null) ?? null,
        presetId: (p.preset_id as string | null) ?? null,
        presetName: (p.preset_name as string | null) ?? null,
        seriesIndex: (p.series_index as number | null) ?? null,
        seriesTotal: (p.series_total as number | null) ?? null,
        randomizedAt: event.created_at,
      };
    }
    if (event.event_type === "track_randomized") {
      return {
        trackId: (p.track_id as string | null) ?? null,
        trackName: (p.track_name as string | null) ?? null,
        trackCup: (p.cup as string | null) ?? null,
        presetId: null,
        presetName: null,
        seriesIndex: (p.series_index as number | null) ?? null,
        seriesTotal: (p.series_total as number | null) ?? null,
        randomizedAt: event.created_at,
      };
    }
    if (event.event_type === "items_randomized") {
      return {
        trackId: null,
        trackName: null,
        trackCup: null,
        presetId: (p.preset_id as string | null) ?? null,
        presetName: (p.preset_name as string | null) ?? null,
        seriesIndex: null,
        seriesTotal: null,
        randomizedAt: event.created_at,
      };
    }
  }
  return null;
}

export function LiveRaceState({ sessionState, participantCount }: LiveRaceStateProps) {
  const live = useLiveState();
  const current = deriveCurrentRace(live.events);

  // Track image lookup: payload may not include the full image URL, so
  // hydrate via the registry by id when we have one.
  const trackEntry = current?.trackId ? getTrackById(current.trackId) : null;
  const presetEntry = current?.presetId
    ? getItemPresetById(current.presetId)
    : null;

  return (
    <section className="live-race-state">
      {current?.seriesIndex && current?.seriesTotal && current.seriesTotal > 1 && (
        <SeriesProgression
          index={current.seriesIndex}
          total={current.seriesTotal}
        />
      )}

      <div className="live-race-state__hero">
        {!current ? (
          <p className="live-race-state__placeholder">
            Waiting for the streamer to start the race…
          </p>
        ) : (
          <>
            {trackEntry?.image && (
              <div className="live-race-state__track-image">
                <Image
                  src={getImagePath(trackEntry.image)}
                  alt={trackEntry.name}
                  width={240}
                  height={135}
                  unoptimized
                />
              </div>
            )}
            <div className="live-race-state__track-meta">
              {current.trackName ? (
                <>
                  <p className="live-race-state__label">🏁 Track</p>
                  <h2 className="live-race-state__track-name">
                    {current.trackName}
                  </h2>
                  {current.trackCup && (
                    <p className="live-race-state__track-cup">
                      {current.trackCup} Cup
                    </p>
                  )}
                </>
              ) : (
                <p className="live-race-state__label">No track rolled yet</p>
              )}
              {(current.presetName || presetEntry?.name) && (
                <div className="live-race-state__items">
                  <p className="live-race-state__label">🎯 Items</p>
                  <p className="live-race-state__preset-name">
                    {current.presetName ?? presetEntry?.name}
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <div className="live-race-state__meta">
        <Badge variant="default" size="small">
          {participantCount} participant{participantCount === 1 ? "" : "s"}
        </Badge>
        {sessionState.status === "ending" && (
          <Badge variant="warning" size="small">Wrapping up</Badge>
        )}
        {!sessionState.raceModuleEnabled && (
          <Badge variant="default" size="small">
            Race randomizer disabled
          </Badge>
        )}
      </div>
    </section>
  );
}

function SeriesProgression({ index, total }: { index: number; total: number }) {
  const cells = Array.from({ length: total }, (_, i) => i + 1);
  return (
    <div
      className="live-race-state__series"
      role="progressbar"
      aria-valuenow={index}
      aria-valuemin={1}
      aria-valuemax={total}
      aria-label={`Race ${index} of ${total}`}
    >
      <p className="live-race-state__series-label">
        Race {index} of {total}
      </p>
      <div className="live-race-state__series-track">
        {cells.map((n) => {
          const state =
            n < index ? "complete" : n === index ? "active" : "upcoming";
          return (
            <span
              key={n}
              className={`live-race-state__series-cell live-race-state__series-cell--${state}`}
              aria-label={`Race ${n} ${state}`}
            >
              {n}
            </span>
          );
        })}
      </div>
    </div>
  );
}
