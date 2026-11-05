import "server-only";

/**
 * "This is me" for players listed from the Top 10 sheets (picks 2026-11-04, SGSXW3sBrn6GJSinYimSnc, all as
 * recommended; time-trials-m5.sql `tt_claims`). Someone signed in claims a listed name with a link that shows it's
 * them; the Mario Kart 8 Deluxe mushrooms updaters (whose sheets these are) or staff approve it in the review queue,
 * and the listed player's times, country and all later sheet reads move to the account. One account holds a name at a
 * time; staff settle disputes and can undo an approval, which sends the sheet's times back to the listed player.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { createNotification } from "@/lib/social/notifications";
import { round4Ready } from "./status";
import { inScope, reviewScope } from "./updaters";
import { playerPagePath } from "./playerPath";

/** The sheets are Mario Kart 8 Deluxe with mushrooms: that mode's updaters settle claims. */
export const SHEET_MODE = { game: "mk8dx", items: "shrooms" } as const;

export type ClaimStatus = "pending" | "approved" | "denied" | "undone";

async function tell(userId: string, title: string, message: string, link: string): Promise<void> {
  await createNotification({ userId, type: "system", title, message: message.slice(0, 300), link }).catch(() => undefined);
}

/** A time trials player who is a Top 10 sheet listing: its identity and name. */
export async function listedPlayer(player: string): Promise<{ identityId: string; name: string } | null> {
  if (!player.startsWith("i:") || !(await round4Ready())) return null;
  const { data } = await createServiceClient().from("gs_identities").select("id, display_name, platform").eq("id", player.slice(2)).maybeSingle();
  const r = data as { id: string; display_name: string | null; platform: string } | null;
  return r?.platform === "sheet" ? { identityId: r.id, name: r.display_name || "A player" } : null;
}

export interface ClaimView {
  /** Someone's claim on this name was approved (its times are on their account now). */
  taken: boolean;
  /** The viewer's own latest claim on it. */
  mine: { status: ClaimStatus; reason: string | null } | null;
}

