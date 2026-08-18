/**
 * Platform lifecycle analytics — signup/activity/churn segmentation for the
 * Growth admin view + consent-respecting remarketing exports. Service-role only
 * (staff surface). Activity segments are mutually exclusive (by last_seen_at);
 * growth + churn + opt-in are reported alongside.
 */

import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";

const DAY = 86_400_000;

/** Mutually-exclusive activity buckets, keyed by last_seen_at recency. */
export type ActivitySegment = "active" | "dormant" | "at_risk" | "cold" | "never_seen";

export const SEGMENT_LABELS: Record<ActivitySegment, string> = {
  active: "Active (seen < 7d)",
  dormant: "Dormant (7–30d)",
  at_risk: "At risk (30–90d)",
  cold: "Cold (90d+)",
  never_seen: "Never active",
};

const DELETION_REASON_LABELS: Record<string, string> = {
  not_using: "Not using it enough",
  missing_features: "Missing features",
  too_expensive: "Too expensive",
  found_alternative: "Found an alternative",
  just_testing: "Was just testing",
  other: "Other",
};

export interface LifecycleSummary {
  totalUsers: number;
  signups7d: number;
  signups30d: number;
  segments: Record<ActivitySegment, number>;
  churn30d: number;
  churnTotal: number;
  churnReasons: { reason: string; label: string; count: number }[];
  marketingOptIns: number;
  generatedAt: string;
}

function segmentFor(lastSeenAt: string | null, now: number): ActivitySegment {
  if (!lastSeenAt) return "never_seen";
  const age = now - Date.parse(lastSeenAt);
  if (age < 7 * DAY) return "active";
  if (age < 30 * DAY) return "dormant";
  if (age < 90 * DAY) return "at_risk";
  return "cold";
}

export async function getLifecycleSummary(): Promise<LifecycleSummary> {
  const admin = createServiceClient();
  const now = Date.now();

  const { data: users } = await admin.from("users").select("created_at, last_seen_at");
  const rows = (users ?? []) as { created_at: string | null; last_seen_at: string | null }[];

  const segments: Record<ActivitySegment, number> = {
    active: 0,
    dormant: 0,
    at_risk: 0,
    cold: 0,
    never_seen: 0,
  };
  let signups7d = 0;
  let signups30d = 0;
  for (const u of rows) {
    const created = u.created_at ? Date.parse(u.created_at) : 0;
    if (created && now - created < 7 * DAY) signups7d += 1;
    if (created && now - created < 30 * DAY) signups30d += 1;
    segments[segmentFor(u.last_seen_at, now)] += 1;
  }

  // Churn — from the deletion log (best-effort; table may be pre-migration).
  let churn30d = 0;
  let churnTotal = 0;
  const churnReasons: { reason: string; label: string; count: number }[] = [];
  try {
    const { data: dels } = await admin
      .from("account_deletions")
      .select("reason, deleted_at");
    const drows = (dels ?? []) as { reason: string | null; deleted_at: string | null }[];
    churnTotal = drows.length;
    const reasonCounts = new Map<string, number>();
    for (const d of drows) {
      if (d.deleted_at && now - Date.parse(d.deleted_at) < 30 * DAY) churn30d += 1;
      const key = d.reason || "unspecified";
      reasonCounts.set(key, (reasonCounts.get(key) ?? 0) + 1);
    }
    for (const [reason, count] of reasonCounts) {
      churnReasons.push({
        reason,
        label: DELETION_REASON_LABELS[reason] ?? (reason === "unspecified" ? "Not specified" : reason),
        count,
      });
    }
    churnReasons.sort((a, b) => b.count - a.count);
  } catch {
    /* table not migrated yet — churn stays 0 */
  }

  // Marketing opt-ins — distinct emails with at least one active subscription.
  let marketingOptIns = 0;
  try {
    const { data: subs } = await admin
      .from("email_subscriptions")
      .select("email")
      .is("unsubscribed_at", null);
    marketingOptIns = new Set((subs ?? []).map((s) => (s as { email: string }).email)).size;
  } catch {
    /* ignore */
  }

  return {
    totalUsers: rows.length,
    signups7d,
    signups30d,
    segments,
    churn30d,
    churnTotal,
    churnReasons,
    marketingOptIns,
    generatedAt: new Date(now).toISOString(),
  };
}

/**
 * Emails in an activity segment who are ALSO opted in to marketing — the
 * consent-respecting list for a remarketing send/export. Never returns emails
 * that aren't opted in.
 */
export async function getSegmentOptedInEmails(segment: ActivitySegment): Promise<string[]> {
  const admin = createServiceClient();
  const now = Date.now();

  // 1. User ids in the segment.
  const { data: users } = await admin.from("users").select("id, last_seen_at");
  const ids = ((users ?? []) as { id: string; last_seen_at: string | null }[])
    .filter((u) => segmentFor(u.last_seen_at, now) === segment)
    .map((u) => u.id);
  if (!ids.length) return [];

  // 2. Their emails (user_directory joins auth.users.email).
  const emails = new Map<string, string>(); // id -> email
  for (let i = 0; i < ids.length; i += 500) {
    const { data } = await admin
      .from("user_directory")
      .select("id, email")
      .in("id", ids.slice(i, i + 500));
    for (const r of (data ?? []) as { id: string; email: string | null }[]) {
      if (r.email) emails.set(r.id, r.email.toLowerCase());
    }
  }
  const segEmails = new Set(emails.values());
  if (!segEmails.size) return [];

  // 3. Keep only those opted in to marketing.
  const { data: subs } = await admin
    .from("email_subscriptions")
    .select("email")
    .is("unsubscribed_at", null);
  const optedIn = new Set(
    ((subs ?? []) as { email: string }[]).map((s) => s.email.toLowerCase()),
  );

  return [...segEmails].filter((e) => optedIn.has(e)).sort();
}
