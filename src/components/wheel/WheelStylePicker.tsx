"use client";

/**
 * WheelStylePicker — the two customization axes for a wheel: a color theme
 * (palette + accents) and a fill style (solid / gradient / stripes / dots).
 * Shared by the free `/wheel-spinner` tool and the Pro wheel creator
 * (account → Wheels) so both pick from the exact same set.
 *
 * Fill-style swatches preview the style tinted with the current theme's
 * lead color, so the two pickers read together.
 */

import type { CSSProperties } from "react";
import {
  FILL_STYLES,
  WHEEL_THEMES,
  getTheme,
  type FillStyle,
} from "@/lib/wheel/themes";

export function WheelStylePicker({
  themeId,
  onThemeChange,
  fillStyle,
  onFillStyleChange,
}: {
  themeId: string;
  onThemeChange: (id: string) => void;
  fillStyle: FillStyle;
  onFillStyleChange: (style: FillStyle) => void;
}) {
  const accent = getTheme(themeId).palette[0];

  return (
    <div className="wheel-style-picker">
      <div className="wheel-style-picker__group">
        <div className="wheel-tool__panel-label">Theme</div>
        <div className="wheel-tool__themes" role="radiogroup" aria-label="Wheel theme">
          {WHEEL_THEMES.map((th) => (
            <button
              key={th.id}
              type="button"
              className={`wheel-theme-chip${themeId === th.id ? " is-active" : ""}`}
              onClick={() => onThemeChange(th.id)}
              aria-pressed={themeId === th.id}
              title={th.name}
            >
              <span className="wheel-theme-chip__swatch">
                {th.palette.slice(0, 4).map((c, i) => (
                  <span key={i} style={{ background: c }} />
                ))}
              </span>
              <span className="wheel-theme-chip__name">{th.name}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="wheel-style-picker__group">
        <div className="wheel-tool__panel-label">Fill style</div>
        <div className="wheel-tool__themes" role="radiogroup" aria-label="Fill style">
          {FILL_STYLES.map((fs) => (
            <button
              key={fs.id}
              type="button"
              className={`wheel-theme-chip${fillStyle === fs.id ? " is-active" : ""}`}
              onClick={() => onFillStyleChange(fs.id)}
              aria-pressed={fillStyle === fs.id}
              title={fs.name}
            >
              <span
                className="wheel-fill-chip__swatch"
                data-style={fs.id}
                style={{ "--fill-accent": accent } as CSSProperties}
              />
              <span className="wheel-theme-chip__name">{fs.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
