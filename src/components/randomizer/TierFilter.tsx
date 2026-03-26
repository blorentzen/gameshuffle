"use client";

import { Button } from "@empac/cascadeds";

const TIERS = ["S", "A", "B", "C", "D"];

interface TierFilterProps {
  activeTiers: string[];
  onToggle: (tier: string) => void;
}

export function TierFilter({ activeTiers, onToggle }: TierFilterProps) {
  return (
    <div className="filter-group">
      <span className="filter-group__label">
        <b>Tier Filter</b>
      </span>
      <div className="filter-group__buttons">
        {TIERS.map((tier) => (
          <Button
            key={tier}
            variant={activeTiers.includes(tier) ? "primary" : "secondary"}
            size="small"
            onClick={() => onToggle(tier)}
          >
            {tier} Tier
          </Button>
        ))}
      </div>
    </div>
  );
}
