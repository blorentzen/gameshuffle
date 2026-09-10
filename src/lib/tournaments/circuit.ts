/**
 * GS Circuit — organizer entitlements for flexible tournaments (Flexible
 * Tournaments spec §6). The single source of truth for what an organizer can do
 * for free vs. on a paid plan: field size (entrant cap) and customization depth
 * (double-elim, adjustable lobby rules, seeding, team modes, series).
 *
 * IMPORTANT — pricing is OFF until launch, and the switch is now admin-driven:
 * the `organizer_billing_enabled` platform flag (gs_platform_flags, toggled from
 * Platform Admin) is read server-side and passed in as `billingEnabled`. While
 * off, `getOrganizerEntitlements` returns FULL access to everyone. A
 * `gs_sponsored` tournament always gets full access regardless of the flag. This
 * module stays client-safe (constants + pure logic); the DB read lives in
 * `@/lib/platform/flags`.
 */

import type { SubscriptionTier } from "@/lib/subscription";
import { effectiveTier } from "@/lib/subscription";

/** Fallback when the platform flag can't be read. The live value comes from the
 *  `organizer_billing_enabled` flag (getPlatformFlag), passed in as
 *  `billingEnabled`. */
export const DEFAULT_ORGANIZER_BILLING_ENABLED = false;

/** The platform-flag key the admin panel toggles. */
export const ORGANIZER_BILLING_FLAG = "organizer_billing_enabled";

/** Launch date for paid GS Circuit tiers (ISO). `null` = to be announced. Shown
 *  in the soft indicator: "Free while in preview; paid from <date>." */
export const ORGANIZER_BILLING_LAUNCH: string | null = null;

/** Free tier field-size ceiling — one full lobby (12). Bigger fields need GS Circuit. */
export const FREE_ENTRANT_CAP = 12;

/** The paid ladder: field size sets the price (bigger = more server load), a
 *  switcher rather than one flat "paid" price. Caps are proposals to confirm. */
export const CIRCUIT_TIERS = [
  { id: "free", label: "Free", entrantCap: FREE_ENTRANT_CAP },
  { id: "circuit_32", label: "GS Circuit · up to 32", entrantCap: 32 },
  { id: "circuit_64", label: "GS Circuit · up to 64", entrantCap: 64 },
  { id: "circuit_128", label: "GS Circuit · up to 128", entrantCap: 128 },
  { id: "circuit_256", label: "GS Circuit · 256+", entrantCap: 256 },
] as const;

export interface OrganizerEntitlements {
  /** Max field size this organizer may run. */
  entrantCap: number;
  /** Double elimination (losers bracket). */
  doubleElim: boolean;
  /** Adjustable lobby size + advance count (else locked to the defaults). */
  customLobbyRules: boolean;
  /** Best-of / points over multiple races per round. */
  bestOfRounds: boolean;
  /** Custom / redraw / manual seeding (else balanced-auto only). */
  customSeeding: boolean;
  /** Team modes (2v2 … 6v6). */
  teamModes: boolean;
  /** Championship series. */
  series: boolean;
  /** Co-organizers — share edit access with other GS accounts. */
  coOrganizers: boolean;
}

/** Free defaults an organizer is locked to when a knob is paid. */
export const FREE_GROUP_DEFAULTS = { lobbySize: 4, advance: 2, bracketing: "single" as const };

const FULL: OrganizerEntitlements = {
  entrantCap: Number.POSITIVE_INFINITY,
  doubleElim: true,
  customLobbyRules: true,
  bestOfRounds: true,
  customSeeding: true,
  teamModes: true,
  series: true,
  coOrganizers: true,
};

const FREE: OrganizerEntitlements = {
  entrantCap: FREE_ENTRANT_CAP,
  doubleElim: false,
  customLobbyRules: false,
  bestOfRounds: false,
  customSeeding: false,
  teamModes: false,
  series: false,
  coOrganizers: false,
};

/**
 * Placeholder for "is this account on a paid organizer plan." GS Circuit is a
 * separate product from GS Pro (spec §6.5); until its Stripe plan + entitlement
 * exist, we approximate paid = Pro/staff/admin. This is the one line to update
 * when the GS Circuit plan lands. Only consulted once billing is enabled.
 */
function isPaidOrganizer(tier: SubscriptionTier | null | undefined, role: string | null | undefined): boolean {
  return effectiveTier({ tier: tier ?? "free", role: role ?? null }) === "pro";
}

/** What this organizer may do. FULL while billing is off or the event is
 *  GS-sponsored; otherwise their plan's entitlements. `billingEnabled` comes
 *  from the platform flag (read server-side). */
export function getOrganizerEntitlements(opts: {
  tier?: SubscriptionTier | null;
  role?: string | null;
  sponsored?: boolean;
  billingEnabled?: boolean;
}): OrganizerEntitlements {
  if (opts.sponsored) return FULL;
  if (!(opts.billingEnabled ?? DEFAULT_ORGANIZER_BILLING_ENABLED)) return FULL;
  return isPaidOrganizer(opts.tier, opts.role) ? FULL : FREE;
}

/** True when billing is off (so the create flow shows "free in preview, paid at
 *  launch" hints rather than hard-gating). */
export function inFreePreview(billingEnabled: boolean): boolean {
  return !billingEnabled;
}
