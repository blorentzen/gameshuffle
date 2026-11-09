import "server-only";

/**
 * Asking for an update (picks 2026-11-08, all as recommended; supabase/time-trials-m7.sql).
 *
 * A reviewer no longer turns a clip down: they ask the player to update the time. The ask is a thread on the time
 * (tt_reports kind 'ask', reporter 'ask': one per time, reopened by the next ask) that only the player and reviewers
 * see; the board keeps showing the time as Unverified, and an ask never removes anything (removing is a report's
 * decision). The player hears about it where they are: a notification for an account, a message from the competitive
 * bot for a Discord-only player. Their reply, a new clip, a picture or a fixed time puts it back in the clips queue
 * marked Updated; checking the time closes the thread. One reminder after ASK_REMIND_DAYS.
 *
 * A reviewer can also fix the time themselves (picks 2026-11-09): the fix goes in the same thread, which closes with
 * FIXED_NOTE but stays open to the player's reply for FIX_REPLY_DAYS; a reply reopens it and puts the time back in
 * the clips queue.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { createNotification } from "@/lib/social/notifications";
import { describePlayers } from "@/lib/daily/boards";
import { compRest } from "@/lib/discord/compRest";
import { SITE_URL } from "@/lib/seo";
import { timeById, type TtTimeRow } from "./store";
import { formatTime } from "./rules";
import { trackPath, ttTrack } from "./tracks";

const OPEN = ["open", "waiting_owner", "waiting_review"] as const;
export type AskState = (typeof OPEN)[number];
export const ASK_REMIND_DAYS = 7;
/** A thread closed by a reviewer's fix carries this decision note; its player can still answer it for FIX_REPLY_DAYS. */
export const FIXED_NOTE = "Fixed by a reviewer";
export const FIX_REPLY_DAYS = 30;

let ready: { at: number; ok: boolean } | null = null;
/** Whether time-trials-m7.sql has run (kept for a minute either way). Before it, asks fall back to the old send-back. */
export async function asksReady(): Promise<boolean> {
  if (ready && Date.now() - ready.at < 60_000) return ready.ok;
  const { error } = await createServiceClient().from("tt_reports").select("reminded_at").limit(1);
  ready = { at: Date.now(), ok: !error };
  return ready.ok;
}

/** The time's own window on its board: where an ask is answered. */
export function timePath(t: Pick<TtTimeRow, "id" | "game" | "track" | "cc" | "items" | "vehicle">): string {
  const track = ttTrack(t.game, t.track);
  const path = track ? trackPath(track, t.cc, { items: t.items, vehicle: t.vehicle }) : "/time-trials";
  return `${path}${path.includes("?") ? "&" : "?"}time=${t.id}`;
}

function shortLabel(t: Pick<TtTimeRow, "game" | "track" | "timeMs">): string {
  return `${ttTrack(t.game, t.track)?.name ?? "A track"} · ${formatTime(t.timeMs)}`;
}

/**
 * A Discord-only player ("i:<identity>") hears from the competitive bot. Production only: the dev database holds real
 * players' Discord ids, and a test ask must never reach them (as the ladders' penalty messages).
 */
async function messageOnDiscord(player: string, content: string): Promise<boolean> {
  const devDatabase = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").includes("rbtdomefinsrclgubpuf");
  const live = !devDatabase && (process.env.VERCEL_ENV ? process.env.VERCEL_ENV === "production" : process.env.NODE_ENV === "production");
  if (!live || !player.startsWith("i:")) return false;
  const { data } = await createServiceClient().from("gs_identities").select("platform, platform_id").eq("id", player.slice(2)).maybeSingle();
  const ident = data as { platform: string; platform_id: string } | null;
  if (ident?.platform !== "discord" || !ident.platform_id) return false;
  const dm = await compRest<{ id: string }>("POST", "/users/@me/channels", { recipient_id: ident.platform_id });
  if (!dm.ok) return false;
  const sent = await compRest("POST", `/channels/${dm.data.id}/messages`, { content: content.slice(0, 1900), allowed_mentions: { parse: [] } });
  return sent.ok;
}

/** Tell a time's player: a notification on their account, else a Discord message. The link opens the time itself. */
export async function tellPlayer(t: TtTimeRow, title: string, message: string): Promise<void> {
  const link = timePath(t);
  if (t.userId) {
    await createNotification({ userId: t.userId, type: "system", title, message: message.slice(0, 300), link }).catch(() => undefined);
    return;
  }
  await messageOnDiscord(t.player, `**${title}**\n${message}\n${SITE_URL}${link}`).catch(() => false);
}

