"use client";

import { RaceCounter } from "./RaceCounter";

interface TourneyModeProps {
  raceCount: number;
  onCountChange: (count: number) => void;
}

export function TourneyMode({ raceCount, onCountChange }: TourneyModeProps) {
  const races = Array.from({ length: raceCount }, (_, i) => i + 1);

  return (
    <div className="tourney-mode">
      <div className="tourney-mode__controls">
        <span>
          <b>Amount of Races</b>
        </span>
        <RaceCounter value={raceCount} onChange={onCountChange} />
      </div>
      <div className="tourney-mode__races">
        <ul className="track-list__grid">
          {races.map((num) => (
            <li key={num} className="track-list__item track-list__item--empty">
              <span className="track-list__race-number">Race {num}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
