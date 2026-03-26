"use client";

import { Button } from "@empac/cascadeds";
import { getImagePath } from "@/lib/images";
import type { CompTrack } from "@/data/competitive-types";

interface TrackBanListProps {
  tracks: CompTrack[];
  bannedIds: string[];
  onToggleBan: (trackId: string) => void;
  maxBans: number;
}

export function TrackBanList({
  tracks,
  bannedIds,
  onToggleBan,
  maxBans,
}: TrackBanListProps) {
  const legalTracks = tracks.filter((t) => t.status === "legal");
  const bansRemaining = maxBans - bannedIds.length;

  return (
    <div className="track-ban-list">
      <div className="track-ban-list__header">
        <span className="filter-group__label">
          <b>Track Ban List</b>
        </span>
        <span className="track-ban-list__count">
          {bansRemaining} ban{bansRemaining !== 1 ? "s" : ""} remaining
        </span>
      </div>
      <div className="track-ban-list__grid">
        {legalTracks.map((track) => {
          const isBanned = bannedIds.includes(track.id);
          return (
            <button
              key={track.id}
              className={`track-ban-item ${isBanned ? "track-ban-item--banned" : ""}`}
              onClick={() => {
                if (isBanned || bansRemaining > 0) {
                  onToggleBan(track.id);
                }
              }}
              disabled={!isBanned && bansRemaining <= 0}
            >
              {track.image_url && (
                <img
                  src={getImagePath(track.image_url)}
                  alt={track.name}
                  className="track-ban-item__img"
                />
              )}
              <span className="track-ban-item__name">{track.name}</span>
              <span className="track-ban-item__shortcode">
                {track.shortcode}
              </span>
              {isBanned && (
                <span className="track-ban-item__badge">BANNED</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
