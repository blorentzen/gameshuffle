/**
 * Partner resolution for multi-party events.
 *
 * Given a drawn `EventRow` and the community + actor, returns the
 * list of partner identities the engine will fan consequences out
 * to. Each `partner_mode` has its own selection strategy:
 *
 *   - none           → empty list (1-party event, no partners).
 *   - mention        → caller resolved upstream (chat dispatcher
 *                      passes pre-resolved partners; this resolver
 *                      isn't called).
 *   - random_active  → pick ONE recent active viewer ≠ actor.
 *   - random_n       → pick `partner_count` random recent viewers,
 *                      consent-filtered when the event has any
 *                      negative-range partner consequence.
 *   - all_active     → fan out to up to `partner_count` recent
 *                      active viewers, consent-filtered the same
 *                      way.
 *
 * "Recent active" = at least one row in `token_events` for this
 * community in the last RECENT_ACTIVITY_WINDOW_MS. Proxies chat
 * presence well enough for v1 — anyone earning/spending/being-
 * gifted within that window has demonstrated engagement.
 *
 * Returns `null` when no partners could be resolved for a mode
 * that requires them. `fireEvent` translates that into the
 * `partner_unavailable` rejection.
 */

import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  eventRequiresConsent,
  filterConsentingIdentities,
} from "./consent";
import type { ConsequenceRow, EventRow } from "./engine";

export interface PartnerIdentity {
  identityId: string;
  displayName: string;
}

/** Recent activity window for partner eligibility. 60 minutes
 *  covers an average stream's chat audience without dragging in
 *  viewers from past sessions. */
const RECENT_ACTIVITY_WINDOW_MS = 60 * 60 * 1000;

/** Pool size we pull from the DB before random selection. Bigger
 *  than the largest reasonable `partner_count` so even fanout caps
 *  of 100 have a healthy candidate set to filter from. */
const CANDIDATE_POOL_LIMIT = 500;

export async function resolvePartners(args: {
  event: EventRow;
  consequences: ConsequenceRow[];
  actorIdentityId: string;
  communityId: string;
}): Promise<PartnerIdentity[] | null> {
  switch (args.event.partner_mode) {
    case "none":
      return [];

    case "mention":
      // Mention path comes in pre-resolved from the chat dispatcher;
      // if we ever land here it means the engine got bad inputs.
      console.warn(
        "[partners] mention mode hit resolvePartners — chat dispatcher should pre-resolve",
      );
      return null;

    case "random_active": {
      const candidates = await loadRecentActiveCandidates({
        communityId: args.communityId,
        excludeIdentityId: args.actorIdentityId,
      });
      if (candidates.length === 0) return null;
      return [pickRandom(candidates)];
    }

    case "random_n": {
      const k = args.event.partner_count ?? 0;
      if (k < 1) return null;
      const candidates = await loadRecentActiveCandidates({
        communityId: args.communityId,
        excludeIdentityId: args.actorIdentityId,
      });
      const filtered = await maybeConsentFilter({
        candidates,
        event: args.event,
        consequences: args.consequences,
        communityId: args.communityId,
      });
      if (filtered.length === 0) return null;
      return pickRandomN(filtered, k);
    }

    case "all_active": {
      const cap = args.event.partner_count ?? CANDIDATE_POOL_LIMIT;
      const candidates = await loadRecentActiveCandidates({
        communityId: args.communityId,
        excludeIdentityId: args.actorIdentityId,
      });
      const filtered = await maybeConsentFilter({
        candidates,
        event: args.event,
        consequences: args.consequences,
        communityId: args.communityId,
      });
      if (filtered.length === 0) return null;
      // Trim to the cap. For huge fanout we shuffle before slicing
      // so a cap of 50 on a 500-viewer community doesn't always hit
      // the same 50 most-recently-active rows.
      if (filtered.length <= cap) return filtered;
      return shuffleInPlace(filtered.slice()).slice(0, cap);
    }
  }
}

/**
 * Distinct identities with a `token_events` row in this community
 * within the recency window. Display name comes from the joined
 * `gs_identities` row.
 */
async function loadRecentActiveCandidates(args: {
  communityId: string;
  excludeIdentityId: string;
}): Promise<PartnerIdentity[]> {
  const cutoffIso = new Date(
    Date.now() - RECENT_ACTIVITY_WINDOW_MS,
  ).toISOString();
  const admin = createServiceClient();
  // Two-step instead of a SQL distinct-on join — Supabase JS doesn't
  // expose DISTINCT and a plain select would return one row per
  // token_event, blowing up the candidate set with duplicates.
  const { data: events } = await admin
    .from("token_events")
    .select("identity_id")
    .eq("community_id", args.communityId)
    .gte("created_at", cutoffIso)
    .limit(CANDIDATE_POOL_LIMIT * 4);
  const allIds = ((events as { identity_id: string }[] | null) ?? [])
    .map((e) => e.identity_id)
    .filter((id) => id !== args.excludeIdentityId);
  const uniqueIds = Array.from(new Set(allIds)).slice(
    0,
    CANDIDATE_POOL_LIMIT,
  );
  if (uniqueIds.length === 0) return [];
  const { data: identities } = await admin
    .from("gs_identities")
    .select("id, display_name")
    .in("id", uniqueIds);
  return (
    (identities as { id: string; display_name: string | null }[] | null) ?? []
  )
    .filter((r) => r.display_name)
    .map((r) => ({
      identityId: r.id,
      displayName: r.display_name as string,
    }));
}

async function maybeConsentFilter(args: {
  candidates: PartnerIdentity[];
  event: EventRow;
  consequences: ConsequenceRow[];
  communityId: string;
}): Promise<PartnerIdentity[]> {
  if (!eventRequiresConsent(args.consequences)) return args.candidates;
  const consenting = await filterConsentingIdentities({
    identityIds: args.candidates.map((c) => c.identityId),
    communityId: args.communityId,
  });
  return args.candidates.filter((c) => consenting.has(c.identityId));
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickRandomN<T>(arr: T[], n: number): T[] {
  if (n >= arr.length) return arr.slice();
  return shuffleInPlace(arr.slice()).slice(0, n);
}

function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
