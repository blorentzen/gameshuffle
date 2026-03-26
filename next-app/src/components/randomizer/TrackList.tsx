import { getImagePath } from "@/lib/images";
import type { SelectedTrack } from "@/data/types";

interface TrackListProps {
  tracks: SelectedTrack[];
}

export function TrackList({ tracks }: TrackListProps) {
  if (tracks.length === 0) return null;

  return (
    <div className="track-list">
      <ul className="track-list__grid">
        {tracks.map((track) => (
          <li key={track.raceNumber} className="track-list__item">
            <span className="track-list__race-number">
              Race {track.raceNumber}
            </span>
            <img
              className="track-list__course-img"
              src={getImagePath(track.course.img)}
              alt={track.course.name}
            />
            <img
              className="track-list__cup-img"
              src={getImagePath(track.cupImg)}
              alt="Cup"
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
