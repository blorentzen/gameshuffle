import "server-only";

import crypto from "crypto";
import { createServiceClient } from "@/lib/supabase/admin";
import { sendClaimCodeEmail, sendResultsClaimEmail } from "@/lib/email/tournament";
import { getBaseUrl } from "@/lib/env";

/**
 * Guest claim tokens, codes and the audit trail (spec F, phase 1).
 *
 * Tokens are credentials: only a sha256 hash is stored, they expire, and they
 * are single-use. A claim links an entry only after the signed-in account has
 * proven control of the saved contact: a matching verified email, or a
 * one-time code sent to that contact. Organizer-issued manual links (phase 2)
 * are the exception, guarded by a short expiry and organizer visibility.
 *
 * Works before tournament-claims-m1.sql is applied: lookups fall back to the
 * old plaintext column, new claims fall back to the old insert, and the audit
 * and code tables are simply absent (codes report "unavailable").
 */

export const CLAIM_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const MANUAL_TTL_MS = 72 * 60 * 60 * 1000;
const CODE_TTL_MS = 10 * 60 * 1000;
const CODE_MAX_ATTEMPTS = 5;
const CODES_PER_HOUR = 3;

export interface ClaimRow {
  id: string;
  tournament_id: string;
  participant_id: string;
  email: string | null;
  claimed_at: string | null;
  claimed_by: string | null;
  expires_at?: string | null;
  revoked_at?: string | null;
  kind?: string | null;
}
export type ClaimState = "open" | "claimed" | "expired" | "revoked";

const BASE_COLS = "id, tournament_id, participant_id, email, claimed_at, claimed_by";
const PHASE1_COLS = `${BASE_COLS}, expires_at, revoked_at, kind`;

/** A column or table this code expects is missing: the migration is not applied yet. */
function isMissing(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return ["42703", "PGRST204", "PGRST205", "42P01"].includes(error.code ?? "") || /does not exist|schema cache/i.test(error.message ?? "");
}

export function newToken(): string {
  return crypto.randomBytes(24).toString("base64url");
}
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}
export function maskEmail(email: string | null): string | null {
  if (!email) return null;
  const [local, domain] = email.toLowerCase().split("@");
  return domain ? `${local.slice(0, 1)}***@${domain}` : "***";
}

export function claimState(c: ClaimRow, now = Date.now()): ClaimState {
  if (c.claimed_at) return "claimed";
  if (c.revoked_at) return "revoked";
  if (c.expires_at && Date.parse(c.expires_at) <= now) return "expired";
  return "open";
}

/** Find a claim by its plaintext token, optionally scoped to one tournament. */
export async function findClaim(token: string, tournamentId?: string): Promise<ClaimRow | null> {
  const svc = createServiceClient();
  const byHash = svc.from("tournament_guest_claims").select(PHASE1_COLS).eq("token_hash", hashToken(token));
  const { data, error } = await (tournamentId ? byHash.eq("tournament_id", tournamentId) : byHash).maybeSingle();
  if (!error) return (data as ClaimRow | null) ?? null;
  if (!isMissing(error)) throw new Error(error.message);
  // Pre-migration: the old plaintext column.
  const legacy = svc.from("tournament_guest_claims").select(BASE_COLS).eq("token", token);
  const { data: old } = await (tournamentId ? legacy.eq("tournament_id", tournamentId) : legacy).maybeSingle();
  return (old as ClaimRow | null) ?? null;
}

/** Best-effort audit entry. The table is absent before the migration. */
export async function audit(entry: {
  tournamentId: string; claimId?: string | null; participantId?: string | null;
  event: "issued" | "claimed" | "auto_linked" | "unlinked" | "revoked" | "code_sent";
  actorId?: string | null; meta?: Record<string, unknown>;
}): Promise<void> {
  await createServiceClient().from("tournament_claim_audit").insert({
    tournament_id: entry.tournamentId, claim_id: entry.claimId ?? null, participant_id: entry.participantId ?? null,
    event: entry.event, actor_id: entry.actorId ?? null, meta: entry.meta ?? {},
  }).then(() => {}, () => {});
}

