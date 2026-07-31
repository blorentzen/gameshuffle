/**
 * Idea Board constants — single source for caps, categories, statuses, and
 * award amounts (spec §3.1, §5.4, §7). All server-enforced; client counters are
 * UX only.
 */

export const IDEA_LIMITS = {
  titleMax: 100,
  bodyMax: 1000,
  submissionsPer24h: 3,
  expiryDays: 60,
  defaultCycleSlots: 5,
} as const;

export const IDEA_CATEGORIES = [
  "game_idea",
  "randomizer",
  "tool",
  "platform",
  "other",
] as const;
export type IdeaCategory = (typeof IDEA_CATEGORIES)[number];

export const IDEA_CATEGORY_LABELS: Record<IdeaCategory, string> = {
  game_idea: "Game idea",
  randomizer: "Randomizer",
  tool: "Tool",
  platform: "Platform",
  other: "Other",
};

export const IDEA_STATUSES = [
  "submitted",
  "rejected",
  "public",
  "expired",
  "in_review",
  "planned",
  "shipped",
  "declined",
] as const;
export type IdeaStatus = (typeof IDEA_STATUSES)[number];

/** Statuses visible on the public board (§4). */
export const PUBLIC_IDEA_STATUSES: readonly IdeaStatus[] = [
  "public",
  "in_review",
  "planned",
  "shipped",
  "declined",
];

/**
 * Token awards (§5.4) — platform-level, ceiling-exempt mints, config not DB.
 * Acceptance is modest; shipping is the real payoff (attribution aside).
 */
export const IDEA_AWARDS = {
  accepted: 250,
  shipped: 2500,
} as const;
