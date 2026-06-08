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
      <div className="companion-theme__chips">
        {/* "None" sentinel first — clears the styling */}
        <button
          type="button"
          className={`companion-theme__chip companion-theme__chip--none${
            selected === NO_THEME_KEY ? " companion-theme__chip--selected" : ""
          }`}
          onClick={() => onChange(NO_THEME_KEY)}
          aria-label="No theme"
          aria-pressed={selected === NO_THEME_KEY}
          title="No theme"
        >
          <span className="companion-theme__chip-fill" />
          <span className="companion-theme__chip-label">None</span>
        </button>

        {mode.slotThemes.map((theme) => (
          <button
            key={theme.key}
            type="button"
            className={`companion-theme__chip${
              selected === theme.key ? " companion-theme__chip--selected" : ""
            }`}
            data-style-preview-theme={theme.key}
            onClick={() => onChange(theme.key)}
            aria-label={theme.label}
            aria-pressed={selected === theme.key}
            title={theme.description ?? theme.label}
          >
            <span className="companion-theme__chip-fill" />
            <span className="companion-theme__chip-label">{theme.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