async function openAskId(timeId: string): Promise<{ id: string; state: AskState } | null> {
  const { data } = await createServiceClient().from("tt_reports").select("id, state").eq("time_id", timeId).eq("kind", "ask").in("state", [...OPEN]).maybeSingle();
  return (data as { id: string; state: AskState } | null) ?? null;
}

/** The thread a reviewer's fix closed, while its player can still answer it. */
async function fixedAskId(timeId: string): Promise<{ id: string } | null> {
  const since = new Date(Date.now() - FIX_REPLY_DAYS * 86_400_000).toISOString();
  const { data } = await createServiceClient().from("tt_reports").select("id").eq("time_id", timeId).eq("kind", "ask").eq("state", "kept")
    .eq("decision_note", FIXED_NOTE).gte("resolved_at", since).maybeSingle();
  return (data as { id: string } | null) ?? null;
}

/** Whether a closed thread is a reviewer's fix its player can still answer (the ticket route's reply reopens it). */
export function fixStillAnswerable(r: { kind?: string | null; state: string; decision_note: string | null; resolved_at: string | null }): boolean {
  return r.kind === "ask" && r.state === "kept" && r.decision_note === FIXED_NOTE && !!r.resolved_at && Date.parse(r.resolved_at) > Date.now() - FIX_REPLY_DAYS * 86_400_000;
}

/**
 * A reviewer fixed the time (picks 2026-11-09): the change goes in the time's thread and the player hears about it
 * where they are. Verifying closes the thread as a fix (still answerable); a fix without verifying leaves an open ask
 * as it was, or starts a closed fix thread the player can answer.
 */
export async function noteReviewerFix(t: TtTimeRow, reviewerUserId: string, changed: string, note: string | null, verified: boolean): Promise<void> {
  const what = `Changed ${changed}${verified ? " and verified it" : ""}.`;
  const body = note ? `${what} ${note}` : what;
  const told = `${ttTrack(t.game, t.track)?.name ?? "A track"}: a reviewer changed ${changed}${verified ? " and verified it" : ""}.${note ? ` "${note}"` : ""} If that's wrong, reply from the time.`;
  const title = "A reviewer fixed your time";
  if (!(await asksReady())) { await tellPlayer(t, title, told); return; }
  const db = createServiceClient();
  const now = new Date().toISOString();
  const open = await openAskId(t.id);
  let id = open?.id ?? null;
  if (open && verified) {
    await db.from("tt_reports").update({ state: "kept", outcome: "kept", resolved_at: now, resolved_by: reviewerUserId, decision_note: FIXED_NOTE, reason: body.slice(0, 500) }).eq("id", open.id);
  } else if (!open) {
    const { data, error } = await db.from("tt_reports").upsert(
      { time_id: t.id, reporter: "ask", kind: "ask", reason: body.slice(0, 500), evidence_url: null, state: "kept", outcome: "kept", resolved_at: now, resolved_by: reviewerUserId, decision_note: FIXED_NOTE, reminded_at: null },
      { onConflict: "time_id,reporter" },
    ).select("id").single();
    if (error || !data) console.error("[tt] fix thread failed:", error?.message);
    id = (data as { id: string } | null)?.id ?? null;
  }
  if (id) await db.from("tt_report_messages").insert({ report_id: id, author: `staff:${reviewerUserId}`, author_user: reviewerUserId, role: "reviewer", body: body.slice(0, 1000) });
  await tellPlayer(t, title, told);
}

/**
 * A reviewer asks the player to update a time. The clip stays on file as not checked (video_status 'rejected' in the
 * database, "Update asked" on screen), the note is the ask, and the thread opens (or reopens) waiting on the player.
 */
export async function askForUpdate(t: TtTimeRow, reviewerUserId: string, note: string): Promise<void> {
  const db = createServiceClient();
  const now = new Date().toISOString();
  await db.from("tt_times").update({ video_status: "rejected", video_checked_by: reviewerUserId, video_checked_at: now, video_note: note }).eq("id", t.id);
  if (!(await asksReady())) {
    await tellPlayer(t, "Your clip didn't match your time", `${shortLabel(t)}: ${note}. You can add another clip.`);
    return;
  }
  const { data, error } = await db.from("tt_reports").upsert(
    { time_id: t.id, reporter: "ask", kind: "ask", reason: note, evidence_url: null, state: "waiting_owner", resolved_at: null, resolved_by: null, outcome: null, decision_note: null, reminded_at: null },
    { onConflict: "time_id,reporter" },
  ).select("id").single();
  if (error || !data) { console.error("[tt] ask failed:", error?.message); return; }
  await db.from("tt_report_messages").insert({ report_id: (data as { id: string }).id, author: `staff:${reviewerUserId}`, author_user: reviewerUserId, role: "reviewer", body: note });
  await tellPlayer(t, "A reviewer asked you to update a time", `${shortLabel(t)}: "${note}"`);
}

