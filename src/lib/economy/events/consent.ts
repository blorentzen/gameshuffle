/**
 * Per-community consent for multi-party events that can take
 * tokens from partners.
 *
 * The rule (see SQL design note in
 * supabase/command-suite-multi-party-consent.sql):
 *
 *   - Mention events bypass consent entirely — the caller's
 *     `@user` is the consent claim and the partner accepts the
 *     outcome the same way they would for a 1-party event drawn
 *     against them.
 *
 *   - Fanout events (random_n, all_active) with any negative-range
 *     partner consequence require partner identities to have an
 *     active row in `gs_event_consent` for the firing community.
 *
 *   - Positive-only fanout events fire for any recently-active
 *     viewer — no consent needed, no one rejects free tokens.
 *
 * The helpers below are pure read/write surfaces on
 * `gs_event_consent`. The chat-facing `!opt-in`, `!opt-out`, and
 * `!consent` commands wrap them; the engine's partner resolver
 * (`partners.ts`) calls `hasConsent` per candidate.
 */

import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import type { ConsequenceRow } from "./engine";

/**
 * Returns true when the identity has an unrevoked consent row for
 * this community. Used by the partner resolver to filter the
 * candidate pool when an event needs consent.
 */
export async function hasConsent(args: {
  identityId: string;
  communityId: string;
}): Promise<boolean> {
  const admin = createServiceClient();
  const { data } = await admin
    .from("gs_event_consent")
    .select("identity_id")
    .eq("identity_id", args.identityId)
    .eq("community_id", args.communityId)
    .is("revoked_at", null)
    .maybeSingle();
  return !!data;
}

/**
 * Bulk variant — returns the subset of `identityIds` that have
 * active consent for the community. Used inside the partner
 * resolver when filtering a candidate pool (avoids N round trips).
 */
export async function filterConsentingIdentities(args: {
  identityIds: string[];
  communityId: string;
}): Promise<Set<string>> {
  if (args.identityIds.length === 0) return new Set();
  const admin = createServiceClient();
  const { data } = await admin
    .from("gs_event_consent")
    .select("identity_id")
    .in("identity_id", args.identityIds)
    .eq("community_id", args.communityId)
    .is("revoked_at", null);
  return new Set(
    ((data as { identity_id: string }[] | null) ?? []).map(
      (r) => r.identity_id,
    ),
  );
}

/**
 * Idempotent UPSERT — works whether the row is fresh, currently
 * revoked, or already active.
 *
 *   - Fresh row: INSERT with revoked_at = NULL.
 *   - Previously revoked: UPDATE clears revoked_at + bumps source.
 *   - Already active: no-op (returns ok=true with already=true).
 */
export async function grantConsent(args: {
  identityId: string;
  communityId: string;
  source: "chat" | "mod" | "account_settings" | "session_join";
}): Promise<{ ok: true; already: boolean } | { ok: false; reason: string }> {
  const admin = createServiceClient();
  const { data: existing } = await admin
    .from("gs_event_consent")
    .select("identity_id, revoked_at")
    .eq("identity_id", args.identityId)
    .eq("community_id", args.communityId)
    .maybeSingle();
  if (existing && (existing as { revoked_at: string | null }).revoked_at === null) {
    return { ok: true, already: true };
  }
  const { error } = await admin.from("gs_event_consent").upsert(
    {
      identity_id: args.identityId,
      community_id: args.communityId,
      revoked_at: null,
      source: args.source,
    },
    { onConflict: "identity_id,community_id" },
  );
  if (error) return { ok: false, reason: error.message };
  return { ok: true, already: false };
}

/**
 * Soft revocation — sets `revoked_at = NOW()` instead of deleting
 * the row so the audit trail survives. A subsequent grant clears
 * it again (idempotent).
 *
 * Returns `already=true` when the caller wasn't consenting to begin
 * with — the chat command uses that to post a different message.
 */
export async function revokeConsent(args: {
  identityId: string;
  communityId: string;
}): Promise<{ ok: true; already: boolean } | { ok: false; reason: string }> {
  const admin = createServiceClient();
  const { data: existing } = await admin
    .from("gs_event_consent")
    .select("identity_id, revoked_at")
    .eq("identity_id", args.identityId)
    .eq("community_id", args.communityId)
    .maybeSingle();
  if (!existing) return { ok: true, already: true };
  if ((existing as { revoked_at: string | null }).revoked_at !== null) {
    return { ok: true, already: true };
  }
  const { error } = await admin
    .from("gs_event_consent")
    .update({ revoked_at: new Date().toISOString() })
    .eq("identity_id", args.identityId)
    .eq("community_id", args.communityId);
  if (error) return { ok: false, reason: error.message };
  return { ok: true, already: false };
}

/**
 * Returns true when any consequence on the event can subtract
 * tokens from a partner — used to decide whether the partner
 * resolver should consent-filter the candidate pool.
 *
 * "Can subtract" = a token_delta consequence targeting partner OR
 * both, with a `min` value below zero. Positive-only ranges (e.g.
 * +5 to +10) don't require consent — gains don't need permission.
 */
export function eventRequiresConsent(consequences: ConsequenceRow[]): boolean {
  for (const c of consequences) {
    if (c.ctype !== "token_delta") continue;
    if (c.target !== "partner" && c.target !== "both") continue;
    const min = typeof c.payload?.min === "number" ? c.payload.min : 0;
    if (min < 0) return true;
  }
  return false;
}
