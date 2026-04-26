/**
 * Subscription tier checks and feature gating.
 * All tier checks happen server-side — never trust the client.
 *
 * Two tiers at launch per gs-subscription-architecture.md:
 *   - free: marketing funnel + utility floor (standalone randomizers, blog,
 *           game ideas). No session binding, no integrations.
 *   - pro:  $9/mo or $99/yr. GS session coordination layer, all integrations,
 *           feature modules, channel points, overlay, test mode.
 *
 * The Free/Pro line: **anything that creates or joins a GS session is Pro**.
 * Standalone randomizer output stays Free forever.
 *
 * Future tiers (e.g. GS Max, add-ons) will be added once real usage data
 * surfaces a ceiling — don't pre-introduce them here.
 */

export type SubscriptionTier = "free" | "pro";

const TIER_LEVEL: Record<SubscriptionTier, number> = {
  free: 0,
  pro: 1,
};

/**
 * Normalize a stored tier string into a canonical SubscriptionTier. Legacy
 * values from the old 4-tier model (`member`, `creator`) collapse into
 * `pro` — they were paid tiers and we don't want to demote existing
 * holders. Anything unrecognized defaults to `free`.
 */
export function normalizeTier(raw: string | null | undefined): SubscriptionTier {
  if (raw === "pro" || raw === "member" || raw === "creator") return "pro";
  return "free";
}

// Feature requirements — minimum tier level needed. All paid features
// collapse to `pro` (level 1) under the two-tier model.
const FEATURE_REQUIREMENTS = {
  // Pro-only
  "saved-configs-unlimited": 1,
  "advanced-stats": 1,
  "ad-free": 1,
  "custom-profile-url": 1,
  "member-badge": 1,
  "tournaments-3-active": 1,
  "discord-bot": 1,
  "stream-overlay": 1,
  "channel-points": 1,
  "export-results": 1,
  "viewer-participation": 1,
  "stream-remote": 1,
  "vote-sessions": 1,
  "creator-badge": 1,
  "gs-result-command": 1,
  "tournaments-unlimited": 1,
  "leagues": 1,
  "channel-points-unlimited": 1,
  "custom-overlay-branding": 1,
  "overlay-logo": 1,
  "tournament-templates": 1,
  "tournament-series": 1,
  "custom-vote-timing": 1,
  "per-redemption-cooldowns": 1,
  "stream-analytics": 1,
  "multi-stream-themes": 1,
  "discord-multi-server": 1,
  "pro-badge": 1,
  "pro-bot-commands": 1,
} as const;

export type Feature = keyof typeof FEATURE_REQUIREMENTS;

/** Check if a tier has access to a feature */
export function hasFeature(tier: SubscriptionTier, feature: Feature): boolean {
  return TIER_LEVEL[tier] >= FEATURE_REQUIREMENTS[feature];
}

/** Get the minimum tier required for a feature */
export function requiredTier(feature: Feature): SubscriptionTier {
  const level = FEATURE_REQUIREMENTS[feature] as number;
  return level <= 0 ? "free" : "pro";
}

/** Tier display labels */
export const TIER_LABELS: Record<SubscriptionTier, string> = {
  free: "Free",
  pro: "Pro",
};

// --- Staff override ---
// Set public.users.role = 'staff' to grant a user pro-equivalent access for
// internal testing without polluting subscription metrics. See
// `effectiveTier()` — callers should resolve the effective tier server-side
// and only then call `hasFeature()` / `isWithinLimit()`.

export function isStaffRole(role: string | null | undefined): boolean {
  return role === "staff" || role === "admin";
}

/**
 * Resolve the effective tier for feature/limit checks. Staff/admin rows
 * get treated as `pro`. Never call subscription helpers directly with the
 * raw DB tier if you want the override to apply.
 */
export function effectiveTier(args: {
  tier: SubscriptionTier;
  role: string | null | undefined;
}): SubscriptionTier {
  if (isStaffRole(args.role)) return "pro";
  return args.tier;
}

// --- Session-layer gates (the Free/Pro line) ---
//
// The spec's architectural rule: anything that creates or joins a GS
// session is Pro. These helpers are the single source of truth for that
// check — use them at session-creation / join sites instead of inline
// tier comparisons so the rule is enforced consistently.

/** Can this user create a new GameShuffle session (Twitch, Discord-bound, etc.)? */
export function canCreateSession(tier: SubscriptionTier): boolean {
  return TIER_LEVEL[tier] >= TIER_LEVEL.pro;
}

/** Can this user bind a Discord server/channel to an active GS session? */
export function canBindDiscordToSession(tier: SubscriptionTier): boolean {
  return TIER_LEVEL[tier] >= TIER_LEVEL.pro;
}

/**
 * Can this user use the given feature module (Picks, Bans, future modules)?
 * Takes a module id rather than a SubscriptionTier comparison so future
 * module-specific gating (e.g., experimental modules at higher tiers) can
 * land here without touching every call site.
 */
export function canUseFeatureModule(tier: SubscriptionTier, moduleId: string): boolean {
  // moduleId reserved for future per-module gating (e.g. beta modules at a
  // higher tier). Today every module is Pro-only.
  void moduleId;
  return TIER_LEVEL[tier] >= TIER_LEVEL.pro;
}

/**
 * Can this user start the Twitch streamer integration OAuth flow?
 *
 * @deprecated Retained as an alias for call-site compatibility. Prefer
 * `canCreateSession` — it's the same check and aligns with the rule that
 * "anything that creates or joins a GS session is Pro".
 */
export function canUseTwitchIntegration(tier: SubscriptionTier): boolean {
  return canCreateSession(tier);
}

// --- Limit enforcement ---
//
// Per spec §4: don't actually enforce limits in v1. Ship Pro without
// limits and instrument usage for 3-6 months to calibrate. The constants
// below are placeholders — they keep call-site code compiling without
// imposing friction on real users.

export const CONFIG_LIMITS: Record<SubscriptionTier, number> = {
  free: 5,
  pro: Infinity,
};

export const TOURNAMENT_LIMITS: Record<SubscriptionTier, number> = {
  free: 1,
  pro: Infinity,
};

export const LEAGUE_LIMITS: Record<SubscriptionTier, number> = {
  free: 0,
  pro: Infinity,
};

export const REDEMPTION_LIMITS: Record<SubscriptionTier, number> = {
  free: 0,
  pro: Infinity,
};

export const VOTE_SESSION_LIMITS: Record<SubscriptionTier, number> = {
  free: 0,
  pro: Infinity,
};

export const DISCORD_SERVER_LIMITS: Record<SubscriptionTier, number> = {
  free: 0,
  pro: Infinity,
};

export const DISCORD_INTEGRATION_LIMITS: Record<SubscriptionTier, number> = {
  free: 0,
  pro: Infinity,
};

export const DISCORD_CHANNEL_LIMITS: Record<SubscriptionTier, number> = {
  free: 0,
  pro: Infinity,
};

export const STREAM_THEME_LIMITS: Record<SubscriptionTier, number> = {
  free: 0,
  pro: Infinity,
};

/** Check if a user is within their limit for a given resource */
export function isWithinLimit(
  tier: SubscriptionTier,
  limits: Record<SubscriptionTier, number>,
  currentCount: number
): boolean {
  return currentCount < limits[tier];
}
