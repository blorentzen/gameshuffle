/**
 * GameShuffle Circuit — the organizer plan (Pricing Model v2).
 *
 * The paid axis is NOT formats (every format is free) — it's **field size** (the
 * meter that sets the tier) plus a small set of **organizer features**. Free runs
 * one full lobby of the selected game; Circuit 64 / 256 raise the cap and unlock
 * the four paid organizer features; Circuit Events is a per-tournament, invoiced
 * override.
 *
 * Entitlement precedence (Decision 8, highest wins):
 *   billing flag OFF → full access
 *   per-tournament override (gs_sponsored / circuit_events / partner_comp) → full
 *     access, cap from the override
 *   active subscription tier → the tier's cap + paid features
 *   otherwise → Free (cap = one game lobby, no paid features)
 *
 * Client-safe: constants + pure resolution. DB reads (the billing flag, the
 * account's circuit tier, per-tournament overrides) happen at the call site and
 * are passed in as a `CircuitContext`.
 */

import { gsAddDays, gsDay, gsDayStart } from "@/lib/time/gsClock";

/** Fallback when the platform flag can't be read. Live value comes from the
 *  `organizer_billing_enabled` flag (getPlatformFlag). */
export const DEFAULT_ORGANIZER_BILLING_ENABLED = false;

/** The platform-flag key the admin panel toggles. */
export const ORGANIZER_BILLING_FLAG = "organizer_billing_enabled";

/**
 * Optional: a future day (ISO date, Pacific) to announce before paid Circuit
 * plans start. `null` (the default) = nothing announced. Turning on
 * `organizer_billing_enabled` in Platform ▸ Switches is the launch itself: the
 * switch stamps the launch moment (`organizer_billing_enabled_at`), and from
 * then on the Terms (§3.4), /gs-circuit, the pricing block and the create form
 * read as live. Set this only to show "free until {day}" ahead of time.
 */
export const ORGANIZER_BILLING_LAUNCH: string | null = null;

/**
 * Terms §3.4 promises organizers already using Circuit an email at least 30
 * days before any charge applies. Anyone who created a tournament before the
 * launch keeps every Circuit feature free for this many days, counted from
 * the later of the launch and the notice email (`organizer_circuit_notice_at`,
 * stamped by scripts/send-circuit-launch-notice.ts).
 */
export const CIRCUIT_LAUNCH_GRACE_DAYS = 30;

export type CircuitLaunchPhase = "preview" | "announced" | "live";

