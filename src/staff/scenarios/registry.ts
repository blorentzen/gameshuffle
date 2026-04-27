/**
 * Scenario registry. Single source of truth for the /staff/scenarios
 * sidebar. Adding a new scenario is one entry here + an inline fixture
 * (or a dedicated fixture file if it grows beyond ~50 lines).
 *
 * All 29 starter scenarios per gs-dev-scenarios-spec.md §5. Categories
 * organize the sidebar; `validForTiers` drives the impersonation
 * compatibility warning in §3.2.
 */

import type { Scenario } from "./types";
import { ConnectionsView } from "./views/ConnectionsView";
import { HubView } from "./views/HubView";
import { AccountView } from "./views/AccountView";
import { ErrorView } from "./views/ErrorView";
import { ModulesView } from "./views/ModulesView";

// ---------- Reusable fixture pieces ----------------------------------------

const proUser = {
  id: "fixture-pro-user",
  display_name: "Pro Demo User",
  email: "pro-demo@example.com",
  avatar_seed: "gs-pro-demo",
  tier: "pro" as const,
};

const freeUser = {
  id: "fixture-free-user",
  display_name: "Free Demo User",
  email: "free-demo@example.com",
  avatar_seed: "gs-free-demo",
  tier: "free" as const,
};

const fullEventSubHealth = [
  { type: "channel.update", status: "enabled" as const },
  { type: "stream.online", status: "enabled" as const },
  { type: "stream.offline", status: "enabled" as const },
  { type: "channel.chat.message", status: "enabled" as const },
];

const partialEventSubHealth = [
  { type: "channel.update", status: "enabled" as const },
  { type: "stream.online", status: "enabled" as const },
  { type: "stream.offline", status: "missing" as const },
  { type: "channel.chat.message", status: "enabled" as const },
];

const healthyTwitch = {
  twitch_login: "demostreamer",
  twitch_display_name: "DemoStreamer",
  bot_authorized: true,
  scopes: ["user:read:email", "channel:bot", "user:read:chat", "channel:read:redemptions"],
  public_lobby_enabled: true,
  channel_points_enabled: true,
  channel_point_cost: 500,
  channel_point_reward_id: "reward-fixture-id",
  overlay_token: "demo-overlay-token",
  token_expires_at: new Date(Date.now() + 60 * 60_000).toISOString(),
  eventsub_subs: fullEventSubHealth,
};

const tokenExpiringTwitch = {
  ...healthyTwitch,
  token_expires_at: new Date(Date.now() + 4 * 60_000).toISOString(),
};

const botUnauthTwitch = {
  ...healthyTwitch,
  bot_authorized: false,
  channel_points_enabled: false,
  scopes: ["user:read:email"],
  eventsub_subs: partialEventSubHealth,
};

const healthyDiscord = {
  discord_user_id: "discord-fixture-id",
  discord_username: "demostreamer",
  discord_global_name: "Demo Streamer",
  discord_avatar_url: null,
  bot_in_servers: [{ server_id: "guild-1", server_name: "Demo Stream Community" }],
};

const SAMPLE_PARTICIPANTS_4 = [
  { id: "p1", display_name: "DemoStreamer", platform: "twitch" as const, joined_at: "2026-04-27T19:00:00Z", is_broadcaster: true },
  { id: "p2", display_name: "speedyturtle42", platform: "twitch" as const, joined_at: "2026-04-27T19:05:00Z", is_broadcaster: false },
  { id: "p3", display_name: "bananamaster", platform: "twitch" as const, joined_at: "2026-04-27T19:07:00Z", is_broadcaster: false },
  { id: "p4", display_name: "shellshocker", platform: "twitch" as const, joined_at: "2026-04-27T19:09:00Z", is_broadcaster: false },
];

const SAMPLE_PARTICIPANTS_16 = [
  ...SAMPLE_PARTICIPANTS_4,
  ...["rainbowroad", "blueshell", "yoshiegg", "kartwheel", "redshell", "boomerang", "dryBones", "luigiTime", "peachy", "bowserKing", "babyBros", "mushroomKid"].map((name, idx) => ({
    id: `p${5 + idx}`,
    display_name: name,
    platform: "twitch" as const,
    joined_at: new Date(Date.parse("2026-04-27T19:10:00Z") + idx * 30_000).toISOString(),
    is_broadcaster: false,
  })),
];

