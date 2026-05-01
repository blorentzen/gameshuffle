"use client";

/**
 * Tracks tab — visual picker for the live view. Per spec §5.
 *
 * 96 MK8DX tracks (or 32 MKWorld) rendered as a card grid with
 * per-card status indicators (Currently Playing / Picked / Banned /
 * Neutral). Tactile actions (Pick / Ban / Clear) are auth-gated and
 * routed through `requestAction` (which opens the auth modal for
 * unauthenticated viewers).
 *
 * Search + cup filter are client-side; the dataset is small enough
 * that virtualization is unnecessary for v1.
 */

import { useMemo, useState } from "react";
import Image from "next/image";
import { Badge } from "@empac/cascadeds";
import { getImagePath } from "@/lib/images";
import { listTracksForGame, type RaceGame, type Track } from "@/lib/randomizers/race";
import { useLiveState } from "../RealtimeLiveView";
import type { PendingAction } from "../useReplayActionAfterAuth";

interface LiveTracksTabProps {
  game: RaceGame | null;
  requestAction: (
    kind: PendingAction["kind"],
    id: string,
    label: string
  ) => void;
}

type TrackStatus = "currently-playing" | "picked" | "banned" | "neutral";

export function LiveTracksTab({ game, requestAction }: LiveTracksTabProps) {
  const live = useLiveState();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "in-pool" | "picked" | "banned">(
    "all"
  );

  const allTracks = useMemo(() => (game ? listTracksForGame(game) : []), [game]);
  const cups = useMemo(() => {
    const seen: string[] = [];
    for (const t of allTracks) {
      if (!seen.includes(t.cup)) seen.push(t.cup);
    }
    return seen;
  }, [allTracks]);

  // Currently-playing track id from the most recent race_randomized
  // event. Best-effort — derives the same way <LiveRaceState /> does
  // but scoped to just the track id since that's all this tab needs.
  const currentlyPlayingTrackId = useMemo(() => {
    for (const e of live.events) {
      if (e.event_type === "race_randomized" || e.event_type === "track_randomized") {
        const id = (e.payload?.track_id as string | null) ?? null;
        if (id) return id;
      }
    }
    return null;
  }, [live.events]);

  const config = live.raceConfig?.tracks;
  const picks = useMemo(() => new Set(config?.picks ?? []), [config?.picks]);
  const bans = useMemo(() => new Set(config?.bans ?? []), [config?.bans]);

  const statusFor = (track: Track): TrackStatus => {
    if (track.id === currentlyPlayingTrackId) return "currently-playing";
    if (picks.has(track.id)) return "picked";
    if (bans.has(track.id)) return "banned";
    return "neutral";
  };

  const filtered = useMemo(() => {
    let working = allTracks;
    if (search.trim()) {
      const needle = search.toLowerCase();
      working = working.filter((t) => t.name.toLowerCase().includes(needle));
    }
    if (filter !== "all") {
      working = working.filter((t) => {
        const s = statusFor(t);
        if (filter === "in-pool") return s !== "banned";
        if (filter === "picked") return s === "picked";
        if (filter === "banned") return s === "banned";
        return true;
      });
    }
    return working;
  }, [allTracks, search, filter, picks, bans, currentlyPlayingTrackId]); // eslint-disable-line react-hooks/exhaustive-deps

  const groupedByCup = useMemo(() => {
    const groups = new Map<string, Track[]>();
    for (const t of filtered) {
      if (!groups.has(t.cup)) groups.set(t.cup, []);
      groups.get(t.cup)!.push(t);
    }
    // Preserve cup order from the registry.
    return cups
      .map((cup) => ({ cup, tracks: groups.get(cup) ?? [] }))
      .filter((g) => g.tracks.length > 0);
  }, [filtered, cups]);

  if (!game) {
    return (
      <div className="live-tab live-tab--empty">
        <p>
          The streamer hasn&rsquo;t selected a game for this session yet —
          tracks will appear here once they pick a randomizer.
        </p>
      </div>
    );
  }

  return (
    <div className="live-tab">
      <div className="live-picker__controls">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tracks…"
          className="live-picker__search"
        />
        <div className="live-picker__filters">
          {(["all", "in-pool", "picked", "banned"] as const).map((f) => (
            <button
              key={f}
              type="button"
              className={`live-picker__filter${filter === f ? " live-picker__filter--active" : ""}`}
              onClick={() => setFilter(f)}
            >
              {filterLabel(f)}
            </button>
          ))}
        </div>
      </div>

      <p className="live-picker__count">
        {filtered.length} of {allTracks.length} tracks
      </p>

      <div className="live-picker__groups">
        {groupedByCup.length === 0 ? (
          <p className="live-tab__empty-state">No tracks match this filter.</p>
        ) : (
          groupedByCup.map((g) => (
            <section key={g.cup} className="live-picker__group">
              <h3 className="live-picker__group-title">{g.cup} Cup</h3>
              <div className="live-picker__grid">
                {g.tracks.map((t) => (
                  <TrackCard
                    key={t.id}
                    track={t}
                    status={statusFor(t)}
                    onPick={() =>
                      requestAction("pick-track", t.id, `Pick ${t.name}`)
                    }
                    onBan={() =>
                      requestAction("ban-track", t.id, `Ban ${t.name}`)
                    }
                  />
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}

function filterLabel(f: "all" | "in-pool" | "picked" | "banned"): string {
  if (f === "all") return "All";
  if (f === "in-pool") return "In pool";
  if (f === "picked") return "Picked";
  return "Banned";
}

interface TrackCardProps {
  track: Track;
  status: TrackStatus;
  onPick: () => void;
  onBan: () => void;
}

function TrackCard({ track, status, onPick, onBan }: TrackCardProps) {
  const className = `live-track-card live-track-card--${status}`;
  return (
    <article className={className}>
      <div className="live-track-card__image">
        <Image
          src={getImagePath(track.image)}
          alt={track.name}
          width={160}
          height={90}
          unoptimized
          loading="lazy"
        />
      </div>
      <div className="live-track-card__body">
        <p className="live-track-card__name">{track.name}</p>
        <StatusBadge status={status} />
      </div>
      <div className="live-track-card__actions">
        <button
          type="button"
          className="live-track-card__btn"
          onClick={onPick}
          aria-label={`Pick ${track.name}`}
        >
          Pick
        </button>
        <button
          type="button"
          className="live-track-card__btn live-track-card__btn--ban"
          onClick={onBan}
          aria-label={`Ban ${track.name}`}
        >
          Ban
        </button>
      </div>
    </article>
  );
}

function StatusBadge({ status }: { status: TrackStatus }) {
  if (status === "currently-playing") {
    return <Badge variant="success" size="small">Now playing</Badge>;
  }
  if (status === "picked") {
    return <Badge variant="success" size="small">Picked</Badge>;
  }
  if (status === "banned") {
    return <Badge variant="error" size="small">Banned</Badge>;
  }
  return null;
}
