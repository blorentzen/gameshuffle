import "server-only";

/**
 * Updaters for one game and items (round 3 pick 8A, tt_updaters): staff name players who know a mode (for example
 * MK8DX No mushrooms) to check its clips and settle its tickets, from the same review screen, only for that mode.
 * Staff, admins and the time trial reviewers keep seeing everything. Every Monday each updater gets a note with
 * that week's clips and reports for their mode (`sendUpdaterDigests`, /api/cron/tt-updaters).
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { pendingClaimCount } from "./claims";
import { createNotification } from "@/lib/social/notifications";
import { gsDay } from "@/lib/time/gsClock";
import { round3Ready } from "./status";
import { itemsLabel, type TtItems } from "./categories";
import { TT_GAMES, type TtGame } from "./tracks";

export interface Mode { game: TtGame; items: TtItems }
export const modeLabel = (m: Mode) => `${TT_GAMES[m.game].short} · ${itemsLabel(m.items)}`;
const OPEN = ["open", "waiting_owner", "waiting_review"];

/** "all" for staff, admins and reviewers; the modes an updater looks after; null for anyone else. */
export async function reviewScope(userId: string | null): Promise<"all" | Mode[] | null> {
  if (!userId) return null;
  const db = createServiceClient();
  const [{ data: u }, { data: r }] = await Promise.all([
    db.from("users").select("role").eq("id", userId).maybeSingle(),
    db.from("tt_reviewers").select("user_id").eq("user_id", userId).maybeSingle(),
  ]);
  const role = (u as { role?: string | null } | null)?.role;
  if (role === "staff" || role === "admin" || r) return "all";
  if (!(await round3Ready())) return null;
  const { data } = await db.from("tt_updaters").select("game, items").eq("user_id", userId);
  const modes = (data ?? []) as Mode[];
  return modes.length ? modes : null;
}

export const inScope = (scope: "all" | Mode[] | null, t: Mode) => scope === "all" || (!!scope && scope.some((m) => m.game === t.game && m.items === t.items));

/** What waits in one mode: clips to check and open tickets (reports and flags). */
export async function modeCounts(mode: Mode): Promise<{ clips: number; tickets: number }> {
  const db = createServiceClient();
  const [{ count: clips }, { count: tickets }] = await Promise.all([
    db.from("tt_times").select("id", { count: "exact", head: true }).eq("status", "ok").eq("video_status", "waiting").not("video_url", "is", null).eq("game", mode.game).eq("items", mode.items),
    db.from("tt_reports").select("id, tt_times!inner(game, items)", { count: "exact", head: true }).in("state", OPEN).eq("tt_times.game", mode.game).eq("tt_times.items", mode.items),
  ]);
  return { clips: clips ?? 0, tickets: tickets ?? 0 };
}

/** Monday's note to each updater, once per updater and mode per Pacific day (`last_digest`). */
export async function sendUpdaterDigests(opts: { force?: boolean } = {}): Promise<{ sent: number; skipped: number }> {
  if (!(await round3Ready())) return { sent: 0, skipped: 0 };
  const today = gsDay();
  const db = createServiceClient();
  const { data } = await db.from("tt_updaters").select("user_id, game, items, last_digest");
  let sent = 0, skipped = 0;
  for (const r of (data ?? []) as { user_id: string; game: TtGame; items: TtItems; last_digest: string | null }[]) {
    if (!opts.force && r.last_digest === today) { skipped++; continue; }
    // Claim the day first, so two runs never both send.
    let claim = db.from("tt_updaters").update({ last_digest: today }).eq("user_id", r.user_id).eq("game", r.game).eq("items", r.items);
    if (!opts.force) claim = claim.or(`last_digest.is.null,last_digest.neq.${today}`);
    const { data: claimed } = await claim.select("user_id");
    if (!claimed?.length) { skipped++; continue; }
    const c = await modeCounts(r);
    // The Top 10 sheets are Mario Kart 8 Deluxe with mushrooms: that mode's updaters also settle sheet claims (round 4).
    const claims = r.game === "mk8dx" && r.items === "shrooms" ? await pendingClaimCount() : 0;
    const what = c.clips || c.tickets || claims
      ? `${c.clips} ${c.clips === 1 ? "clip" : "clips"} to check, ${c.tickets} ${c.tickets === 1 ? "report" : "reports"}${claims ? `, ${claims} name ${claims === 1 ? "claim" : "claims"}` : ""}.`
      : "Nothing waiting. Thanks for keeping it tidy.";
    await createNotification({ userId: r.user_id, type: "system", title: `This week in ${modeLabel(r)}`, message: what, link: "/time-trials/review" }).catch(() => undefined);
    sent++;
  }
  return { sent, skipped };
}