const pacificLabel = (at: number) =>
  new Date(at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/Los_Angeles" });

/**
 * Where the Circuit launch stands, for copy: still in preview, announced with
 * a date, or live. Pass the launch moment (the billing switch's anchor) when
 * the caller has it: once billing is on, that wins over the announced day.
 */
export function circuitLaunch(
  launchedAt: string | null = null,
  now = Date.now(),
): { phase: CircuitLaunchPhase; date: string | null; dateLabel: string | null } {
  if (launchedAt) {
    const at = Date.parse(launchedAt);
    if (Number.isFinite(at)) return { phase: "live", date: launchedAt, dateLabel: pacificLabel(at) };
  }
  if (!ORGANIZER_BILLING_LAUNCH) return { phase: "preview", date: null, dateLabel: null };
  const at = Date.parse(`${ORGANIZER_BILLING_LAUNCH.slice(0, 10)}T12:00:00-08:00`);
  // An announced day that has passed without the switch on reads as preview:
  // nothing is charged until the switch flips, so the copy can't say "free until".
  if (now >= at) return { phase: "preview", date: null, dateLabel: null };
  return { phase: "announced", date: ORGANIZER_BILLING_LAUNCH, dateLabel: pacificLabel(at) };
}

/** What a bigger field takes, from the cap a tournament just hit. */
export function biggerFieldLine(cap: number): string {
  if (cap < 64) return "GameShuffle Circuit 64 lets up to 64 join, and Circuit 256 up to 256.";
  if (cap < 256) return "GameShuffle Circuit 256 lets up to 256 join.";
  return "For a bigger event, write to us about a Circuit Events pass.";
}

/**
 * When an existing organizer's free Circuit ends, given the launch and notice
 * moments: the end of the Pacific day CIRCUIT_LAUNCH_GRACE_DAYS after the
 * later one, so "free until November 9" holds all of November 9.
 */
export function circuitGraceEnd(launchedAt: string | null, noticeAt: string | null = null): { at: number; label: string } | null {
  const starts = [launchedAt, noticeAt].map((x) => (x ? Date.parse(x) : NaN)).filter(Number.isFinite);
  if (!starts.length) return null;
  const lastDay = gsAddDays(gsDay(Math.max(...starts)), CIRCUIT_LAUNCH_GRACE_DAYS);
  const at = gsDayStart(gsAddDays(lastDay, 1)).getTime() - 1;
  return { at, label: pacificLabel(at) };
}

/** Fallback lobby size for game-agnostic display (real cap comes from game config). */
export const DEFAULT_LOBBY_SIZE = 12;

// ---------------------------------------------------------------------------
// Pro × Circuit relationship (see specs/gs-circuit-pro-addendum.md)
// ---------------------------------------------------------------------------

/**
 * How GameShuffle Pro relates to each Circuit tier. Circuit 256 bundles Pro at
 * no extra cost; Circuit 64 can add Pro as a discounted add-on tied to the
 * subscription's billing interval. Standalone Pro is unchanged. These are
 * copy/positioning constants — the entitlement + billing wiring (getProAccess,
 * plan-change resolver) is a separate phase.
 */
export const PRO_STANDALONE_PRICE = { monthlyUsd: 9, annualUsd: 99 } as const;
export const PRO_ADDON_PRICE = { monthlyUsd: 5, annualUsd: 50 } as const;
/** Marketed value of the Pro subscription bundled into Circuit 256. */
export const PRO_INCLUDED_ANNUAL_VALUE = PRO_STANDALONE_PRICE.annualUsd;

// ---------------------------------------------------------------------------
// Tiers (single source of truth)
// ---------------------------------------------------------------------------

export type CircuitTierId = "free" | "circuit_64" | "circuit_256" | "circuit_events";

/** Paid organizer features gated behind a Circuit subscription. `randomizer` =
 *  the LIVE reveal of randomized rounds (real-time, viewer-facing) — setup is
 *  free, going live is paid. */
export type CircuitFeature = "series" | "co_organizers" | "branding" | "seeding" | "randomizer" | "analytics" | "promo_codes";
/** The ones advertised on the pricing page. `promo_codes` is deliberately absent
 *  until it exists; the union carries it so the gate can be written once. */
export const CIRCUIT_PAID_FEATURES: CircuitFeature[] = ["series", "co_organizers", "branding", "seeding", "randomizer", "analytics"];

export interface CircuitTier {
  id: CircuitTierId;
  displayName: string;
  /** Player cap. A number, `'lobby'` (one game lobby), or `'override'` (per-event). */
  playerCap: number | "lobby" | "override";
  /** Whether this tier unlocks the four paid organizer features. */
  paidFeatures: boolean;
  /** Price in USD, `'quoted'` (invoiced), or `null` (free). */
  price: { monthlyUsd: number; annualUsd: number } | "quoted" | null;
  /** Reserved for the billing spec — not wired to Stripe yet. */
  stripeLookupKeys?: { monthly: string; annual: string };
  blurb: string;
}

export const CIRCUIT_TIERS: CircuitTier[] = [
  {
    id: "free",
    displayName: "Free",
    playerCap: "lobby",
    paidFeatures: false,
    price: null,
    blurb: "One full lobby, every format. Live scoring, a public join page, picks & bans and build rules, at no account cost.",
  },
  {
    id: "circuit_64",
    displayName: "Circuit 64",
    playerCap: 64,
    paidFeatures: true,
    price: { monthlyUsd: 12, annualUsd: 120 },
    stripeLookupKeys: { monthly: "circuit_64_monthly", annual: "circuit_64_annual" },
    blurb: "Multi-lobby events up to 64 players, plus championship series, co-organizers, custom branding, and seeding.",
  },
  {
    id: "circuit_256",
    displayName: "Circuit 256",
    playerCap: 256,
    paidFeatures: true,
    price: { monthlyUsd: 29, annualUsd: 290 },
    stripeLookupKeys: { monthly: "circuit_256_monthly", annual: "circuit_256_annual" },
    blurb: "Everything in Circuit 64, scaled to 256-player fields for regional events and open brackets.",
  },
  {
    id: "circuit_events",
    displayName: "Circuit Events",
    playerCap: "override",
    paidFeatures: true,
    price: "quoted",
    blurb: "Running an in-person or commercial event? A per-tournament pass sized to your field. Let's talk.",
  },
];

export function circuitTier(id: CircuitTierId | null | undefined): CircuitTier {
  return CIRCUIT_TIERS.find((t) => t.id === id) ?? CIRCUIT_TIERS[0];
}

/** The paid subscription tiers (excludes Free + the invoiced Events tier). */
export const CIRCUIT_SUBSCRIPTION_TIERS = CIRCUIT_TIERS.filter(
  (t) => t.id === "circuit_64" || t.id === "circuit_256",
);

// ---------------------------------------------------------------------------
// Resolution (Decision 8 precedence)
// ---------------------------------------------------------------------------

/** A per-tournament access override (the Phase 5 admin grant). */
export interface CircuitOverride {
  type: "gs_sponsored" | "circuit_events" | "partner_comp";
  /** Null = unlimited. */
  playerCap: number | null;
}

export interface CircuitContext {
  /** From the `organizer_billing_enabled` platform flag. */
  billingEnabled: boolean;
  /** Staff/admin — full access, like Pro, for operational/testing use. */
  isStaff?: boolean;
  /** The organizer account's active Circuit subscription tier, if any. */
  circuitTier?: CircuitTierId | null;
  /** A per-tournament override (gs_sponsored / circuit_events / partner_comp). */
  override?: CircuitOverride | null;
  /** One full lobby of the tournament's game (the Free cap). */
  gameLobbySize?: number;
}

export interface CircuitResolution {
  /** Effective max field size. */
  playerCap: number;
  /** Whether the four paid organizer features are unlocked. */
  paidFeatures: boolean;
  /** What granted access, for messaging/debug. */
  source: "preview" | "grandfathered" | "grace" | "override" | "subscription" | "free";
}

export function resolveCircuit(ctx: CircuitContext): CircuitResolution {
  const lobby = ctx.gameLobbySize ?? DEFAULT_LOBBY_SIZE;

  // 1. Billing off → full access for everyone (preview).
  if (!ctx.billingEnabled) return { playerCap: Number.POSITIVE_INFINITY, paidFeatures: true, source: "preview" };

  // 1b. Staff/admin → full access, matching how they get Pro.
  if (ctx.isStaff) return { playerCap: Number.POSITIVE_INFINITY, paidFeatures: true, source: "preview" };

  // 2. Per-tournament override → full features, cap from the override.
  if (ctx.override) {
    return { playerCap: ctx.override.playerCap ?? Number.POSITIVE_INFINITY, paidFeatures: true, source: "override" };
  }

  // 3. Active subscription tier → tier cap + paid features.
  const tier = circuitTier(ctx.circuitTier);
  if (tier.id === "circuit_64" || tier.id === "circuit_256") {
    return { playerCap: typeof tier.playerCap === "number" ? tier.playerCap : lobby, paidFeatures: true, source: "subscription" };
  }

  // 4. Free.
  return { playerCap: lobby, paidFeatures: false, source: "free" };
}

/** Effective field-size cap for a context. */
export function getPlayerCap(ctx: CircuitContext): number {
  return resolveCircuit(ctx).playerCap;
}

/** Whether a paid organizer feature is available. All four share one gate. */
export function hasCircuitFeature(ctx: CircuitContext, _feature: CircuitFeature): boolean {
  return resolveCircuit(ctx).paidFeatures;
}

/** The smallest tier whose cap covers `players` (for the upgrade prompt). */
export function tierForPlayerCount(players: number): CircuitTier | null {
  for (const t of CIRCUIT_SUBSCRIPTION_TIERS) {
    if (typeof t.playerCap === "number" && players <= t.playerCap) return t;
  }
  return CIRCUIT_TIERS.find((t) => t.id === "circuit_events") ?? null;
}

/** True when billing is off (preview) — used to show "planned" hints. */
export function inFreePreview(billingEnabled: boolean): boolean {
  return !billingEnabled;
}
