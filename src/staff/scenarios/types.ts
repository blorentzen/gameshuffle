/**
 * Scenario fixture types for /staff/scenarios.
 *
 * A scenario is a renderable UI state with hardcoded fixture data. Per
 * gs-dev-scenarios-spec.md §2.
 *
 * Fixtures are typed unions per surface area — each fixture file declares
 * which `kind` it satisfies, and the renderer picks the right view based
 * on the kind. Keeps fixtures + views loosely coupled while still typed.
 */

import type { ReactNode } from "react";

export type ScenarioCategory =
  | "connections"
  | "sessions"
  | "account"
  | "errors"
  | "modules";

export type TierTag = "free" | "pro" | "pro_plus" | "unauth";

// ---------- Fixture data shapes (per surface area) -------------------------

export interface FakeUser {
  id: string;
  display_name: string;
  email: string;
  avatar_seed: string;
  /** Pretend tier the fixture user is on. Different from the staff
   *  impersonation tier — fixtures may render as a Pro user even when
   *  staff is impersonating Free, to demonstrate "what the Pro user
   *  sees right now". */
  tier: "free" | "pro" | "pro_plus";
}

export interface FakeTwitchConnection {
  twitch_login: string;
  twitch_display_name: string;
  bot_authorized: boolean;
  scopes: string[];
  public_lobby_enabled: boolean;
  channel_points_enabled: boolean;
  channel_point_cost: number;
  channel_point_reward_id: string | null;
  overlay_token: string | null;
  /** Optional — token expiry simulation. */
  token_expires_at: string | null;
  /** EventSub health snapshot. */
  eventsub_subs: Array<{ type: string; status: "enabled" | "failed" | "missing" }>;
}

export interface FakeDiscordConnection {
  discord_user_id: string;
  discord_username: string;
  discord_global_name: string | null;
  discord_avatar_url: string | null;
  bot_in_servers: Array<{ server_id: string; server_name: string }>;
}

export interface FakeStripeBilling {
  /** Subscription state as it would appear server-side. */
  status: "none" | "trialing" | "active" | "past_due" | "incomplete" | "canceled";
  trial_ends_at?: string | null;
  current_period_end?: string | null;
  has_used_trial: boolean;
  cancel_at_period_end?: boolean;
}

export interface FakeSession {
  id: string;
  name: string;
  slug: string;
  status: "draft" | "scheduled" | "ready" | "active" | "ending" | "ended" | "cancelled";
  activated_at: string | null;
  ended_at: string | null;
  platforms: Record<string, unknown>;
  config: Record<string, unknown>;
  feature_flags: Record<string, unknown>;
}

export interface FakeParticipant {
  id: string;
  display_name: string;
  platform: "twitch" | "discord";
  joined_at: string;
  is_broadcaster: boolean;
  current_combo?: Record<string, unknown> | null;
}

export interface FakeShuffleEvent {
  id: string;
  display_name: string;
  is_broadcaster: boolean;
  combo: { character?: { name: string }; vehicle?: { name: string }; wheels?: { name: string }; glider?: { name: string } };
  trigger_type: "chat_command" | "channel_points" | "broadcaster_manual";
  created_at: string;
}

export interface FakeModuleState {
  module_id: "picks" | "bans" | "kart_randomizer";
  enabled: boolean;
  config: Record<string, unknown>;
  state: Record<string, unknown>;
}

// ---------- Tagged fixture union ------------------------------------------

interface BaseFixture {
  user: FakeUser;
}

export interface ConnectionFixture extends BaseFixture {
  kind: "connection";
  twitch?: FakeTwitchConnection | null;
  discord?: FakeDiscordConnection | null;
  /** Optional — drives the "token expiring" / "bot not authorized" warning UI. */
  warningOverride?: "token_expiring" | "bot_not_authorized" | "connecting";
}

export interface BillingFixture extends BaseFixture {
  kind: "billing";
  billing: FakeStripeBilling;
}

export interface HubFixture extends BaseFixture {
  kind: "hub";
  twitch?: FakeTwitchConnection | null;
  activeSession?: FakeSession | null;
  scheduledSessions?: FakeSession[];
  endedSessions?: FakeSession[];
  participants?: FakeParticipant[];
  recentEvents?: FakeShuffleEvent[];
  /** Optional — surfaces a label like "Mid-shuffle" for snapshot states. */
  hubFocus?: "idle" | "draft" | "active" | "ending" | "ended" | "cancelled";
}

export interface AccountFixture extends BaseFixture {
  kind: "account";
  billing: FakeStripeBilling;
  twitch?: FakeTwitchConnection | null;
  discord?: FakeDiscordConnection | null;
  /** Optional — show the current trial countdown banner. */
  trialDay?: number;
}

export interface ErrorFixture extends BaseFixture {
  kind: "error";
  errorType: "rls_denied" | "network_failure" | "stale_data";
  errorMessage?: string;
}

export interface ModuleFixture extends BaseFixture {
  kind: "module";
  twitch: FakeTwitchConnection;
  activeSession: FakeSession;
  modules: FakeModuleState[];
  focus: "config" | "mid_flow";
}

export type ScenarioFixture =
  | ConnectionFixture
  | BillingFixture
  | HubFixture
  | AccountFixture
  | ErrorFixture
  | ModuleFixture;

// ---------- Scenario record -----------------------------------------------

export interface Scenario {
  /** Stable identifier, kebab-case. Used in URL: /staff/scenarios?id=<id> */
  id: string;
  /** Human-readable label for the sidebar. */
  name: string;
  category: ScenarioCategory;
  /** Optional one-liner explaining what this scenario tests. */
  description?: string;
  /** Tiers this scenario is meaningful for. */
  validForTiers: TierTag[];
  /** Optional — when current tier is incompatible, suggest switching to this one. */
  suggestedTier?: TierTag;
  /** The fixture data passed to the view. */
  fixture: ScenarioFixture;
  /** The component that renders the fixture. */
  view: (props: { fixture: ScenarioFixture }) => ReactNode;
}