/**
 * Issue a claim for a guest entry and return the plaintext token (to put in a
 * link). Only the hash is stored. Returns null if the insert fails.
 */
export async function issueClaim(opts: {
  tournamentId: string; participantId: string; email?: string | null;
  kind?: "email" | "phone" | "manual"; issuedBy?: string | null; ttlMs?: number;
}): Promise<string | null> {
  const svc = createServiceClient();
  const token = newToken();
  const kind = opts.kind ?? "email";
  const { data, error } = await svc.from("tournament_guest_claims").insert({
    tournament_id: opts.tournamentId, participant_id: opts.participantId, email: opts.email?.toLowerCase() ?? null,
    token_hash: hashToken(token), expires_at: new Date(Date.now() + (opts.ttlMs ?? (kind === "manual" ? MANUAL_TTL_MS : CLAIM_TTL_MS))).toISOString(),
    kind, issued_by: opts.issuedBy ?? null,
  }).select("id").single();
  if (!error && data) {
    await audit({ tournamentId: opts.tournamentId, claimId: data.id as string, participantId: opts.participantId, event: "issued", actorId: opts.issuedBy ?? null, meta: { kind } });
    return token;
  }
  if (!isMissing(error)) return null;
  // Pre-migration: the old table generates (and stores) a plaintext token.
  if (!opts.email) return null;
  const { data: old } = await svc.from("tournament_guest_claims")
    .insert({ tournament_id: opts.tournamentId, participant_id: opts.participantId, email: opts.email.toLowerCase() })
    .select("token").single();
  return (old?.token as string | undefined) ?? null;
}

/**
 * Link a claim's entry to an account. The claim row is marked first, and only
 * if still open, so two concurrent confirms cannot both win.
 */
export async function linkClaim(c: ClaimRow, userId: string, how: "claimed" | "auto_linked" = "claimed"): Promise<"ok" | "already_claimed"> {
  const svc = createServiceClient();
  let q = svc.from("tournament_guest_claims").update({ claimed_at: new Date().toISOString(), claimed_by: userId })
    .eq("id", c.id).is("claimed_at", null);
  if (c.revoked_at !== undefined) q = q.is("revoked_at", null);
  const { data: won } = await q.select("id");
  if (!won?.length) return "already_claimed";
  await svc.from("tournament_participants").update({ user_id: userId }).eq("id", c.participant_id).is("user_id", null);
  await audit({ tournamentId: c.tournament_id, claimId: c.id, participantId: c.participant_id, event: how, actorId: userId });
  return "ok";
}

/* ── One-time codes ──────────────────────────────────────────────────────── */

const codeHash = (claimId: string, code: string) => crypto.createHash("sha256").update(`${claimId}:${code}`, "utf8").digest("hex");

export type SendCodeResult = { ok: true } | { ok: false; reason: "no_contact" | "rate_limited" | "unavailable" | "send_failed" };

/** Email a 6-digit code to the claim's saved address. Max 3 an hour per claim. */
export async function sendClaimCode(c: ClaimRow, context: { tournamentTitle: string; displayName: string }): Promise<SendCodeResult> {
  if (!c.email) return { ok: false, reason: "no_contact" };
  const svc = createServiceClient();
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error: countErr } = await svc.from("tournament_claim_codes").select("id", { count: "exact", head: true })
    .eq("claim_id", c.id).gte("created_at", since);
  if (isMissing(countErr)) return { ok: false, reason: "unavailable" };
  if ((count ?? 0) >= CODES_PER_HOUR) return { ok: false, reason: "rate_limited" };

  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  const { error } = await svc.from("tournament_claim_codes").insert({
    claim_id: c.id, channel: "email", code_hash: codeHash(c.id, code), expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
  });
  if (error) return { ok: false, reason: isMissing(error) ? "unavailable" : "send_failed" };
  const sent = await sendClaimCodeEmail({ to: c.email, code, tournamentTitle: context.tournamentTitle, displayName: context.displayName }).catch(() => ({ ok: false as const }));
  if (!sent.ok) return { ok: false, reason: "send_failed" };
  await audit({ tournamentId: c.tournament_id, claimId: c.id, participantId: c.participant_id, event: "code_sent", meta: { channel: "email" } });
  return { ok: true };
}

