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

/** Fallback when the platform flag can't be read. Live value comes from the
 *  `organizer_billing_enabled` flag (getPlatformFlag). */
export const DEFAULT_ORGANIZER_BILLING_ENABLED = false;

/** The platform-flag key the admin panel toggles. */
export const ORGANIZER_BILLING_FLAG = "organizer_billing_enabled";

/** Planned launch date for paid tiers (ISO). `null` = to be announced. */
export const ORGANIZER_BILLING_LAUNCH: string | null = null;

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
export type CircuitFeature = "series" | "co_organizers" | "branding" | "seeding" | "randomizer";
export const CIRCUIT_PAID_FEATURES: CircuitFeature[] = ["series", "co_organizers", "branding", "seeding", "randomizer"];

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
    blurb: "One full lobby, every format. Live scoring, a public join page, picks & bans, and build rules — no account cost.",
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
    blurb: "Everything in Circuit 64, scaled to 256-player fields — regional-scale events and open brackets.",
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
  source: "preview" | "override" | "subscription" | "free";
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
