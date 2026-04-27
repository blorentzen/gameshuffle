/**
 * Subscription tier checks and capability gating.
 * All capability checks happen server-side — never trust the client.
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
 * Capability vocabulary follows gs-pro-v1-architecture.md §3 — code checks
 * `hasCapability(user, cap)` rather than comparing tier names directly so
 * future tiers (e.g. Pro+) become a config edit instead of a code refactor.
 *
 * Staff users resolve to `HIGHEST_TIER` automatically (gs-pro-v1-
 * architecture-addendum.md §16.6) and can ephemerally impersonate other
 * tiers via the `gs_staff_view_as_tier` cookie. The cookie is read by
 * `src/lib/capabilities/staff-impersonation.ts` and threaded through here
 * via the `viewingAsTier` field on `CapabilityUser`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type SubscriptionTier = "free" | "pro";

/**
 * Highest tier currently available. Staff accounts inherit this tier's
 * capabilities automatically — when Pro+ launches, change this constant
 * (and add `'pro_plus'` to `SubscriptionTier`) and every staff account
 * picks up the new capability set with zero per-feature overrides.
 */
export const HIGHEST_TIER: SubscriptionTier = "pro";

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

/**
 * Tier → capabilities map. Each tier lists every capability it grants
 * explicitly (no inheritance computation) so the grant list is greppable
 * and easy to reason about.
 *
 * V1 capabilities per gs-pro-v1-architecture.md §3.2 are layered on top of
 * the prior capability set inherited from Phase 0.
 */
const TIER_CAPABILITIES = {
  free: [
    // V1 free capabilities (architecture §3.2)
    "randomizer.standalone",
    "auth.twitch_signin",
    "auth.discord_signin",
    "discord.bot_commands_standalone",
  ] as const,
  pro: [
    // All free capabilities — explicit, no inheritance
    "randomizer.standalone",
    "auth.twitch_signin",
    "auth.discord_signin",
    "discord.bot_commands_standalone",
    // V1 Pro capabilities (architecture §3.2)
    "session.create",
    "session.join_lobby",
    "session.platforms.single_streaming",
    "session.discord_integration",
    "session.modules.picks_bans",
    "session.modules.tournaments_basic",
    "hub.access",
    "mod.twitch_sync",
    // Pre-existing capabilities preserved from Phase 0
    "saved-configs-unlimited",
    "advanced-stats",
    "ad-free",
    "custom-profile-url",
    "member-badge",
    "tournaments-3-active",
    "discord-bot",
    "stream-overlay",
    "channel-points",
    "export-results",
    "viewer-participation",
    "stream-remote",
    "vote-sessions",
    "creator-badge",
    "gs-result-command",
    "tournaments-unlimited",
    "leagues",
    "channel-points-unlimited",
    "custom-overlay-branding",
    "overlay-logo",
    "tournament-templates",
    "tournament-series",
    "custom-vote-timing",
    "per-redemption-cooldowns",
    "stream-analytics",
    "multi-stream-themes",
    "discord-multi-server",
    "pro-badge",
    "pro-bot-commands",
  ] as const,
} as const;

export type Capability = (typeof TIER_CAPABILITIES)[SubscriptionTier][number];

/**
 * Pro+-only capabilities, declared here for forward compatibility but not
 * granted by any current tier. When Pro+ launches, these get appended to
 * the `pro_plus` entry in `TIER_CAPABILITIES` and the union widens
 * automatically. Reserving them as a type-level concept keeps grep'able.
 *
 * Mentioned in architecture §3.2 but unused in v1:
 *   - session.platforms.multi_streaming
 *   - session.discord_multi_server
 *   - session.modules.tournaments_advanced
 *   - session.multi_streamer
 *   - mod.explicit_invite
 */

/**
 * Shape passed to capability/limit helpers. Callers provide `tier` and
 * `role` from the `users` table; staff impersonation flows pass an
 * additional `viewingAsTier` resolved from the impersonation cookie
 * server-side.
 */
export interface CapabilityUser {
  tier: SubscriptionTier;
  role: string | null | undefined;
  /** Set by the staff impersonation helper when the staff cookie is present. */
  viewingAsTier?: SubscriptionTier;
}

