"use client";

/**
 * "This happened last time" — recap surface shown on `/live/<slug>`
 * when the streamer isn't currently live. Single-most-recent session
 * only (per the UX brief). Hidden when the streamer has opted out via
 * `users.show_recap_on_live_page` (recap loader returns null in that
 * case, and this component never renders).
 *
 * The page-side relative timestamp updates client-side via a useState
 * + setInterval — keeps "3 hours ago" fresh without a refresh.
 */

import { useEffect, useState } from "react";
import { Card } from "@empac/cascadeds";
import { GameArtwork } from "@/components/hub/GameArtwork";
import {
  getTrackById,
  getRallyById,
  getItemModeById,
  getItemById,
} from "@/lib/randomizers/race";
import type { RaceGame } from "@/lib/randomizers/race";
import type { RecapHighlight } from "@/lib/sessions/recap";
import { getGameName } from "@/data/game-registry";

interface Props {
  recap: RecapHighlight;
}

export function LastStreamRecap({ recap }: Props) {
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    // Tick once per minute so the relative timestamp stays fresh
    // ("3 hours ago" → "4 hours ago" etc.) without a hard refresh.
    const handle = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(handle);
  }, []);

  const endedMs = Date.parse(recap.endedAt);
  const sinceLabel = formatRelative(endedMs, now);
  const durationLabel = recap.durationMs
    ? formatDuration(recap.durationMs)
    : null;
  const gameName = recap.gameSlug ? getGameName(recap.gameSlug) : null;
  const raceGame: RaceGame | null =
    recap.gameSlug === "mario-kart-8-deluxe"
      ? "mk8dx"
      : recap.gameSlug === "mario-kart-world"
        ? "mkworld"
        : null;

  const lastRollName = recap.lastRoll
    ? resolveRollName(recap.lastRoll.trackId, recap.lastRoll.kind)
    : null;
  const lastModeName = recap.lastRoll?.presetId
    ? resolveModeName(recap.lastRoll.presetId, raceGame)
    : null;

  // Top picks/bans — keep to 5 per row so the surface stays scannable.
  // Tracks pool only for v1: items / modes are most interesting in
  // the live picker, less so as recap chips.
  const topPickedTracks = recap.lastApplied?.tracks.topPicks.slice(0, 5) ?? [];
  const topBannedTracks = recap.lastApplied?.tracks.topBans.slice(0, 5) ?? [];

  return (
    <section className="last-stream-recap">
      <header className="last-stream-recap__header">
        <h2 className="last-stream-recap__title">This happened last time</h2>
        <p className="last-stream-recap__meta">
          {gameName && <strong>{gameName}</strong>}
          {gameName && " · "}
          <time dateTime={recap.endedAt} title={new Date(endedMs).toLocaleString()}>
            {sinceLabel}
          </time>
          {durationLabel && (
            <>
              {" · "}
              ran for {durationLabel}
            </>
          )}
        </p>
      </header>

      <div className="last-stream-recap__stats">
        <RecapStat label="Races rolled" value={recap.raceCount} />
        <RecapStat label="Viewers joined" value={recap.participantCount} />
        <RecapStat label="Picks/bans rounds" value={recap.roundsOpened} />
        {recap.channelPointRerollCount > 0 && (
          <RecapStat
            label="Channel-point rerolls"
            value={recap.channelPointRerollCount}
          />
        )}
      </div>

      {recap.lastRoll && lastRollName && (
        <Card variant="outlined" padding="medium">
          <h3 className="last-stream-recap__card-title">Final roll</h3>
          <p className="last-stream-recap__final-roll">
            <span className="last-stream-recap__final-roll-kind">
              {recap.lastRoll.kind === "rally" ? "🏁 Rally" : "🏁 Track"}
            </span>{" "}
            <strong>{lastRollName}</strong>
            {lastModeName && (
              <>
                {" · "}
                <span className="last-stream-recap__final-roll-mode">
                  🎁 {lastModeName}
                </span>
              </>
            )}
          </p>
        </Card>
      )}

      {(topPickedTracks.length > 0 || topBannedTracks.length > 0) && (
        <Card variant="outlined" padding="medium">
          <h3 className="last-stream-recap__card-title">
            Viewers chose
          </h3>
          {topPickedTracks.length > 0 && (
            <RecapTrackRow
              label="Top picked tracks"
              ids={topPickedTracks.map((p) => p.id)}
              counts={topPickedTracks.map((p) => p.count)}
              variant="pick"
            />
          )}
          {topBannedTracks.length > 0 && (
            <RecapTrackRow
              label="Top banned tracks"
              ids={topBannedTracks.map((p) => p.id)}
              counts={topBannedTracks.map((p) => p.count)}
              variant="ban"
            />
          )}
        </Card>
      )}

      {gameName && (
        <div className="last-stream-recap__game-tile">
          <GameArtwork slug={recap.gameSlug} size="thumb" />
          <span className="last-stream-recap__game-tile-name">{gameName}</span>
        </div>
      )}
    </section>
  );
}

function RecapStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="last-stream-recap__stat">
      <div className="last-stream-recap__stat-value">{value}</div>
      <div className="last-stream-recap__stat-label">{label}</div>
    </div>
  );
}

function RecapTrackRow({
  label,
  ids,
  counts,
  variant,
}: {
  label: string;
  ids: string[];
  counts: number[];
  variant: "pick" | "ban";
}) {
  return (
    <div className="last-stream-recap__chip-row">
      <span className="last-stream-recap__chip-label">{label}</span>
      <div className="last-stream-recap__chips">
        {ids.map((id, idx) => {
          const name = getTrackById(id)?.name ?? id;
          return (
            <span
              key={id}
              className={`last-stream-recap__chip last-stream-recap__chip--${variant}`}
            >
              {name}
              <span className="last-stream-recap__chip-count">
                {counts[idx]}
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

function resolveRollName(
  trackId: string | null,
  kind: "race" | "rally",
): string | null {
  if (!trackId) return null;
  if (kind === "rally") return getRallyById(trackId)?.name ?? trackId;
  return getTrackById(trackId)?.name ?? trackId;
}

function resolveModeName(presetId: string, game: RaceGame | null): string | null {
  if (!presetId) return null;
  const mode = getItemModeById(presetId, game ?? undefined);
  return mode?.name ?? presetId;
}

// Note: getItemById intentionally unused below — kept available for a
// future "items in last mode" tile expansion. Suppress the lint.
void getItemById;

function formatRelative(ms: number, now: number): string {
  if (!Number.isFinite(ms)) return "recently";
  const diffMs = Math.max(0, now - ms);
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60)
    return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks} week${weeks === 1 ? "" : "s"} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
  const years = Math.floor(days / 365);
  return `${years} year${years === 1 ? "" : "s"} ago`;
}

function formatDuration(ms: number): string {
  const totalMinutes = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}