/** The player did something about an open ask (replied with a new clip, a picture, a fixed time): back to reviewers. */
export async function noteOwnerUpdate(timeId: string, player: string, userId: string | null, what: string, link: string | null = null): Promise<void> {
  if (!(await asksReady())) return;
  const ask = await openAskId(timeId);
  if (!ask) return;
  const db = createServiceClient();
  await db.from("tt_report_messages").insert({ report_id: ask.id, author: player, author_user: userId, role: "owner", body: what.slice(0, 1000), link });
  await db.from("tt_reports").update({ state: "waiting_review" }).eq("id", ask.id);
}

/** Checking the time settles its ask. */
export async function settleAsk(timeId: string, reviewerUserId: string): Promise<void> {
  if (!(await asksReady())) return;
  const ask = await openAskId(timeId);
  if (!ask) return;
  const now = new Date().toISOString();
  const db = createServiceClient();
  await db.from("tt_reports").update({ state: "kept", outcome: "kept", resolved_at: now, resolved_by: reviewerUserId, decision_note: "Verified" }).eq("id", ask.id);
  await db.from("tt_report_messages").insert({ report_id: ask.id, author: `staff:${reviewerUserId}`, author_user: reviewerUserId, role: "reviewer", body: "Verified. Thanks for the update." });
}

export interface AskMessage { role: "owner" | "reviewer"; name: string; body: string; link: string | null; at: string }
export interface AskView { id: string; state: AskState | "fixed"; askedAt: string; messages: AskMessage[] }

/** The open ask on a time, for its player and reviewers (reviewers sign as "Reviewer", as in report threads). */
export async function askView(t: Pick<TtTimeRow, "id" | "player">): Promise<AskView | null> {
  if (!(await asksReady())) return null;
  const open = await openAskId(t.id);
  const fixed = open ? null : await fixedAskId(t.id);
  const ask: { id: string; state: AskState | "fixed" } | null = open ?? (fixed ? { id: fixed.id, state: "fixed" } : null);
  if (!ask) return null;
  const { data } = await createServiceClient().from("tt_report_messages").select("author, role, body, link, created_at").eq("report_id", ask.id).order("created_at").limit(100);
  const rows = (data ?? []) as { author: string; role: "owner" | "reviewer" | "reporter"; body: string; link: string | null; created_at: string }[];
  const names = await describePlayers([t.player]);
  const messages = rows.filter((m) => m.role !== "reporter").map((m) => ({
    role: m.role as "owner" | "reviewer",
    name: m.role === "reviewer" ? "Reviewer" : names.get(t.player)?.name ?? "The player",
    body: m.body, link: m.link, at: m.created_at,
  }));
  const asked = rows.filter((m) => m.role === "reviewer").at(-1)?.created_at ?? rows[0]?.created_at ?? new Date().toISOString();
  return { id: ask.id, state: ask.state, askedAt: asked, messages };
}

/** The open asks on a set of times (the clips queue's Updated rows): the ask and the player's latest answer. */
export type QueueAsk = { state: AskState; note: string | null; reply: string | null; replyLink: string | null; fixed: boolean };
export async function asksFor(timeIds: string[]): Promise<Map<string, QueueAsk>> {
  const out = new Map<string, QueueAsk>();
  if (!timeIds.length || !(await asksReady())) return out;
  const db = createServiceClient();
  const { data } = await db.from("tt_reports").select("id, time_id, state, reason, decision_note").eq("kind", "ask").in("state", [...OPEN]).in("time_id", timeIds);
  const asks = (data ?? []) as { id: string; time_id: string; state: AskState; reason: string | null; decision_note: string | null }[];
  if (!asks.length) return out;
  const { data: msgs } = await db.from("tt_report_messages").select("report_id, body, link, created_at").in("report_id", asks.map((a) => a.id)).eq("role", "owner").order("created_at");
  const last = new Map<string, { body: string; link: string | null }>();
  for (const m of (msgs ?? []) as { report_id: string; body: string; link: string | null }[]) last.set(m.report_id, m);
  for (const a of asks) out.set(a.time_id, { state: a.state, note: a.reason, reply: last.get(a.id)?.body ?? null, replyLink: last.get(a.id)?.link ?? null, fixed: a.decision_note === FIXED_NOTE });
  return out;
}

/** Times whose player answered an ask without a new clip (a reply, a picture, a fixed time): they go in the clips queue too. */
export async function answeredAskTimes(): Promise<string[]> {
  if (!(await asksReady())) return [];
  const { data } = await createServiceClient().from("tt_reports").select("time_id").eq("kind", "ask").eq("state", "waiting_review").order("created_at").limit(300);
  return ((data ?? []) as { time_id: string }[]).map((r) => r.time_id);
}