export async function claimView(identityId: string, userId: string | null): Promise<ClaimView> {
  const db = createServiceClient();
  const [{ data: owner }, mine] = await Promise.all([
    db.from("tt_claims").select("id").eq("identity_id", identityId).eq("status", "approved").maybeSingle(),
    userId ? db.from("tt_claims").select("status, reason").eq("identity_id", identityId).eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const m = (mine as { data: { status: ClaimStatus; reason: string | null } | null }).data;
  return { taken: !!owner, mine: m ? { status: m.status, reason: m.reason } : null };
}

export type OpenClaimResult = { ok: true } | { ok: false; error: "not_listed" | "taken" | "pending" | "bad_link" | "failed" };

/** Someone says a listed name is them. */
export async function openClaim(args: { player: string; userId: string; link: string; note: string }): Promise<OpenClaimResult> {
  const listed = await listedPlayer(args.player);
  if (!listed) return { ok: false, error: "not_listed" };
  const link = args.link.trim();
  if (!/^https:\/\/\S{4,490}$/.test(link)) return { ok: false, error: "bad_link" };
  const view = await claimView(listed.identityId, args.userId);
  if (view.taken) return { ok: false, error: "taken" };
  if (view.mine?.status === "pending") return { ok: false, error: "pending" };
  const { error } = await createServiceClient().from("tt_claims").insert({ identity_id: listed.identityId, user_id: args.userId, link, note: args.note.trim().slice(0, 500) || null });
  if (error) return { ok: false, error: error.code === "23505" ? "pending" : "failed" };
  return { ok: true };
}

export interface QueueClaim {
  id: string;
  status: ClaimStatus;
  listedName: string;
  listedPage: string;
  /** The listed player's times on the boards (what moves to the account). */
  times: number;
  userName: string;
  username: string | null;
  link: string | null;
  note: string | null;
  at: string;
  /** Other people claiming the same name. */
  others: number;
}

type ClaimRaw = { id: string; identity_id: string; user_id: string; link: string | null; note: string | null; status: ClaimStatus; created_at: string; decided_at: string | null };

/** Claims waiting, oldest first, and (for staff) the latest approved ones, which can be undone. */
export async function claimQueue(staff: boolean): Promise<{ pending: QueueClaim[]; approved: QueueClaim[] }> {
  if (!(await round4Ready())) return { pending: [], approved: [] };
  const db = createServiceClient();
  const cols = "id, identity_id, user_id, link, note, status, created_at, decided_at";
  const [{ data: p }, { data: a }] = await Promise.all([
    db.from("tt_claims").select(cols).eq("status", "pending").order("created_at").limit(100),
    staff ? db.from("tt_claims").select(cols).eq("status", "approved").order("decided_at", { ascending: false }).limit(25) : Promise.resolve({ data: [] }),
  ]);
  const rows = [...((p ?? []) as ClaimRaw[]), ...((a ?? []) as ClaimRaw[])];
  if (!rows.length) return { pending: [], approved: [] };
  const identities = [...new Set(rows.map((r) => r.identity_id))];
  const users = [...new Set(rows.map((r) => r.user_id))];
  const [{ data: idRows }, { data: userRows }, counts] = await Promise.all([
    db.from("gs_identities").select("id, display_name").in("id", identities),
    db.from("users").select("id, display_name, username").in("id", users),
    Promise.all(identities.map(async (id) => {
      const { count } = await db.from("tt_times").select("id", { count: "exact", head: true }).eq("identity_id", id).eq("source", "sheet").eq("status", "ok");
      return [id, count ?? 0] as const;
    })),
  ]);
  const listed = new Map(((idRows ?? []) as { id: string; display_name: string | null }[]).map((r) => [r.id, r.display_name || "A player"]));
  const people = new Map(((userRows ?? []) as { id: string; display_name: string | null; username: string | null }[]).map((r) => [r.id, r]));
  const timesOf = new Map(counts);
  const pendingBy = new Map<string, number>();
  for (const r of (p ?? []) as ClaimRaw[]) pendingBy.set(r.identity_id, (pendingBy.get(r.identity_id) ?? 0) + 1);
  const view = (r: ClaimRaw): QueueClaim => {
    const u = people.get(r.user_id);
    return {
      id: r.id, status: r.status, listedName: listed.get(r.identity_id) ?? "A player", listedPage: playerPagePath(`i:${r.identity_id}`, null),
      times: timesOf.get(r.identity_id) ?? 0, userName: u?.display_name || u?.username || "A player", username: u?.username ?? null,
      link: r.link, note: r.note, at: r.status === "approved" ? r.decided_at ?? r.created_at : r.created_at, others: Math.max(0, (pendingBy.get(r.identity_id) ?? 1) - 1),
    };
  };
  return { pending: ((p ?? []) as ClaimRaw[]).map(view), approved: ((a ?? []) as ClaimRaw[]).map(view) };
}

/** How many claims are waiting (the updaters' Monday list). */
export async function pendingClaimCount(): Promise<number> {
  if (!(await round4Ready())) return 0;
  const { count } = await createServiceClient().from("tt_claims").select("id", { count: "exact", head: true }).eq("status", "pending");
  return count ?? 0;
}

/** Whether this person may settle claims: staff, reviewers, and the Mario Kart 8 Deluxe mushrooms updaters. */
export async function canSettleClaims(userId: string): Promise<boolean> {
  const scope = await reviewScope(userId);
  return inScope(scope, SHEET_MODE);
}

/** Approves a claim (the listed player's times move to the account) or turns it down with a reason they see. */
export async function decideClaim(id: string, by: string, approve: boolean, reason: string): Promise<{ ok: boolean; error?: string }> {
  if (!(await canSettleClaims(by))) return { ok: false, error: "not_reviewer" };
  const db = createServiceClient();
  const { data } = await db.from("tt_claims").select("id, identity_id, user_id, status").eq("id", id).maybeSingle();
  const c = data as { id: string; identity_id: string; user_id: string; status: ClaimStatus } | null;
  if (!c || c.status !== "pending") return { ok: false, error: "gone" };
  const why = reason.trim().slice(0, 300) || null;
  if (!approve && !why) return { ok: false, error: "reason_needed" };
  const now = new Date().toISOString();
  const { data: idRow } = await db.from("gs_identities").select("display_name").eq("id", c.identity_id).maybeSingle();
  const name = (idRow as { display_name: string | null } | null)?.display_name || "that name";
  if (!approve) {
    await db.from("tt_claims").update({ status: "denied", reason: why, decided_by: by, decided_at: now }).eq("id", id).eq("status", "pending");
    await tell(c.user_id, "Your legacy times claim wasn't approved", `${name}: ${why}`, playerPagePath(`i:${c.identity_id}`, null));
    return { ok: true };
  }
  // Claim it first (one approved per name), then move the times.
  const { error } = await db.from("tt_claims").update({ status: "approved", reason: null, decided_by: by, decided_at: now }).eq("id", id).eq("status", "pending");
  if (error) return { ok: false, error: error.code === "23505" ? "taken" : "failed" };
  const { error: moveErr } = await db.rpc("tt_claim_identity", { p_user: c.user_id, p_identity: c.identity_id });
  if (moveErr) {
    await db.from("tt_claims").update({ status: "pending", decided_by: null, decided_at: null }).eq("id", id);
    return { ok: false, error: "failed" };
  }
  // Anyone else claiming the same name hears it went to someone else.
  const { data: others } = await db.from("tt_claims").update({ status: "denied", reason: "This name was matched to another account.", decided_by: by, decided_at: now })
    .eq("identity_id", c.identity_id).eq("status", "pending").select("user_id");
  for (const o of (others ?? []) as { user_id: string }[]) await tell(o.user_id, "Your legacy times claim wasn't approved", `${name} was matched to another account. If that's wrong, write to support@gameshuffle.co.`, "/time-trials");
  await tell(c.user_id, "Your legacy times are on your account", `${name}'s legacy times are on your account now, and new ones will come straight to you.`, "/time-trials/players/me");
  return { ok: true };
}

/** Staff undo an approved claim: the sheet's times go back to the listed player. */
export async function undoClaim(id: string, by: string): Promise<{ ok: boolean; error?: string }> {
  const db = createServiceClient();
  const { data } = await db.from("tt_claims").select("id, identity_id, user_id, status").eq("id", id).maybeSingle();
  const c = data as { id: string; identity_id: string; user_id: string; status: ClaimStatus } | null;
  if (!c || c.status !== "approved") return { ok: false, error: "gone" };
  const { error } = await db.rpc("tt_unclaim_identity", { p_user: c.user_id, p_identity: c.identity_id });
  if (error) return { ok: false, error: "failed" };
  await db.from("tt_claims").update({ status: "undone", decided_by: by, decided_at: new Date().toISOString() }).eq("id", id);
  // The sheet rows point at the times, which keep their ids; nothing else to move.
  await tell(c.user_id, "Legacy times were taken off your account", "Staff moved those legacy times back to their listed player. Write to support@gameshuffle.co if you have questions.", "/time-trials/players/me");
  return { ok: true };
}
