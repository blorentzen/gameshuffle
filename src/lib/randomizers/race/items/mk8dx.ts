/**
 * MK8DX item-preset registry. Phase A ships exactly 3 entries per
 * approved scope (see docs/gs-pro-v1-track-item-content-inventory.md §3).
 *
 * No `image` field — item rule sets don't have official artwork. Chat
 * output is text-first, configure UI renders preset names as text.
 */

import type { ItemPreset } from "../types";

export const MK8DX_ITEM_PRESETS: ItemPreset[] = [
  {
    id: "normal-items",
    name: "Normal Items",
    description: "Default item distribution.",
    game: "mk8dx",
  },
  {
    id: "frantic-items",
    name: "Frantic Items",
    description: "Boosted rare-item rate; faster, chaotic races.",
    game: "mk8dx",
  },
  {
    id: "no-items",
    name: "No Items",
    description: "Pure driving. Skill-only races.",
    game: "mk8dx",
  },
];
