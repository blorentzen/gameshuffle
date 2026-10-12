/**
 * Pure helpers behind the board's icon language (glyphs.tsx draws them).
 * Plain module so server pages (the rules guides) can call them too.
 */

import type { ExtraConditionDef, ModeConfig } from "./types";

export interface ConditionLook { key: string; label: string; icon: string; color: string; ink?: string }

/** Poison and Burn (the mode's A/B) plus the one-at-a-time conditions, as one list. */
export function conditionLooks(mode: ModeConfig): (ConditionLook & { effect?: string; learnMore?: string; extra?: ExtraConditionDef })[] {
  return [
    { key: "a", label: mode.conditionALabel, icon: mode.conditionAIcon, color: mode.conditionAColor, effect: mode.conditionAEffect, learnMore: "/pokemon-tcg/rules/special-conditions#poison" },
    { key: "b", label: mode.conditionBLabel, icon: mode.conditionBIcon, color: mode.conditionBColor, effect: mode.conditionBEffect, learnMore: "/pokemon-tcg/rules/special-conditions#burn" },
    ...mode.extraConditions.map((d) => ({ key: d.key, label: d.label, icon: d.icon, color: d.color, ink: d.ink, effect: d.effect, learnMore: d.learnMore, extra: d })),
  ];
}

/** An Energy type or a Pokémon type (Dragon has no Energy card, so types fall back to the slot themes). */
export function typeDef(mode: ModeConfig, key: string): { label: string; icon: string; color: string; invertText?: boolean } | null {
  const k = key.toLowerCase();
  const energy = mode.energyTypes.find((e) => e.key === k);
  if (energy) return energy;
  const theme = mode.slotThemes.find((t) => t.key === k);
  return theme ? { label: theme.label, icon: theme.icon ?? "circle", color: theme.color ?? "#9a9a8c", invertText: true } : null;
}

/** Damage as counters: biggest first (180 = 100, 50, 10, 10, 10). */
export function countersFor(damage: number): (10 | 50 | 100)[] {
  const out: (10 | 50 | 100)[] = [];
  let left = Math.max(0, Math.floor(damage / 10) * 10);
  for (const v of [100, 50, 10] as const) while (left >= v) { out.push(v); left -= v; }
  return out;
}
