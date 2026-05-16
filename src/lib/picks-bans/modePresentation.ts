/**
 * Per-(item-mode) visual presentation — Tabler icon + dual-color
 * palette used to render the mode tile artwork in the picks/bans
 * picker + apply editor.
 *
 * Decoupled from the gameplay data in `src/lib/randomizers/race/items/*`
 * so designers can iterate on visuals without churning the items
 * registry. Keyed by mode id (stable kebab-case strings).
 *
 * If a mode id isn't in the registry, callers should fall back to a
 * generic neutral treatment (no icon, plain background).
 */

import {
  IconBolt,
  IconBomb,
  IconBone,
  IconCarTurbine,
  IconCoin,
  IconDeviceGamepad,
  IconMushroom,
  IconRocket,
  IconShieldChevron,
  IconSkull,
  IconStar,
  IconViewfinder,
  type IconProps,
} from "@tabler/icons-react";
import { IconBanana } from "./IconBanana";
import type { ComponentType } from "react";

export interface ModePresentation {
  /** Tabler icon component. Rendered at ~48px inside the tile artwork
   *  area; uses currentColor so the parent CSS controls fill. */
  Icon: ComponentType<IconProps>;
  /** Primary gradient stop. CSS color string (hex / rgb / hsl all OK). */
  primary: string;
  /** Accent gradient stop. Together with `primary` drives a 135° linear
   *  gradient on the tile background. */
  accent: string;
  /** Foreground color for the icon. Should contrast both gradient
   *  stops — generally white or a high-contrast accent. */
  iconColor: string;
}

/** Registry keyed by mode id. Both MK8DX and MKWorld share these ids
 *  for shared modes (Rise of the Koopa, Let Chaos Reign, etc.) so a
 *  single entry per id is sufficient. */
export const MODE_PRESENTATIONS: Record<string, ModePresentation> = {
  "rise-of-the-koopa": {
    Icon: IconShieldChevron,
    primary: "#4a5d23",
    accent: "#a0744a",
    iconColor: "#fff8e7",
  },
  "let-chaos-reign": {
    Icon: IconBolt,
    primary: "#ff4d2e",
    accent: "#7c3aed",
    iconColor: "#ffffff",
  },
  "need-for-speed": {
    Icon: IconCarTurbine,
    primary: "#ff2d6f",
    accent: "#22d3ee",
    iconColor: "#ffffff",
  },
  "bombs-away": {
    Icon: IconBomb,
    primary: "#ff6b1a",
    accent: "#1f2937",
    iconColor: "#ffffff",
  },
  "going-nanners": {
    // Vendored from Tabler v3.43 (CDS still pins v3.41 which predates
    // the banana glyph) — see `./IconBanana.tsx`. Swap back to the
    // upstream `IconBanana` import once CDS bumps tabler.
    Icon: IconBanana,
    primary: "#ffd60a",
    accent: "#7c4a1a",
    iconColor: "#3a2410",
  },
  "sniper-mode": {
    Icon: IconViewfinder,
    primary: "#3b5323",
    accent: "#0a0a0a",
    iconColor: "#dc2626",
  },
  "blues-and-shrooms": {
    Icon: IconMushroom,
    primary: "#0047ab",
    accent: "#dc2626",
    iconColor: "#ffffff",
  },
  "blued-up": {
    Icon: IconSkull,
    primary: "#1e3a8a",
    accent: "#7c3aed",
    iconColor: "#e0e7ff",
  },
  overpowered: {
    Icon: IconStar,
    primary: "#fbbf24",
    accent: "#f0abfc",
    iconColor: "#ffffff",
  },
  "get-chomped": {
    Icon: IconBone,
    primary: "#0a0a0a",
    accent: "#9ca3af",
    iconColor: "#fca5a5",
  },
  "get-rich-quick": {
    Icon: IconCoin,
    primary: "#eab308",
    accent: "#10b981",
    iconColor: "#ffffff",
  },
  mk64: {
    Icon: IconDeviceGamepad,
    primary: "#ff1493",
    accent: "#5b21b6",
    iconColor: "#ffffff",
  },
  "running-of-the-bills": {
    Icon: IconRocket,
    primary: "#374151",
    accent: "#dc2626",
    iconColor: "#ffffff",
  },
};

/** Lookup helper — returns `undefined` for modes not in the registry
 *  so the caller can render a fallback (no icon, plain bg). */
export function getModePresentation(
  modeId: string,
): ModePresentation | undefined {
  return MODE_PRESENTATIONS[modeId];
}
