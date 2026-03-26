"use client";

import { Select } from "@empac/cascadeds";

interface RaceSelectorProps {
  value: number;
  onChange: (count: number) => void;
}

const RACE_OPTIONS = [4, 6, 8, 12, 16, 24, 32, 48].map((n) => ({
  value: String(n),
  label: `${n} Races`,
}));

export function RaceSelector({ value, onChange }: RaceSelectorProps) {
  return (
    <Select
      options={RACE_OPTIONS}
      value={String(value)}
      onChange={(v) => onChange(Number(v))}
      placeholder="How many races will you be running?"
    />
  );
}
