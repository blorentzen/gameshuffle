"use client";

import { Button } from "@empac/cascadeds";

interface StreamToggleProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const TABS = [
  { value: "kart-randomizer", label: "Kart Randomizer" },
  { value: "race-randomizer", label: "Race Randomizer" },
  { value: "tourney-mode", label: "Tourney Mode" },
];

export function StreamToggle({ activeTab, onTabChange }: StreamToggleProps) {
  return (
    <div className="stream-toggle">
      {TABS.map((tab) => (
        <Button
          key={tab.value}
          variant={activeTab === tab.value ? "primary" : "secondary"}
          onClick={() => onTabChange(tab.value)}
        >
          {tab.label}
        </Button>
      ))}
    </div>
  );
}