export interface AttentionItem {
  kind: "ask" | "answered" | "report";
  timeId: string;
  label: string;
  href: string;
  note: string | null;
}

/** What's waiting on a player: asks to answer, asks they answered (waiting on a reviewer), reports on their times. */
export async function attentionFor(player: string): Promise<AttentionItem[]> {
  if (!(await asksReady())) return [];
  const { data } = await createServiceClient().from("tt_reports")
    .select("id, kind, state, reason, tt_times!inner(id, player, status, game, track, cc, items, vehicle, time_ms)")
    .eq("tt_times.player", player).eq("tt_times.status", "ok").in("kind", ["ask", "report"]).in("state", [...OPEN]).order("created_at").limit(50);
  type Row = { id: string; kind: "ask" | "report"; state: AskState; reason: string | null; tt_times: { id: string; game: TtTimeRow["game"]; track: string; cc: TtTimeRow["cc"]; items: TtTimeRow["items"]; vehicle: TtTimeRow["vehicle"]; time_ms: number } };
  const out: AttentionItem[] = [];
  for (const r of (data ?? []) as unknown as Row[]) {
    const t = r.tt_times;
    const label = shortLabel({ game: t.game, track: t.track, timeMs: t.time_ms });
    if (r.kind === "ask") {
      out.push({ kind: r.state === "waiting_review" ? "answered" : "ask", timeId: t.id, label, href: timePath({ id: t.id, game: t.game, track: t.track, cc: t.cc, items: t.items, vehicle: t.vehicle }), note: r.reason });
    } else if (r.state !== "waiting_review") {
      out.push({ kind: "report", timeId: t.id, label, href: `/time-trials/tickets/${r.id}`, note: r.reason });
    }
  }
  // Waiting on you first, then what's with a reviewer.
  return out.sort((a, b) => Number(a.kind === "answered") - Number(b.kind === "answered"));
}

/** The oldest ask waiting on an account, for Home's "since you were here" line. */
export async function askWaitingOn(userId: string): Promise<{ label: string; href: string; note: string | null } | null> {
  if (!(await asksReady())) return null;
  const { data } = await createServiceClient().from("tt_reports")
    .select("reason, tt_times!inner(id, user_id, status, game, track, cc, items, vehicle, time_ms)")
    .eq("kind", "ask").eq("state", "waiting_owner").eq("tt_times.user_id", userId).eq("tt_times.status", "ok").order("created_at").limit(1);
  const r = ((data ?? []) as unknown as { reason: string | null; tt_times: { id: string; game: TtTimeRow["game"]; track: string; cc: TtTimeRow["cc"]; items: TtTimeRow["items"]; vehicle: TtTimeRow["vehicle"]; time_ms: number } }[])[0];
  if (!r) return null;
  const t = r.tt_times;
  return { label: shortLabel({ game: t.game, track: t.track, timeMs: t.time_ms }), href: timePath({ id: t.id, game: t.game, track: t.track, cc: t.cc, items: t.items, vehicle: t.vehicle }), note: r.reason };
}

/** One reminder for asks nobody answered in ASK_REMIND_DAYS (the daily time trials job runs it). */
export async function remindAsks(): Promise<number> {
  if (!(await asksReady())) return 0;
  const db = createServiceClient();
  const { data } = await db.from("tt_reports").select("id, time_id, reason").eq("kind", "ask").eq("state", "waiting_owner").is("reminded_at", null).limit(200);
  const asks = (data ?? []) as { id: string; time_id: string; reason: string | null }[];
  const cutoff = Date.now() - ASK_REMIND_DAYS * 86_400_000;
  let sent = 0;
  for (const a of asks) {
    // The latest ask in the thread: asking again starts the wait over.
    const { data: m } = await db.from("tt_report_messages").select("created_at").eq("report_id", a.id).eq("role", "reviewer").order("created_at", { ascending: false }).limit(1).maybeSingle();
    const at = Date.parse((m as { created_at: string } | null)?.created_at ?? "");
    if (!Number.isFinite(at) || at > cutoff) continue;
    const t = await timeById(a.time_id);
    if (!t || t.status !== "ok") continue;
    await tellPlayer(t, "Still waiting on your update", `${shortLabel(t)}: "${a.reason ?? "A reviewer asked for an update"}". Update it or reply to the reviewer.`);
    await db.from("tt_reports").update({ reminded_at: new Date().toISOString() }).eq("id", a.id);
    sent++;
  }
  return sent;
}
