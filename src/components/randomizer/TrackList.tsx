"use client";

import { getImagePath } from "@/lib/images";
import { useRollFrames } from "@/components/randomizer/RollingText";
import type { Course, SelectedTrack } from "@/data/types";

interface TrackListProps {
  tracks: SelectedTrack[];
  showCupIcon?: boolean;
  /** Courses to spin through when the list mounts (the rolling animation). Re-key the list per roll. */
  reel?: Course[];
}

function TrackTile({ track, showCupIcon, reel }: { track: SelectedTrack; showCupIcon: boolean; reel?: Course[] }) {
  const frame = useRollFrames(reel, !!reel?.length);
  const course = frame ?? track.course;
  return (
    <li className={`track-list__item${frame ? " is-rolling" : ""}`} aria-hidden={frame ? true : undefined}>
      <span className="track-list__race-number">
        Race {track.raceNumber}
      </span>
      <img
        className={`track-list__course-img ${course.icon ? "track-list__course-img--icon" : ""}`}
        src={getImagePath(course.icon || course.img)}
        alt={course.name}
      />
      <span className="track-list__course-name">{course.name}</span>
      {showCupIcon && track.cupImg && !frame && (
        <img
          className="track-list__cup-img"
          src={getImagePath(track.cupImg)}
          alt="Cup"
        />
      )}
    </li>
  );
}

export function TrackList({ tracks, showCupIcon = false, reel }: TrackListProps) {
  if (tracks.length === 0) return null;

  return (
    <div className="track-list">
      <ul className="track-list__grid">
        {tracks.map((track) => (
          <TrackTile key={track.raceNumber} track={track} showCupIcon={showCupIcon} reel={reel} />
        ))}
      </ul>
    </div>
  );
}
