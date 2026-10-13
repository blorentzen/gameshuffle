"use client";

/**
 * Slot theme picker (Scope §11, revised).
 *
 * Reads the available themes from the active `ModeConfig.slotThemes`
 * — so Pokémon Mode shows TCG type chips, Magic Mode (later) would
 * show mana colors, etc. Each chip is a small swatch that previews
 * the visual via `data-style-preview-theme="<key>"` — the CSS for
 * each theme is shared with the slot rendering.
 *
 * The first option in the row is always "None" (clears the styling).
 */

import { Chip } from "@empac/cascadeds";
import { useMode } from "@/lib/companion/SessionContext";
import { NO_THEME_KEY } from "@/lib/companion/styling";

interface Props {
  selected: string;
  onChange: (next: string) => void;
}

export function ThemePicker({ selected, onChange }: Props) {
  const mode = useMode();
  return (
    <div className="companion-theme">
      <div className="companion-theme__label">Theme</div>
      <div className="companion-theme__chips" role="group" aria-label="Theme">
        {/* "None" first: clears the styling. */}
        <Chip
          label="None"
          clickable
          selected={selected === NO_THEME_KEY}
          variant={selected === NO_THEME_KEY ? "primary" : "default"}
          onClick={() => onChange(NO_THEME_KEY)}
          icon={<span className="companion-theme__chip-fill companion-theme__chip-fill--none" aria-hidden="true" />}
        />
        {mode.slotThemes.map((theme) => (
          <Chip
            key={theme.key}
            label={theme.label}
            clickable
            selected={selected === theme.key}
            variant={selected === theme.key ? "primary" : "default"}
            onClick={() => onChange(theme.key)}
            icon={<span className="companion-theme__chip-fill" data-style-preview-theme={theme.key} aria-hidden="true" />}
          />
        ))}
      </div>
    </div>
  );
}
