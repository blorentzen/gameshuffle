"use client";

import { Button } from "@empac/cascadeds";
import type { RulesetPreset } from "@/data/competitive-types";

interface RulesetSelectorProps {
  activeRuleset: RulesetPreset;
  onRulesetChange: (ruleset: RulesetPreset) => void;
}

const RULESETS: { value: RulesetPreset; label: string; description: string }[] =
  [
    {
      value: "150cc-no-items",
      label: "150cc No Items",
      description: "Standard competitive format",
    },
    {
      value: "200cc-no-items",
      label: "200cc No Items",
      description: "Emerging competitive format",
    },
    {
      value: "custom",
      label: "Custom",
      description: "Build your own ruleset",
    },
  ];

export function RulesetSelector({
  activeRuleset,
  onRulesetChange,
}: RulesetSelectorProps) {
  return (
    <div className="ruleset-selector">
      <span className="filter-group__label">
        <b>Ruleset</b>
      </span>
      <div className="ruleset-selector__options">
        {RULESETS.map((r) => (
          <Button
            key={r.value}
            variant={activeRuleset === r.value ? "primary" : "secondary"}
            size="small"
            onClick={() => onRulesetChange(r.value)}
          >
            {r.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
