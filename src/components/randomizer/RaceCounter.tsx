"use client";

import { Button } from "@empac/cascadeds";

interface RaceCounterProps {
  value: number;
  onChange: (count: number) => void;
  min?: number;
  max?: number;
}

export function RaceCounter({
  value,
  onChange,
  min = 1,
  max = 48,
}: RaceCounterProps) {
  return (
    <div className="race-counter">
      <Button
        variant="secondary"
        size="small"
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        -
      </Button>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (v >= min && v <= max) onChange(v);
        }}
        className="race-counter__input"
      />
      <Button
        variant="secondary"
        size="small"
        onClick={() => onChange(Math.min(max, value + 1))}
      >
        +
      </Button>
    </div>
  );
}