const SAMPLE_SHUFFLES = [
  { id: "e1", display_name: "DemoStreamer", is_broadcaster: true, combo: { character: { name: "Mario" }, vehicle: { name: "Standard Kart" }, wheels: { name: "Standard" }, glider: { name: "Super Glider" } }, trigger_type: "broadcaster_manual" as const, created_at: "2026-04-27T19:12:00Z" },
  { id: "e2", display_name: "speedyturtle42", is_broadcaster: false, combo: { character: { name: "Yoshi" }, vehicle: { name: "Mr. Scooty" }, wheels: { name: "Roller" }, glider: { name: "Parachute" } }, trigger_type: "chat_command" as const, created_at: "2026-04-27T19:14:00Z" },
  { id: "e3", display_name: "bananamaster", is_broadcaster: false, combo: { character: { name: "Donkey Kong" }, vehicle: { name: "Inkstriker" }, wheels: { name: "Slim" }, glider: { name: "Wario Wing" } }, trigger_type: "chat_command" as const, created_at: "2026-04-27T19:16:00Z" },
];

function makeSession(overrides: Record<string, unknown>) {
  return {
    id: `session-${overrides.id ?? "default"}`,
    name: "Mario Kart Wednesday",
    slug: "mario-kart-wednesday",
    status: "active" as const,
    activated_at: "2026-04-27T19:00:00Z",
    ended_at: null,
    platforms: { streaming: { type: "twitch", channel_id: "12345" } },
    config: { game: "mario-kart-8-deluxe", max_participants: 8 },
    feature_flags: {},
    ...overrides,
  };
}

// ---------- Scenarios ------------------------------------------------------

