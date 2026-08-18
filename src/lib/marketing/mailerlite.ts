/**
 * MailerLite marketing sync (Phase 3). Keeps opted-in GameShuffle users mirrored
 * into MailerLite groups + fields so campaigns/automations can fire there:
 *   - GameShuffle Users  — everyone opted in
 *   - GameShuffle Pro    — tier = pro
 *   - GameShuffle Beta/Testing — beta applicants
 *   - GameShuffle Dormant — last_active > 30d (drives the win-back automation;
 *     cleared automatically when they return)
 *
 * MailerLite is MARKETING only; MailerSend stays transactional. Everything here
 * is best-effort and inert unless MAILERLITE_API_KEY is set, so it never blocks
 * the app path that triggers it.
 */

import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";

const API = "https://connect.mailerlite.com/api";
const DORMANT_DAYS = 30;

/** Group IDs from the MailerLite account (not secret — config). */
export const ML_GROUPS = {
  users: "196105039804105758",
  pro: "196105449365308983",
  beta: "196105463732896883",
  dormant: "196109877867709729",
} as const;

export function isMailerLiteConfigured(): boolean {
  return !!process.env.MAILERLITE_API_KEY;
}

interface MlResult {
  ok: boolean;
  status: number;
  data: unknown;
}

async function ml(path: string, init?: RequestInit): Promise<MlResult> {
  const key = process.env.MAILERLITE_API_KEY;
  if (!key) return { ok: false, status: 0, data: null };
  try {
    const res = await fetch(`${API}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${key}`,
        ...(init?.headers ?? {}),
      },
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) console.warn(`[mailerlite] ${init?.method ?? "GET"} ${path} → ${res.status}`);
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    console.error(`[mailerlite] request error ${path}:`, err);
    return { ok: false, status: 0, data: null };
  }
}

/** ISO timestamp → "YYYY-MM-DD" (MailerLite date fields), or undefined. */
function dateOnly(iso: string | null | undefined): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString().slice(0, 10);
}

/** Upsert a subscriber by email (create or update), assign groups additively,
 *  set fields, mark active. No-op when unconfigured. */
export async function upsertSubscriber(args: {
  email: string;
  name?: string | null;
  groups?: string[];
  fields?: Record<string, string | undefined>;
}): Promise<boolean> {
  if (!isMailerLiteConfigured()) return false;
  const fields: Record<string, string> = {};
  if (args.name) fields.name = args.name;
  for (const [k, v] of Object.entries(args.fields ?? {})) {
    if (v !== undefined && v !== null && v !== "") fields[k] = v;
  }
  const body: Record<string, unknown> = { email: args.email.toLowerCase(), status: "active" };
  if (Object.keys(fields).length) body.fields = fields;
  if (args.groups?.length) body.groups = args.groups;
  const res = await ml("/subscribers", { method: "POST", body: JSON.stringify(body) });
  return res.ok;
}

interface MlSubscriber {
  id: string;
  status: string; // active | unsubscribed | unconfirmed | bounced | junk
}

async function getSubscriber(email: string): Promise<MlSubscriber | null> {
  const res = await ml(`/subscribers/${encodeURIComponent(email.toLowerCase())}`);
  if (!res.ok) return null;
  const d = res.data as { data?: { id?: string; status?: string } } | null;
  const id = d?.data?.id;
  if (!id) return null;
  return { id, status: d?.data?.status ?? "active" };
}

export async function addToGroup(email: string, groupId: string): Promise<boolean> {
  if (!isMailerLiteConfigured()) return false;
  const sub = await getSubscriber(email);
  if (!sub) return false;
  const res = await ml(`/subscribers/${sub.id}/groups/${groupId}`, { method: "POST" });
  return res.ok;
}

export async function removeFromGroup(email: string, groupId: string): Promise<boolean> {
  if (!isMailerLiteConfigured()) return false;
  const sub = await getSubscriber(email);
  if (!sub) return false;
  const res = await ml(`/subscribers/${sub.id}/groups/${groupId}`, { method: "DELETE" });
  return res.ok;
}

/** Mark a subscriber unsubscribed (delete/opt-out). Best-effort. */
export async function suppressSubscriber(email: string): Promise<boolean> {
  if (!isMailerLiteConfigured()) return false;
  const res = await ml("/subscribers", {
    method: "POST",
    body: JSON.stringify({ email: email.toLowerCase(), status: "unsubscribed" }),
  });
  return res.ok;
}

// ── GameShuffle-aware helpers ────────────────────────────────────────────

