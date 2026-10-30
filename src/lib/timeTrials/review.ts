import "server-only";

/**
 * Checking times (round 2, players' feedback 2026-10-29; supabase/time-trials-m2.sql).
 *
 * Every time shows as Unverified until a reviewer checks a clip of the run's last 30 seconds and flips it
 * to Verified. Reports are tickets: the reporter, the time's owner and reviewers see one thread, the
 * owner can answer with proof, and a reviewer keeps or removes the time with a reason everyone sees.
 * Reviewers are staff and admins plus anyone in tt_reviewers (the "Time trial reviewer" role).
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { describePlayers } from "@/lib/daily/boards";
import { createNotification } from "@/lib/social/notifications";
import { formatTime } from "./rules";
import { ttTrack, TT_GAMES } from "./tracks";
import { categoryText } from "./categories";
import { nudgeMovedUp, timeById, toTimeRow, TIME_COLS, topTensAround, ttReady, type TtTimeRow } from "./store";

export type TicketState = "open" | "waiting_owner" | "waiting_review" | "kept" | "removed";
export type TicketRole = "reporter" | "owner" | "reviewer";
const OPEN: TicketState[] = ["open", "waiting_owner", "waiting_review"];

/** "Mario Kart Stadium · 150cc, mushrooms · 1:36.990" for lists and notifications. */
export function timeLabel(t: Pick<TtTimeRow, "game" | "track" | "cc" | "items" | "vehicle" | "timeMs">): string {
  const track = ttTrack(t.game, t.track)?.name ?? "A track";
  return `${track} · ${categoryText(t.game, t.cc, t.items, t.vehicle, TT_GAMES[t.game].classes.length > 1)} · ${formatTime(t.timeMs)}`;
}

/** Staff, admins and named time trial reviewers. */
export async function isReviewer(userId: string | null): Promise<boolean> {
  if (!userId) return false;
  const db = createServiceClient();
  const [{ data: u }, { data: r }] = await Promise.all([
    db.from("users").select("role").eq("id", userId).maybeSingle(),
    db.from("tt_reviewers").select("user_id").eq("user_id", userId).maybeSingle(),
  ]);
  const role = (u as { role?: string | null } | null)?.role;
  return role === "staff" || role === "admin" || !!r;
}

async function tell(userId: string | null, title: string, message: string, link: string): Promise<void> {
  if (!userId) return;
  await createNotification({ userId, type: "system", title, message: message.slice(0, 300), link }).catch(() => undefined);
}

export type OpenTicketResult = { ok: true; id: string } | { ok: false; error: "gone" | "own_time" | "failed" };

/** A report opens a ticket (one per reporter and time; reporting again reopens it with the new reason). */
export async function openTicket(args: { timeId: string; reporter: string; reason: string; link: string | null }): Promise<OpenTicketResult> {
  const t = await timeById(args.timeId);
  if (!t || t.status !== "ok") return { ok: false, error: "gone" };
  if (t.player === args.reporter) return { ok: false, error: "own_time" };
  const db = createServiceClient();
  const reason = args.reason.trim().slice(0, 300) || "Reported";
  const { data, error } = await db.from("tt_reports").upsert(
    { time_id: t.id, reporter: args.reporter, reason, evidence_url: args.link, state: "open", resolved_at: null, resolved_by: null, outcome: null, decision_note: null },
    { onConflict: "time_id,reporter" },
  ).select("id").single();
  if (error || !data) { console.error("[tt] report failed:", error?.message); return { ok: false, error: "failed" }; }
  const id = (data as { id: string }).id;
  await db.from("tt_report_messages").insert({ report_id: id, author: args.reporter, author_user: args.reporter.startsWith("u:") ? args.reporter.slice(2) : null, role: "reporter", body: reason, link: args.link });
  await tell(t.userId, "Someone reported your time", `${timeLabel(t)}: "${reason}". You can answer with proof in the ticket.`, `/time-trials/tickets/${id}`);
  return { ok: true, id };
}

export interface TicketMessage { id: string; role: TicketRole; name: string; body: string; link: string | null; at: string }
export interface TicketView {
  id: string; state: TicketState; reason: string | null; evidenceUrl: string | null; decisionNote: string | null; at: string;
  time: TtTimeRow; label: string; ownerName: string; reporterName: string;
  messages: TicketMessage[];
  /** How the viewer is part of it (null = not part of it). */
  role: TicketRole | null;
}

type ReportRaw = { id: string; time_id: string; reporter: string; reason: string | null; evidence_url: string | null; state: TicketState; decision_note: string | null; created_at: string };
const REPORT_COLS = "id, time_id, reporter, reason, evidence_url, state, decision_note, created_at";

