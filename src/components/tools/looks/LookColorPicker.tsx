"use client";

/**
 * Color choice for the tool looks: the CDS ColorPicker's swatches, plus a
 * labelled "Any color" swatch on the browser's own color input. CDS's inline
 * custom-color row puts an unlabelled input inside its listbox (axe: label,
 * aria-required-children), so the picker runs with presets only and this
 * wrapper adds the custom color. On the CascadeDS fix list.
 */

import { ColorPicker } from "@empac/cascadeds";
import { IconPalette } from "@tabler/icons-react";

export function LookColorPicker({ value, onChange, presets, label, disabled = false }: {
  value: string;
  onChange: (hex: string) => void;
  presets: { value: string; label: string }[];
  label: string;
  disabled?: boolean;
}) {
  const custom = !presets.some((p) => p.value.toLowerCase() === value.toLowerCase());
  return (
    <div className={`look-colors${disabled ? " is-disabled" : ""}`}>
      <ColorPicker variant="inline" size="medium" presets={presets} allowCustom={false} value={value} onChange={onChange} disabled={disabled} aria-label={label} />
      <label className={`look-colors__any${custom ? " is-on" : ""}`}>
        <input type="color" value={value} onChange={(e) => onChange(e.target.value.toLowerCase())} disabled={disabled} aria-label={`${label}: any color`} />
        <span className="look-colors__any-swatch" style={custom ? { background: value } : undefined} aria-hidden="true">
          <IconPalette size={16} />
        </span>
        <span className="look-colors__any-label">Any color</span>
      </label>
    </div>
  );
}
