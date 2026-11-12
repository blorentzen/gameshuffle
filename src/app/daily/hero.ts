import type { BrowseHeroProps } from "@/components/events/BrowseHero";

/** The page's header. */
export const DAILY_HERO: BrowseHeroProps = {
  eyebrow: "A GameShuffle Original",
  title: "The Daily Shuffle",
  // Sonic Saturdays start Nov 21, 2026 (daily.ts ROTATIONS); drop "from November 21" once that's past.
  sub: "Guess today's character from 130 across Nintendo, and a Sonic character on Saturdays from November 21. The same one for everyone, new at midnight Pacific.",
  subShort: "Guess today's character from 130 across Nintendo.",
  accent: "daily",
  field: "daily",
  compact: true,
};