export function isStaffRole(role: string | null | undefined): boolean {
  return role === "staff" || role === "admin";
}

/**
 * Resolve the effective tier for capability/limit checks.
 *
 * Order of precedence:
 *   1. Staff + impersonation cookie present → `viewingAsTier`
 *   2. Staff (no cookie) → `HIGHEST_TIER`
 *   3. Otherwise → the user's actual tier
 */
export function effectiveTier(user: CapabilityUser): SubscriptionTier {
  if (isStaffRole(user.role)) {
    if (user.viewingAsTier) return user.viewingAsTier;
    return HIGHEST_TIER;
  }
  return user.tier;
}

/**
 * Check whether a user has a given capability based on tier-level grants.
 * Synchronous — does NOT consult `feature_flags`. Use this for hot paths
 * (UI rendering, fast auth checks) where per-user flag overrides are not
 * needed. Use `hasCapabilityAsync` when you need to honor flag grants.
 */
export function hasCapability(user: CapabilityUser, capability: Capability): boolean {
  const tier = effectiveTier(user);
  return (TIER_CAPABILITIES[tier] as readonly string[]).includes(capability);
}

/**
 * Async capability check that merges tier capabilities with per-user
 * `feature_flags` grants. Used at API route gates where a user might have a
 * beta capability granted via a flag row their tier doesn't include.
 *
 * The supabase client must have read access to `feature_flags` (service
 * role or the user's own row via RLS).
 */
export async function hasCapabilityAsync(
  user: CapabilityUser,
  capability: Capability,
  supabase: SupabaseClient
): Promise<boolean> {
  if (hasCapability(user, capability)) return true;
  // Look up an unexpired flag row granting this capability.
  const userId = (user as CapabilityUser & { id?: string }).id;
  if (!userId) return false;
  const { data, error } = await supabase
    .from("feature_flags")
    .select("capability, expires_at")
    .eq("user_id", userId)
    .eq("capability", capability)
    .maybeSingle();
  if (error || !data) return false;
  if (data.expires_at && new Date(data.expires_at as string).getTime() < Date.now()) {
    return false;
  }
  return true;
}

/** Return the lowest tier that grants the capability. */
export function requiredTier(capability: Capability): SubscriptionTier {
  if ((TIER_CAPABILITIES.free as readonly string[]).includes(capability)) return "free";
  return "pro";
}

/** Tier display labels */
export const TIER_LABELS: Record<SubscriptionTier, string> = {
  free: "Free",
  pro: "Pro",
};

// --- Session-layer gates (the Free/Pro line) ---
//
// These wrappers exist so call sites read intent ("can this user create a
// session?") rather than capability strings. Internally they route through
// `hasCapability` so staff impersonation + future capability changes
// propagate without rewrites.

/** Can this user create a new GameShuffle session? */
export function canCreateSession(user: CapabilityUser): boolean {
  return hasCapability(user, "session.create");
}

/** Can this user bind a Discord server/channel to an active GS session? */
export function canBindDiscordToSession(user: CapabilityUser): boolean {
  return hasCapability(user, "session.discord_integration");
}

/** Can this user use the given feature module (Picks, Bans, future modules)? */
export function canUseFeatureModule(user: CapabilityUser, moduleId: string): boolean {
  if (moduleId === "picks_bans" || moduleId === "picks" || moduleId === "bans") {
    return hasCapability(user, "session.modules.picks_bans");
  }
  if (moduleId === "tournaments_basic") {
    return hasCapability(user, "session.modules.tournaments_basic");
  }
  // Unknown modules default deny — must be added to the registry above.
  return false;
}

/**
 * Can this user start the Twitch streamer integration OAuth flow?
 *
 * @deprecated Retained as an alias for call-site compatibility. Prefer
 * `canCreateSession` — it's the same check and aligns with the rule that
 * "anything that creates or joins a GS session is Pro".
 */
export function canUseTwitchIntegration(user: CapabilityUser): boolean {
  return canCreateSession(user);
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

// Internal export for tests and the staff impersonation helper.
export { TIER_LEVEL, TIER_CAPABILITIES };
