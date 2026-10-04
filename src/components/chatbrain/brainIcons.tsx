/**
 * Chat Brain's icons: one Tabler glyph per category (the same icon set as the
 * rest of the UI and the generated header art), with a fallback for any
 * category added later.
 */
import type { ComponentType } from "react";
import {
  IconBriefcase, IconBroadcast, IconBrain, IconDeviceGamepad2, IconDice5, IconHome, IconPizza, IconSteeringWheel, IconSun,
} from "@tabler/icons-react";

type TablerIcon = ComponentType<{ size?: number | string; stroke?: number; className?: string; "aria-hidden"?: boolean }>;

export const CATEGORY_ICONS: Record<string, TablerIcon> = {
  "game-night": IconDice5,
  gaming: IconDeviceGamepad2,
  "mario-kart": IconSteeringWheel,
  food: IconPizza,
  family: IconHome,
  streaming: IconBroadcast,
  "school-work": IconBriefcase,
  everyday: IconSun,
};

export function CategoryIcon({ slug, size = 16 }: { slug: string; size?: number }) {
  const I = CATEGORY_ICONS[slug] ?? IconBrain;
  return <I size={size} stroke={1.75} aria-hidden />;
}