export async function ticketView(id: string, viewer: { player: string | null; userId: string | null }): Promise<TicketView | null> {
  if (!/^[0-9a-f-]{36}$/.test(id) || !(await ttReady())) return null;
  const db = createServiceClient();
  const { data } = await db.from("tt_reports").select(REPORT_COLS).eq("id", id).maybeSingle();
  const r = data as ReportRaw | null;
  if (!r) return null;
  const t = await timeById(r.time_id);
  if (!t) return null;
  const reviewer = await isReviewer(viewer.userId);
  const role: TicketRole | null = reviewer ? "reviewer" : viewer.player && viewer.player === t.player ? "owner" : viewer.player && viewer.player === r.reporter ? "reporter" : null;
  if (!role) return null;
  const { data: msgs } = await db.from("tt_report_messages").select("id, author, role, body, link, created_at").eq("report_id", id).order("created_at").limit(200);
  const list = (msgs ?? []) as { id: string; author: string; role: TicketRole; body: string; link: string | null; created_at: string }[];
  const names = await describePlayers([...new Set([t.player, r.reporter, ...list.map((m) => m.author)].filter((k) => !k.startsWith("d:") && !k.startsWith("staff")))]);
  const nameOf = (k: string, mrole: TicketRole) => (mrole === "reviewer" ? "Reviewer" : k.startsWith("d:") ? "A Discord player" : names.get(k)?.name ?? "A player");
  return {
    id: r.id, state: r.state, reason: r.reason, evidenceUrl: r.evidence_url, decisionNote: r.decision_note, at: r.created_at,
    time: t, label: timeLabel(t), ownerName: names.get(t.player)?.name ?? "A player", reporterName: nameOf(r.reporter, "reporter"),
    messages: list.map((m) => ({ id: m.id, role: m.role, name: nameOf(m.author, m.role), body: m.body, link: m.link, at: m.created_at })),
    role,
  };
}

/** A message in the ticket. An owner's or reporter's message puts it back to reviewers; a reviewer's asks the owner. */
export async function replyTicket(id: string, viewer: { player: string | null; userId: string | null }, body: string, link: string | null): Promise<{ ok: boolean; error?: string }> {
  const view = await ticketView(id, viewer);
  if (!view) return { ok: false, error: "not_yours" };
  if (!OPEN.includes(view.state)) return { ok: false, error: "closed" };
  const text = body.trim().slice(0, 1000);
  if (!text) return { ok: false, error: "empty" };
  const db = createServiceClient();
  await db.from("tt_report_messages").insert({ report_id: id, author: view.role === "reviewer" ? `staff:${viewer.userId}` : viewer.player, author_user: viewer.userId, role: view.role, body: text, link });
  const state: TicketState = view.role === "reviewer" ? "waiting_owner" : "waiting_review";
  await db.from("tt_reports").update({ state }).eq("id", id);
  if (view.role === "reviewer") await tell(view.time.userId, "A reviewer asked about your time", `${view.label}: "${text}"`, `/time-trials/tickets/${id}`);
  return { ok: true };
}

/** A reviewer's decision closes every open ticket on that time; Remove takes the time off every board. */
export async function decideTicket(id: string, reviewerUserId: string, outcome: "kept" | "removed", note: string): Promise<{ ok: boolean; error?: string }> {
  if (!(await isReviewer(reviewerUserId))) return { ok: false, error: "not_reviewer" };
  const db = createServiceClient();
  const { data } = await db.from("tt_reports").select(REPORT_COLS).eq("id", id).maybeSingle();
  const r = data as ReportRaw | null;
  if (!r) return { ok: false, error: "gone" };
  const t = await timeById(r.time_id);
  if (!t) return { ok: false, error: "gone" };
  const why = note.trim().slice(0, 500) || (outcome === "kept" ? "The time checks out." : "The time doesn't check out.");
  const now = new Date().toISOString();
  if (outcome === "removed") {
    const before = t.status === "ok" ? await topTensAround(t) : null;
    await db.from("tt_times").update({ status: "removed", removed_reason: why.slice(0, 300), removed_by: reviewerUserId, removed_at: now }).eq("id", t.id);
    if (before) await nudgeMovedUp(t, before);
  }
  const { data: open } = await db.from("tt_reports").select("id, reporter").eq("time_id", t.id).in("state", OPEN);
  const tickets = (open ?? []) as { id: string; reporter: string }[];
  if (!tickets.some((x) => x.id === id)) tickets.push({ id, reporter: r.reporter });
  for (const x of tickets) {
    await db.from("tt_reports").update({ state: outcome, outcome, resolved_at: now, resolved_by: reviewerUserId, decision_note: why }).eq("id", x.id);
    await db.from("tt_report_messages").insert({ report_id: x.id, author: `staff:${reviewerUserId}`, author_user: reviewerUserId, role: "reviewer", body: `${outcome === "kept" ? "Kept" : "Removed"}: ${why}` });
    if (x.reporter.startsWith("u:")) await tell(x.reporter.slice(2), outcome === "kept" ? "A time you reported was kept" : "A time you reported was removed", `${timeLabel(t)}: ${why}`, `/time-trials/tickets/${x.id}`);
  }
  await tell(t.userId, outcome === "kept" ? "Your reported time was kept" : "Your time was removed", `${timeLabel(t)}: ${why}`, `/time-trials/tickets/${id}`);
  return { ok: true };
}

