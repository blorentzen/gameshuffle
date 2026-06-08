/**
 * Slot personalization — Scope §11 (revised).
 *
 * Revised after the "use Pokémon types" decision: the AVAILABLE themes
 * live in `ModeConfig.slotThemes` — so Pokémon Mode ships its 10 TCG
 * energy types, and a future Magic Mode would ship its 5 mana colors,
 * each in their own config without touching component code.
 *
 * The platform layer keeps just:
 *   - The `SlotTheme` type (a `{ key, label, description? }` shape).
 *   - The "no styling" sentinel (`NO_THEME_KEY` = `"none"`).
 *   - The data field on the slot (`slotTheme: string`).
 *
 * The CSS for each theme is driven by `data-slot-theme="<key>"` on the
 * slot element. A new theme is a 2-step change: add an entry to the
 * mode's `slotThemes`, and add the matching CSS rule.
 */

export interface SlotTheme {
  /** Stable string id — stored on the slot and used as the CSS
   *  `data-slot-theme` attribute value. Mode-local; a Magic Mode
   *  theme key can collide with a Pokémon Mode key without harm
   *  because only one mode is active at a time. */
  key: string;
  /** Human label shown in the picker. */
  label: string;
  /** CDS icon name for the type badge on the slot panel. Matches
   *  whatever icon the CSS pattern overlay uses for visual
   *  consistency. */
  icon: string;
  /** Optional one-liner for tooltips / aria descriptions. */
  description?: string;
}

/** Sentinel value for "no styling chosen". Stored on the slot
 *  exactly the same way an actual theme key would be — render code
 *  treats this value as the unstyled state. */
export const NO_THEME_KEY = "none";

export const DEFAULT_SLOT_THEME: string = NO_THEME_KEY;

/** True when the slot is themed at all (i.e. anything beyond the
 *  default "none" sentinel). Used by render code to decide whether
 *  to emit the data attribute. */
export function isSlotThemed(theme: string): boolean {
  return theme !== NO_THEME_KEY;
}
