/**
 * Subscription tier checks and feature gating.
 * All tier checks happen server-side — never trust the client.
 */

export type SubscriptionTier = "free" | "member" | "creator" | "pro";

const TIER_LEVEL: Record<SubscriptionTier, number> = {
  free: 0,
  member: 1,
  creator: 2,
  pro: 3,
};

// Feature requirements — minimum tier level needed
const FEATURE_REQUIREMENTS = {
  // Member+
  "saved-configs-unlimited": 1,
  "advanced-stats": 1,
  "ad-free": 1,
  "custom-profile-url": 1,
  "member-badge": 1,
  // Creator+
  "tournaments-3-active": 2,
  "discord-bot": 2,
  "stream-overlay": 2,
  "channel-points": 2,
  "export-results": 2,
  "viewer-participation": 2,
  "stream-remote": 2,
  "vote-sessions": 2,
  "creator-badge": 2,
  "gs-result-command": 2,
  // Pro only
  "tournaments-unlimited": 3,
  "leagues": 3,
  "channel-points-unlimited": 3,
  "custom-overlay-branding": 3,
  "overlay-logo": 3,
  "tournament-templates": 3,
  "tournament-series": 3,
  "custom-vote-timing": 3,
  "per-redemption-cooldowns": 3,
  "stream-analytics": 3,
  "multi-stream-themes": 3,
  "discord-multi-server": 3,
  "pro-badge": 3,
  "pro-bot-commands": 3,
} as const;

export type Feature = keyof typeof FEATURE_REQUIREMENTS;

/** Check if a tier has access to a feature */
export function hasFeature(tier: SubscriptionTier, feature: Feature): boolean {
  return TIER_LEVEL[tier] >= FEATURE_REQUIREMENTS[feature];
}

/** Get the minimum tier required for a feature */
export function requiredTier(feature: Feature): SubscriptionTier {
  const level = FEATURE_REQUIREMENTS[feature];
  const entry = Object.entries(TIER_LEVEL).find(([, v]) => v === level);
  return (entry?.[0] || "pro") as SubscriptionTier;
}

/** Tier display labels */
export const TIER_LABELS: Record<SubscriptionTier, string> = {
  free: "Free",
  member: "Member",
  creator: "Creator",
  pro: "Pro",
};

// --- Limit enforcement ---

export const CONFIG_LIMITS: Record<SubscriptionTier, number> = {
  free: 5, member: Infinity, creator: Infinity, pro: Infinity,
};

export const TOURNAMENT_LIMITS: Record<SubscriptionTier, number> = {
  free: 1, member: 1, creator: 3, pro: Infinity,
};

export const LEAGUE_LIMITS: Record<SubscriptionTier, number> = {
  free: 0, member: 0, creator: 0, pro: 3,
};

export const REDEMPTION_LIMITS: Record<SubscriptionTier, number> = {
  free: 0, member: 0, creator: 2, pro: Infinity,
};

export const VOTE_SESSION_LIMITS: Record<SubscriptionTier, number> = {
  free: 0, member: 0, creator: 1, pro: 3,
};

export const DISCORD_SERVER_LIMITS: Record<SubscriptionTier, number> = {
  free: 0, member: 0, creator: 1, pro: 3,
};

export const DISCORD_INTEGRATION_LIMITS: Record<SubscriptionTier, number> = {
  free: 0, member: 0, creator: 2, pro: Infinity,
};

export const DISCORD_CHANNEL_LIMITS: Record<SubscriptionTier, number> = {
  free: 0, member: 0, creator: 1, pro: 5,
};

export const STREAM_THEME_LIMITS: Record<SubscriptionTier, number> = {
  free: 0, member: 0, creator: 1, pro: 3,
};

/** Check if a user is within their limit for a given resource */
export function isWithinLimit(
  tier: SubscriptionTier,
  limits: Record<SubscriptionTier, number>,
  currentCount: number
): boolean {
  return currentCount < limits[tier];
}
