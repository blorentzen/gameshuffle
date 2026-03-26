"use client";

import { Button } from "@empac/cascadeds";

interface FilterOption {
  value: string;
  label: string;
}

interface FilterGroupProps {
  label: string;
  options: FilterOption[];
  activeValues: string[];
  onToggle: (value: string) => void;
}

export function FilterGroup({
  label,
  options,
  activeValues,
  onToggle,
}: FilterGroupProps) {
  return (
    <div className="filter-group">
      <span className="filter-group__label">
        <b>{label}</b>
      </span>
      <div className="filter-group__buttons">
        {options.map((opt) => (
          <Button
            key={opt.value}
            variant={
              activeValues.includes(opt.value) ? "primary" : "secondary"
            }
            size="small"
            onClick={() => onToggle(opt.value)}
          >
            {opt.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
