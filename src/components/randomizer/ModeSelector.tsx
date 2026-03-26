"use client";

import { Button } from "@empac/cascadeds";

export type GameMode = "casual" | "competitive";

interface ModeSelectorProps {
  activeMode: GameMode;
  onModeChange: (mode: GameMode) => void;
}

const MODES: { value: GameMode; label: string }[] = [
  { value: "casual", label: "Casual / Game Night" },
  { value: "competitive", label: "Competitive" },
];

export function ModeSelector({ activeMode, onModeChange }: ModeSelectorProps) {
  return (
    <div className="mode-selector">
      {MODES.map((mode) => (
        <Button
          key={mode.value}
          variant={activeMode === mode.value ? "primary" : "secondary"}
          onClick={() => onModeChange(mode.value)}
        >
          {mode.label}
        </Button>
      ))}
    </div>
  );
}