export const SCENARIOS: Scenario[] = [
  // ============== Connections (10) =====================================
  {
    id: "twitch-not-connected",
    name: "Twitch — not connected",
    category: "connections",
    description: "Empty state with Connect Twitch CTA.",
    validForTiers: ["free", "pro", "pro_plus"],
    fixture: { kind: "connection", user: freeUser, twitch: null, discord: null },
    view: ConnectionsView,
  },
  {
    id: "twitch-connecting",
    name: "Twitch — connecting",
    category: "connections",
    description: "User mid-OAuth flow, between authorize click and callback completion.",
    validForTiers: ["free", "pro", "pro_plus"],
    fixture: { kind: "connection", user: proUser, twitch: { ...healthyTwitch, bot_authorized: false, eventsub_subs: [] }, warningOverride: "connecting" },
    view: ConnectionsView,
  },
  {
    id: "twitch-connected-healthy",
    name: "Twitch — connected (healthy)",
    category: "connections",
    description: "Bot authorized, EventSub healthy, public lobby on, channel points enabled.",
    validForTiers: ["pro", "pro_plus"],
    suggestedTier: "pro",
    fixture: { kind: "connection", user: proUser, twitch: healthyTwitch },
    view: ConnectionsView,
  },
  {
    id: "twitch-token-expiring",
    name: "Twitch — token expiring",
    category: "connections",
    description: "Token within 5 minutes of expiry.",
    validForTiers: ["pro", "pro_plus"],
    suggestedTier: "pro",
    fixture: { kind: "connection", user: proUser, twitch: tokenExpiringTwitch, warningOverride: "token_expiring" },
    view: ConnectionsView,
  },
  {
    id: "twitch-bot-not-authorized",
    name: "Twitch — bot consent missing",
    category: "connections",
    description: "Connected but bot consent not granted. Warning state.",
    validForTiers: ["pro", "pro_plus"],
    suggestedTier: "pro",
    fixture: { kind: "connection", user: proUser, twitch: botUnauthTwitch, warningOverride: "bot_not_authorized" },
    view: ConnectionsView,
  },
  {
    id: "discord-not-connected",
    name: "Discord — not connected",
    category: "connections",
    description: "Discord card empty state.",
    validForTiers: ["free", "pro", "pro_plus"],
    fixture: { kind: "connection", user: freeUser, twitch: null, discord: null },
    view: ConnectionsView,
  },
  {
    id: "discord-connected-healthy",
    name: "Discord — connected (healthy)",
    category: "connections",
    description: "Discord connected with the bot installed in a server.",
    validForTiers: ["free", "pro", "pro_plus"],
    fixture: { kind: "connection", user: proUser, twitch: null, discord: healthyDiscord },
    view: ConnectionsView,
  },
  {
    id: "stripe-billing-no-subscription",
    name: "Billing — no subscription",
    category: "connections",
    description: "Free user, billing shows upgrade CTA.",
    validForTiers: ["free"],
    suggestedTier: "free",
    fixture: { kind: "billing", user: freeUser, billing: { status: "none", has_used_trial: false } },
    view: ConnectionsView,
  },
  {
    id: "stripe-billing-pro-active",
    name: "Billing — Pro active",
    category: "connections",
    description: "Pro user, billing shows current plan + manage button.",
    validForTiers: ["pro"],
    suggestedTier: "pro",
    fixture: { kind: "billing", user: proUser, billing: { status: "active", current_period_end: "2026-05-27T00:00:00Z", has_used_trial: true } },
    view: ConnectionsView,
  },
  {
    id: "stripe-billing-past-due",
    name: "Billing — past due",
    category: "connections",
    description: "Past-due state, payment retry banner visible.",
    validForTiers: ["pro"],
    suggestedTier: "pro",
    fixture: { kind: "billing", user: proUser, billing: { status: "past_due", current_period_end: "2026-04-27T00:00:00Z", has_used_trial: true } },
    view: ConnectionsView,
  },

  // ============== Sessions (10) ========================================
  {
    id: "hub-idle-no-sessions",
    name: "Hub — idle (no sessions)",
    category: "sessions",
    description: "Pro user, no active/scheduled/draft sessions.",
    validForTiers: ["pro", "pro_plus"],
    suggestedTier: "pro",
    fixture: { kind: "hub", user: proUser, twitch: healthyTwitch, activeSession: null, hubFocus: "idle" },
    view: HubView,
  },
  {
    id: "hub-draft-session",
    name: "Hub — draft session",
    category: "sessions",
    description: "One draft session in the list. (Phase 4 forward-looking.)",
    validForTiers: ["pro", "pro_plus"],
    suggestedTier: "pro",
    fixture: { kind: "hub", user: proUser, twitch: healthyTwitch, activeSession: null, scheduledSessions: [makeSession({ id: "draft-1", name: "Saturday Night Mario Kart", slug: "sat-night-mk", status: "draft", activated_at: null })], hubFocus: "draft" },
    view: HubView,
  },
  {
    id: "hub-active-just-started",
    name: "Hub — active just started",
    category: "sessions",
    description: "Active session, no participants yet, no shuffles.",
    validForTiers: ["pro", "pro_plus"],
    suggestedTier: "pro",
    fixture: { kind: "hub", user: proUser, twitch: healthyTwitch, activeSession: makeSession({ id: "active-fresh" }), participants: [SAMPLE_PARTICIPANTS_4[0]], recentEvents: [], hubFocus: "active" },
    view: HubView,
  },
  {
    id: "hub-active-with-participants",
    name: "Hub — active with participants",
    category: "sessions",
    description: "Active session, 4 participants, 3 recent shuffles.",
    validForTiers: ["pro", "pro_plus"],
    suggestedTier: "pro",
    fixture: { kind: "hub", user: proUser, twitch: healthyTwitch, activeSession: makeSession({ id: "active-busy" }), participants: SAMPLE_PARTICIPANTS_4, recentEvents: SAMPLE_SHUFFLES, hubFocus: "active" },
    view: HubView,
  },
  {
    id: "hub-active-many-participants",
    name: "Hub — active (16 participants)",
    category: "sessions",
    description: "Tests overflow / scrolling layouts at lobby cap.",
    validForTiers: ["pro", "pro_plus"],
    suggestedTier: "pro",
    fixture: { kind: "hub", user: proUser, twitch: healthyTwitch, activeSession: makeSession({ id: "active-full", config: { game: "mario-kart-world", max_participants: 24 } }), participants: SAMPLE_PARTICIPANTS_16, recentEvents: SAMPLE_SHUFFLES, hubFocus: "active" },
    view: HubView,
  },
  {
    id: "hub-active-mid-shuffle",
    name: "Hub — mid-shuffle",
    category: "sessions",
    description: "Active session with shuffle-in-progress UI state.",
    validForTiers: ["pro", "pro_plus"],
    suggestedTier: "pro",
    fixture: { kind: "hub", user: proUser, twitch: healthyTwitch, activeSession: makeSession({ id: "active-mid" }), participants: SAMPLE_PARTICIPANTS_4, recentEvents: SAMPLE_SHUFFLES.slice(0, 1), hubFocus: "active" },
    view: HubView,
  },
  {
    id: "hub-ending",
    name: "Hub — ending (wrap-up)",
    category: "sessions",
    description: "Session in `ending` state, recap computing.",
    validForTiers: ["pro", "pro_plus"],
    suggestedTier: "pro",
    fixture: { kind: "hub", user: proUser, twitch: healthyTwitch, activeSession: makeSession({ id: "ending", status: "ending", ended_at: new Date().toISOString() }), participants: SAMPLE_PARTICIPANTS_4, recentEvents: SAMPLE_SHUFFLES, hubFocus: "ending" },
    view: HubView,
  },
  {
    id: "hub-ended-recent",
    name: "Hub — ended recently",
    category: "sessions",
    description: "Session ended within last hour, recap visible.",
    validForTiers: ["pro", "pro_plus"],
    suggestedTier: "pro",
    fixture: { kind: "hub", user: proUser, twitch: healthyTwitch, activeSession: null, endedSessions: [makeSession({ id: "ended-1", status: "ended", ended_at: new Date(Date.now() - 30 * 60_000).toISOString() })], hubFocus: "ended" },
    view: HubView,
  },
  {
    id: "hub-test-session-active",
    name: "Hub — test session active",
    category: "sessions",
    description: "Active session with feature_flags.test_session=true; TEST badge visible.",
    validForTiers: ["pro", "pro_plus"],
    suggestedTier: "pro",
    fixture: { kind: "hub", user: proUser, twitch: healthyTwitch, activeSession: makeSession({ id: "test-active", feature_flags: { test_session: true } }), participants: [SAMPLE_PARTICIPANTS_4[0]], recentEvents: [], hubFocus: "active" },
    view: HubView,
  },
  {
    id: "hub-cancelled",
    name: "Hub — cancelled",
    category: "sessions",
    description: "Cancelled session in history list.",
    validForTiers: ["pro", "pro_plus"],
    suggestedTier: "pro",
    fixture: { kind: "hub", user: proUser, twitch: healthyTwitch, activeSession: null, endedSessions: [makeSession({ id: "cancelled-1", status: "cancelled", ended_at: new Date(Date.now() - 24 * 60 * 60_000).toISOString() })], hubFocus: "cancelled" },
    view: HubView,
  },

  // ============== Account (4) ==========================================
  {
    id: "account-pro-trial-day-1",
    name: "Account — Pro trial day 1",
    category: "account",
    description: "Pro trial just started, 13 days remaining.",
    validForTiers: ["pro"],
    suggestedTier: "pro",
    fixture: { kind: "account", user: proUser, billing: { status: "trialing", trial_ends_at: new Date(Date.now() + 13 * 24 * 60 * 60_000).toISOString(), has_used_trial: false }, trialDay: 1 },
    view: AccountView,
  },
  {
    id: "account-pro-trial-day-13",
    name: "Account — Pro trial day 13",
    category: "account",
    description: "Trial expiring tomorrow; reminder banner visible.",
    validForTiers: ["pro"],
    suggestedTier: "pro",
    fixture: { kind: "account", user: proUser, billing: { status: "trialing", trial_ends_at: new Date(Date.now() + 24 * 60 * 60_000).toISOString(), has_used_trial: false }, trialDay: 13 },
    view: AccountView,
  },
  {
    id: "account-pro-active",
    name: "Account — Pro active",
    category: "account",
    description: "Pro paid, active subscription, normal account view.",
    validForTiers: ["pro"],
    suggestedTier: "pro",
    fixture: { kind: "account", user: proUser, billing: { status: "active", current_period_end: "2026-05-27T00:00:00Z", has_used_trial: true } },
    view: AccountView,
  },
  {
    id: "account-staff-default",
    name: "Account — staff default",
    category: "account",
    description: "Staff user with no impersonation; full-access view.",
    validForTiers: ["pro", "pro_plus"],
    suggestedTier: "pro",
    fixture: { kind: "account", user: { ...proUser, display_name: "Britton (staff)", email: "britton@empac.co" }, billing: { status: "active", current_period_end: "2026-05-27T00:00:00Z", has_used_trial: true } },
    view: AccountView,
  },

  // ============== Errors (3) ===========================================
  {
    id: "error-rls-denied",
    name: "Error — RLS deny / empty data",
    category: "errors",
    description: "Component receives empty data due to RLS deny. Graceful empty state.",
    validForTiers: ["free", "pro", "pro_plus"],
    fixture: { kind: "error", user: proUser, errorType: "rls_denied" },
    view: ErrorView,
  },
  {
    id: "error-network-failure",
    name: "Error — network failure",
    category: "errors",
    description: "API call failed; component shows retry UI.",
    validForTiers: ["free", "pro", "pro_plus"],
    fixture: { kind: "error", user: proUser, errorType: "network_failure", errorMessage: "Couldn't reach the server (504). Check your connection and try again." },
    view: ErrorView,
  },
  {
    id: "error-stale-data",
    name: "Error — stale token",
    category: "errors",
    description: "Token expired mid-session; UI shows reconnect prompt.",
    validForTiers: ["pro", "pro_plus"],
    suggestedTier: "pro",
    fixture: { kind: "error", user: proUser, errorType: "stale_data" },
    view: ErrorView,
  },

  // ============== Modules (2) ==========================================
  {
    id: "module-picks-bans-config",
    name: "Module — picks/bans config",
    category: "modules",
    description: "Picks/bans module configuration UI.",
    validForTiers: ["pro", "pro_plus"],
    suggestedTier: "pro",
    fixture: {
      kind: "module",
      user: proUser,
      twitch: healthyTwitch,
      activeSession: makeSession({ id: "modules-config" }),
      modules: [
        { module_id: "kart_randomizer", enabled: true, config: { cooldown_seconds: 30 }, state: { status: "collecting" } },
        { module_id: "picks", enabled: true, config: { categories: ["characters", "karts"], picks_per_participant: 1, timer_seconds: 60 }, state: { status: "collecting", picks: [], timer_started_at: null, locked_at: null } },
        { module_id: "bans", enabled: false, config: { categories: ["tracks"], bans_per_participant: 1, timer_seconds: 45 }, state: { status: "collecting", bans: [], timer_started_at: null, locked_at: null } },
      ],
      focus: "config",
    },
    view: ModulesView,
  },
  {
    id: "module-picks-bans-mid-flow",
    name: "Module — picks/bans mid-flow",
    category: "modules",
    description: "Mid-pick state with timer running and a few picks already in.",
    validForTiers: ["pro", "pro_plus"],
    suggestedTier: "pro",
    fixture: {
      kind: "module",
      user: proUser,
      twitch: healthyTwitch,
      activeSession: makeSession({ id: "modules-mid" }),
      modules: [
        { module_id: "kart_randomizer", enabled: true, config: { cooldown_seconds: 30 }, state: { status: "collecting" } },
        {
          module_id: "picks",
          enabled: true,
          config: { categories: ["characters"], picks_per_participant: 1, timer_seconds: 60 },
          state: {
            status: "collecting",
            picks: [
              { user: "speedyturtle42", value: "Yoshi" },
              { user: "bananamaster", value: "Donkey Kong" },
            ],
            timer_started_at: new Date(Date.now() - 30_000).toISOString(),
            locked_at: null,
          },
        },
      ],
      focus: "mid_flow",
    },
    view: ModulesView,
  },
];

// ---------- Helpers --------------------------------------------------------

export const CATEGORY_ORDER: Scenario["category"][] = [
  "connections",
  "sessions",
  "account",
  "errors",
  "modules",
];

export const CATEGORY_LABELS: Record<Scenario["category"], string> = {
  connections: "Connections",
  sessions: "Sessions",
  account: "Account",
  errors: "Errors",
  modules: "Modules",
};

export function getScenarioById(id: string): Scenario | undefined {
  return SCENARIOS.find((s) => s.id === id);
}

export function getScenariosByCategory(category: Scenario["category"]): Scenario[] {
  return SCENARIOS.filter((s) => s.category === category);
}
