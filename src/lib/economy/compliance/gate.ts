/**
 * Compliance gate — Spec 07 §3, §6.
 *
 * Resolves `(viewer_region, compliance_class, genre) → behavior`
 * against `gs_compliance_rules`. Default-deny per Spec 07 §6:
 * unknown region → `prediction_pool` becomes spectator;
 * `casino_style` becomes unavailable.
 *
 * The gate is a PRECONDITION of every economic action — sits ahead
 * of:
 *   - streamer module-enable toggle (Spec 06; will plug in later)
 *   - actor permission (Spec 03 dispatcher)
 *   - liveOnly + cooldown (existing)
 *
 * Casino_style is dormant (no modules map to it post-May 2026 cut)
 * but the class is retained so the mechanism is in place if any
 * future module ever needs it.
 */

import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import type { RegionCode } from "./region";

export type ComplianceClass = "prediction_pool" | "casino_style" | "none";

export type ComplianceBehavior = "full" | "spectator" | "unavailable";

export interface ComplianceDecision {
  behavior: ComplianceBehavior;
  /** Why this decision — drives logging + the user-facing reason
   *  string the caller may render. */
  reason: "rule_matched" | "no_rule" | "unknown_region_default" | "class_none";
  /** ISO region used in the lookup (or null when unknown). */
  region: RegionCode | null;
}

const RULES_CACHE = new Map<string, { behavior: ComplianceBehavior; cachedAt: number }>();
const RULES_TTL_MS = 60_000;

/**
 * Resolve the behavior. The `genre` parameter is currently unused
 * (no genre-tagged content) but kept on the signature so a future
 * (region × class × genre) rule can plug in without a caller diff.
 */
export async function checkCompliance(args: {
  region: RegionCode | null;
  complianceClass: ComplianceClass;
  genre?: string | null;
}): Promise<ComplianceDecision> {
  // `none`-classed surfaces (tokens / give / leaderboard / social /
  // event system) bypass the gate entirely — closed-loop, no wager.
  if (args.complianceClass === "none") {
    return { behavior: "full", reason: "class_none", region: args.region };
  }

  // No region → fail safe per Spec 07 §6.
  if (!args.region) {
    return {
      behavior:
        args.complianceClass === "casino_style" ? "unavailable" : "spectator",
      reason: "unknown_region_default",
      region: null,
    };
  }

  const behavior = await lookupRule(args.region, args.complianceClass, args.genre ?? null);
  if (behavior) {
    return { behavior, reason: "rule_matched", region: args.region };
  }

  // Region known, no matching rule → default to `full`. The seeded
  // restriction list is the explicit denylist; absence = permitted.
  return { behavior: "full", reason: "no_rule", region: args.region };
}

async function lookupRule(
  region: RegionCode,
  complianceClass: ComplianceClass,
  genre: string | null,
): Promise<ComplianceBehavior | null> {
  const cacheKey = `${region}::${complianceClass}::${genre ?? ""}`;
  const cached = RULES_CACHE.get(cacheKey);
  if (cached && Date.now() - cached.cachedAt < RULES_TTL_MS) {
    return cached.behavior;
  }

  const admin = createServiceClient();
  // Two-step lookup: prefer a genre-specific rule, fall back to the
  // null-genre catch-all. Returns at most one row either way.
  let row: { behavior: ComplianceBehavior } | null = null;
  if (genre) {
    const { data } = await admin
      .from("gs_compliance_rules")
      .select("behavior")
      .eq("region_code", region)
      .eq("compliance_class", complianceClass)
      .eq("genre", genre)
      .maybeSingle();
    row = (data as { behavior: ComplianceBehavior } | null) ?? null;
  }
  if (!row) {
    const { data } = await admin
      .from("gs_compliance_rules")
      .select("behavior")
      .eq("region_code", region)
      .eq("compliance_class", complianceClass)
      .is("genre", null)
      .maybeSingle();
    row = (data as { behavior: ComplianceBehavior } | null) ?? null;
  }
  // Region-level rule didn't match; if region has a sub-region (e.g.
  // "CA-QC"), also check the parent "CA" before giving up.
  if (!row && region.includes("-")) {
    const parent = region.split("-")[0];
    const { data } = await admin
      .from("gs_compliance_rules")
      .select("behavior")
      .eq("region_code", parent)
      .eq("compliance_class", complianceClass)
      .is("genre", null)
      .maybeSingle();
    row = (data as { behavior: ComplianceBehavior } | null) ?? null;
  }

  const behavior = row?.behavior ?? null;
  if (behavior) {
    RULES_CACHE.set(cacheKey, { behavior, cachedAt: Date.now() });
  }
  return behavior;
}

/** Force-invalidate the rules cache. Useful when an ops dashboard
 *  edits a rule and wants the change visible immediately rather
 *  than waiting for the 60-second TTL. */
export function invalidateComplianceCache(): void {
  RULES_CACHE.clear();
}

export interface RestrictedRegion {
  /** ISO 3166-1 alpha-2 or alpha-2 + sub-region (e.g. `US`, `CA-QC`). */
  regionCode: string;
  /** Behavior applied to viewers in this region for `prediction_pool`
   *  surfaces — `spectator` is the typical entry; `unavailable` is
   *  reserved for stronger blocks. */
  behavior: ComplianceBehavior;
  /** Human-readable display name from the seed row's `note` column
   *  (e.g. "South Korea", "Quebec"). Falls back to the bare region
   *  code on the consumer side when absent. */
  displayName: string | null;
}

const RESTRICTED_TTL_MS = 5 * 60_000;
let restrictedCache:
  | { rows: RestrictedRegion[]; cachedAt: number }
  | null = null;

/**
 * List every region currently restricted from full prediction-pool
 * participation. Surfaces both the streamer-facing module detail
 * modal and the viewer-facing `/live` markets tab so it's clear
 * who can place real bets and who falls back to spectator mode.
 *
 * Cached in-process for 5 minutes — the rules change at admin
 * cadence, not user cadence.
 */
export async function listRestrictedRegions(): Promise<RestrictedRegion[]> {
  if (restrictedCache && Date.now() - restrictedCache.cachedAt < RESTRICTED_TTL_MS) {
    return restrictedCache.rows;
  }
  const admin = createServiceClient();
  const { data } = await admin
    .from("gs_compliance_rules")
    .select("region_code, behavior, note")
    .eq("compliance_class", "prediction_pool")
    .in("behavior", ["spectator", "unavailable"])
    .is("genre", null)
    .order("region_code");
  const rows = ((data as Array<{
    region_code: string;
    behavior: ComplianceBehavior;
    note: string | null;
  }> | null) ?? []).map((r) => ({
    regionCode: r.region_code,
    behavior: r.behavior,
    displayName: r.note,
  }));
  restrictedCache = { rows, cachedAt: Date.now() };
  return rows;
}
