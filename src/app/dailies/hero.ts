import type { BrowseHeroProps } from "@/components/events/BrowseHero";

/** The page's header, shared with its loading outline so the header never jumps when the page arrives. */
export const DAILIES_HERO: BrowseHeroProps = {
  title: "All dailies",
  sub: "New puzzles at midnight Pacific.",
  accent: "daily",
  field: "originals",
  compact: true,
};