export interface QueueVideo { time: TtTimeRow; label: string; name: string }
export interface QueueTicket { id: string; state: TicketState; reason: string | null; at: string; label: string; ownerName: string; reporterName: string }

/** The reviewers' queue: clips to check, oldest first, and open tickets. */
export async function reviewQueue(): Promise<{ videos: QueueVideo[]; tickets: QueueTicket[] }> {
  if (!(await ttReady())) return { videos: [], tickets: [] };
  const db = createServiceClient();
  const [{ data: vids }, { data: reps }] = await Promise.all([
    db.from("tt_times").select(TIME_COLS).eq("status", "ok").eq("video_status", "waiting").not("video_url", "is", null).order("created_at").limit(100),
    db.from("tt_reports").select(REPORT_COLS).in("state", OPEN).order("created_at").limit(100),
  ]);
  const times = ((vids ?? []) as Parameters<typeof toTimeRow>[0][]).map(toTimeRow);
  const reports = (reps ?? []) as ReportRaw[];
  const reportTimes = await Promise.all(reports.map((r) => timeById(r.time_id)));
  const names = await describePlayers([...new Set([...times.map((t) => t.player), ...reportTimes.filter(Boolean).map((t) => t!.player), ...reports.map((r) => r.reporter).filter((k) => !k.startsWith("d:"))])]);
  return {
    videos: times.map((t) => ({ time: t, label: timeLabel(t), name: names.get(t.player)?.name ?? "A player" })),
    tickets: reports.flatMap((r, i) => {
      const t = reportTimes[i];
      if (!t) return [];
      return [{ id: r.id, state: r.state, reason: r.reason, at: r.created_at, label: timeLabel(t), ownerName: names.get(t.player)?.name ?? "A player", reporterName: r.reporter.startsWith("d:") ? "A Discord player" : names.get(r.reporter)?.name ?? "A player" }];
    }),
  };
}

/** A reviewer flips a time to Verified, or says the clip doesn't match (with a reason the player sees). */
export async function decideVideo(timeId: string, reviewerUserId: string, ok: boolean, note: string): Promise<{ ok: boolean; error?: string }> {
  if (!(await isReviewer(reviewerUserId))) return { ok: false, error: "not_reviewer" };
  const t = await timeById(timeId);
  if (!t || t.status !== "ok") return { ok: false, error: "gone" };
  const why = note.trim().slice(0, 300) || null;
  if (!ok && !why) return { ok: false, error: "reason_needed" };
  await createServiceClient().from("tt_times").update({ video_status: ok ? "checked" : "rejected", video_checked_by: reviewerUserId, video_checked_at: new Date().toISOString(), video_note: why }).eq("id", timeId);
  const track = ttTrack(t.game, t.track);
  await tell(t.userId, ok ? "Your time is verified" : "Your clip didn't match your time", ok ? `${timeLabel(t)} is now Verified.` : `${timeLabel(t)}: ${why}. You can add another clip.`, track ? `/time-trials/players/me` : "/time-trials");
  return { ok: true };
}

export interface Reviewer { userId: string; name: string; username: string | null; at: string }

export async function listReviewers(): Promise<Reviewer[]> {
  if (!(await ttReady())) return [];
  const db = createServiceClient();
  const { data } = await db.from("tt_reviewers").select("user_id, created_at").order("created_at");
  const rows = (data ?? []) as { user_id: string; created_at: string }[];
  if (!rows.length) return [];
  const { data: users } = await db.from("users").select("id, display_name, username").in("id", rows.map((r) => r.user_id));
  const byId = new Map(((users ?? []) as { id: string; display_name: string | null; username: string | null }[]).map((u) => [u.id, u]));
  return rows.map((r) => ({ userId: r.user_id, name: byId.get(r.user_id)?.display_name || byId.get(r.user_id)?.username || "A player", username: byId.get(r.user_id)?.username ?? null, at: r.created_at }));
}

export async function addReviewer(username: string, by: string): Promise<{ ok: boolean; error?: string }> {
  const db = createServiceClient();
  const { data } = await db.from("users").select("id").eq("username", username.trim().toLowerCase().replace(/^@/, "")).maybeSingle();
  const id = (data as { id: string } | null)?.id;
  if (!id) return { ok: false, error: "no_user" };
  await db.from("tt_reviewers").upsert({ user_id: id, added_by: by }, { onConflict: "user_id" });
  return { ok: true };
}

export async function removeReviewer(userId: string): Promise<void> {
  await createServiceClient().from("tt_reviewers").delete().eq("user_id", userId);
}

/** A report from a Discord button: a ticket with a plain reason (they can add more on the site). */
export async function reportFromDiscord(timeId: string, discordId: string): Promise<boolean> {
  const res = await openTicket({ timeId, reporter: `d:${discordId}`, reason: "Reported from Discord", link: null });
  return res.ok || res.error === "own_time";
}