interface GsUserFacts {
  email: string;
  name: string | null;
  tier: string | null;
  isStreamer: boolean;
  createdAt: string | null;
  lastSeenAt: string | null;
}

/** Resolve the marketing-relevant facts for a GS user by email. */
async function factsForEmail(email: string): Promise<GsUserFacts | null> {
  const admin = createServiceClient();
  const { data: dir } = await admin
    .from("user_directory")
    .select("id")
    .ilike("email", email)
    .maybeSingle();
  const id = (dir?.id as string | null) ?? null;
  if (!id) return { email, name: null, tier: null, isStreamer: false, createdAt: null, lastSeenAt: null };

  const [{ data: u }, { data: tw }] = await Promise.all([
    admin.from("users").select("display_name, subscription_tier, created_at, last_seen_at").eq("id", id).maybeSingle(),
    admin.from("twitch_connections").select("id").eq("user_id", id).maybeSingle(),
  ]);
  return {
    email,
    name: (u?.display_name as string | null) ?? null,
    tier: (u?.subscription_tier as string | null) ?? null,
    isStreamer: !!tw,
    createdAt: (u?.created_at as string | null) ?? null,
    lastSeenAt: (u?.last_seen_at as string | null) ?? null,
  };
}

/** Sync one user into MailerLite from their GS data. Called on opt-in / beta /
 *  tier changes. `origination` labels where they entered (signup, beta, …). */
export async function syncUserByEmail(
  email: string,
  opts: { origination?: string; beta?: boolean } = {},
): Promise<boolean> {
  if (!isMailerLiteConfigured()) return false;
  const f = await factsForEmail(email);
  if (!f) return false;

  const groups: string[] = [ML_GROUPS.users];
  if (f.tier === "pro") groups.push(ML_GROUPS.pro);
  if (opts.beta) groups.push(ML_GROUPS.beta);

  return upsertSubscriber({
    email: f.email,
    name: f.name,
    groups,
    fields: {
      tier: f.tier ?? "free",
      is_streamer: f.isStreamer ? "yes" : "no",
      signup_date: dateOnly(f.createdAt),
      last_active: dateOnly(f.lastSeenAt),
      origination: opts.origination,
    },
  });
}

export async function suppressByEmail(email: string): Promise<boolean> {
  return suppressSubscriber(email);
}

/**
 * Periodic sweep (cron): refresh `last_active` for opted-in users and maintain
 * the Dormant group (add when > 30d inactive, remove when they return). Returns
 * counts for logging. Bounded per run to stay within cron time.
 */
export async function runActivityAndDormancySweep(limit = 1000): Promise<{
  processed: number;
  dormantAdded: number;
  dormantRemoved: number;
}> {
  if (!isMailerLiteConfigured()) return { processed: 0, dormantAdded: 0, dormantRemoved: 0 };
  const admin = createServiceClient();
  const now = Date.now();

  // Opted-in emails only (consent) — the audience we mirror to MailerLite.
  const { data: subs } = await admin
    .from("email_subscriptions")
    .select("email")
    .is("unsubscribed_at", null);
  const emails = [...new Set(((subs ?? []) as { email: string }[]).map((s) => s.email.toLowerCase()))].slice(0, limit);

  let processed = 0;
  let dormantAdded = 0;
  let dormantRemoved = 0;

  for (const email of emails) {
    // Only touch ACTIVE MailerLite subscribers. If they're absent (never synced)
    // or already unsubscribed/bounced/junk, skip entirely — the daily field
    // refresh must never resurrect someone who opted out in MailerLite.
    const sub = await getSubscriber(email);
    if (!sub || sub.status !== "active") continue;

    const f = await factsForEmail(email);
    if (!f) continue;
    processed += 1;

    // Field refresh only. They're already active, so this doesn't change status.
    await upsertSubscriber({
      email,
      fields: { last_active: dateOnly(f.lastSeenAt) },
    });

    // Reuse the fetched id for group ops (no extra lookups).
    const dormant = !f.lastSeenAt || now - Date.parse(f.lastSeenAt) > DORMANT_DAYS * 86_400_000;
    const path = `/subscribers/${sub.id}/groups/${ML_GROUPS.dormant}`;
    if (dormant) {
      if ((await ml(path, { method: "POST" })).ok) dormantAdded += 1;
    } else {
      if ((await ml(path, { method: "DELETE" })).ok) dormantRemoved += 1;
    }
  }

  return { processed, dormantAdded, dormantRemoved };
}
