"use client";

import { Select } from "@empac/cascadeds";

interface RaceSelectorProps {
  value: number;
  onChange: (count: number) => void;
  max?: number;
  label?: string;
  counts?: number[];
}

const DEFAULT_OPTIONS = [4, 6, 8, 12, 16, 24, 32, 48];

export function RaceSelector({ value, onChange, max, label = "Races", counts }: RaceSelectorProps) {
  const options = max
    ? Array.from({ length: max }, (_, i) => i + 1).map((n) => ({
        value: String(n),
        label: `${n} ${label}`,
      }))
    : (counts || DEFAULT_OPTIONS).map((n) => ({
        value: String(n),
        label: `${n} ${label}`,
      }));

  return (
    <Select
      options={options}
      value={String(value)}
      onChange={(v) => onChange(Number(v))}
      placeholder={`How many ${label.toLowerCase()}?`}
      size="small"
    />
  );
}