export type VerifyCodeResult = "ok" | "wrong" | "expired" | "locked";

/** Check a code against the newest live one. 5 wrong tries kills it. */
export async function verifyClaimCode(c: ClaimRow, code: string): Promise<VerifyCodeResult> {
  const svc = createServiceClient();
  const { data } = await svc.from("tournament_claim_codes").select("id, code_hash, attempts, expires_at, consumed_at")
    .eq("claim_id", c.id).is("consumed_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const row = data as { id: string; code_hash: string; attempts: number; expires_at: string } | null;
  if (!row) return "expired";
  if (row.attempts >= CODE_MAX_ATTEMPTS) return "locked";
  if (Date.parse(row.expires_at) <= Date.now()) return "expired";
  const want = Buffer.from(row.code_hash, "hex");
  const got = Buffer.from(codeHash(c.id, code.trim()), "hex");
  if (want.length === got.length && crypto.timingSafeEqual(want, got)) {
    const { data: used } = await svc.from("tournament_claim_codes").update({ consumed_at: new Date().toISOString() })
      .eq("id", row.id).is("consumed_at", null).select("id");
    return used?.length ? "ok" : "expired";
  }
  await svc.from("tournament_claim_codes").update({ attempts: row.attempts + 1 }).eq("id", row.id);
  return row.attempts + 1 >= CODE_MAX_ATTEMPTS ? "locked" : "wrong";
}

/* ── Organizer view ──────────────────────────────────────────────────────── */

export interface ParticipantClaim {
  participantId: string;
  state: ClaimState | "unlinked";
  claimedBy: string | null;
  claimedByName: string | null;
  claimedAt: string | null;
  expiresAt: string | null;
}

/**
 * Claim status per participant, newest claim wins. "unlinked" means the entry
 * was claimed and an organizer has since reverted it to a guest.
 */
export async function listClaims(tournamentId: string): Promise<ParticipantClaim[]> {
  const svc = createServiceClient();
  const q = (cols: string) => svc.from("tournament_guest_claims").select(`${cols}, created_at`).eq("tournament_id", tournamentId).order("created_at", { ascending: false });
  let res: { data: unknown; error: { code?: string; message?: string } | null } = await q(PHASE1_COLS);
  if (res.error && isMissing(res.error)) res = await q(BASE_COLS);
  const rows = ((res.data ?? []) as ClaimRow[]);
  const latest = new Map<string, ClaimRow>();
  for (const r of rows) if (!latest.has(r.participant_id)) latest.set(r.participant_id, r);
  if (!latest.size) return [];

  const partIds = [...latest.keys()];
  const { data: parts } = await svc.from("tournament_participants").select("id, user_id").in("id", partIds);
  const owner = new Map(((parts ?? []) as { id: string; user_id: string | null }[]).map((p) => [p.id, p.user_id]));
  const claimerIds = [...new Set(rows.map((r) => r.claimed_by).filter((x): x is string => !!x))];
  const names = new Map<string, string>();
  if (claimerIds.length) {
    const { data: us } = await svc.from("users").select("id, display_name, username").in("id", claimerIds);
    for (const u of (us ?? []) as { id: string; display_name: string | null; username: string | null }[]) names.set(u.id, u.display_name || u.username || "an account");
  }
  return [...latest.values()].map((c) => {
    const base = claimState(c);
    const state = base === "claimed" && !owner.get(c.participant_id) ? "unlinked" : base;
    return {
      participantId: c.participant_id, state, claimedBy: c.claimed_by, claimedByName: c.claimed_by ? names.get(c.claimed_by) ?? null : null,
      claimedAt: c.claimed_at, expiresAt: c.expires_at ?? null,
    };
  });
}

/**
 * Revert a claimed entry to a guest (spec F: organizers can undo a mistaken
 * claim, and it is logged). Only entries that became an account's through a
 * claim can be unlinked here; an entry the account joined directly cannot.
 */
export async function unlinkParticipant(tournamentId: string, participantId: string, actorId: string, reason?: string | null): Promise<"ok" | "not_claimed"> {
  const svc = createServiceClient();
  const { data: part } = await svc.from("tournament_participants").select("id, user_id").eq("id", participantId).eq("tournament_id", tournamentId).maybeSingle();
  const userId = (part as { user_id: string | null } | null)?.user_id ?? null;
  if (!userId) return "not_claimed";
  const { data: claim } = await svc.from("tournament_guest_claims").select("id").eq("participant_id", participantId).eq("claimed_by", userId).not("claimed_at", "is", null).limit(1).maybeSingle();
  if (!claim) return "not_claimed";
  await svc.from("tournament_participants").update({ user_id: null }).eq("id", participantId).eq("user_id", userId);
  await audit({ tournamentId, claimId: (claim as { id: string }).id, participantId, event: "unlinked", actorId, meta: { previousUserId: userId, reason: reason?.slice(0, 300) ?? null } });
  return "ok";
}

/* ── Results-time claim email ────────────────────────────────────────────── */

/**
 * When a tournament completes, every guest entry with an email that is not
 * claimed yet gets "your results are saved" with a fresh claim link (spec F,
 * criterion 11). At most once a day per guest, so re-saving the status or a
 * second organizer clicking Complete never double-sends.
 */
export async function sendResultsClaims(tournamentId: string): Promise<{ sent: number; skipped?: string }> {
  const svc = createServiceClient();
  const { data: t } = await svc.from("tournaments").select("id, title, status").eq("id", tournamentId).maybeSingle();
  const tour = t as { id: string; title: string; status: string } | null;
  if (!tour) return { sent: 0, skipped: "not_found" };
  if (tour.status !== "complete") return { sent: 0, skipped: "not_complete" };

  const { data: guests } = await svc.from("tournament_participants").select("id, display_name, status")
    .eq("tournament_id", tournamentId).is("user_id", null).not("status", "in", "(dropped,waitlisted)");
  const guestRows = (guests ?? []) as { id: string; display_name: string }[];
  if (!guestRows.length) return { sent: 0 };

  const { data: claimRows } = await svc.from("tournament_guest_claims").select("participant_id, email, claimed_at, created_at")
    .eq("tournament_id", tournamentId).order("created_at", { ascending: false });
  const byPart = new Map<string, { email: string | null; claimed_at: string | null; created_at: string }[]>();
  for (const r of (claimRows ?? []) as { participant_id: string; email: string | null; claimed_at: string | null; created_at: string }[]) {
    byPart.set(r.participant_id, [...(byPart.get(r.participant_id) ?? []), r]);
  }

  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const base = getBaseUrl();
  let sent = 0;
  for (const g of guestRows) {
    const rows = byPart.get(g.id) ?? [];
    const email = rows.find((r) => r.email)?.email ?? null;
    if (!email) continue;                                   // no contact: the organizer can issue a manual link
    if (rows.some((r) => r.claimed_at)) continue;           // already claimed at some point
    if (rows.some((r) => Date.parse(r.created_at) > dayAgo)) continue; // a link went out in the last day
    const token = await issueClaim({ tournamentId, participantId: g.id, email });
    if (!token) continue;
    const res = await sendResultsClaimEmail({ to: email, toName: g.display_name, tournamentTitle: tour.title, claimUrl: `${base}/claim/${token}` }).catch(() => ({ ok: false as const }));
    if (res.ok) sent++;
  }
  return { sent };
}
