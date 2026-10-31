/**
 * The one nudge for a stale tournament (server only): an open tournament
 * whose date passed STALE_OPEN_DAYS ago without starting, or one still in
 * progress STUCK_LIVE_DAYS after its date, has already left browse; its
 * organizer hears about it once, with a link to finish or cancel it. Claimed per tournament (stale_nudged_at) so a retried cron can't nudge
 * twice. Runs with the event reminders cron.
 */

import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { createNotification } from "@/lib/social/notifications";
import { staleCutoffIso, stuckCutoffIso } from "@/lib/events/lifecycle";

const NUDGES = {
  open: {
    title: (t: string) => `${t}: its date has passed`,
    message: "It never started, so it's no longer listed. Mark it finished, cancel it, or move it to a new date.",
  },
  in_progress: {
    title: (t: string) => `${t}: still marked as running`,
    message: "Its date was a few days ago, so it's no longer listed. Enter the last results and finish it, or cancel it.",
  },
} as const;

export async function nudgeStaleTournaments(limit = 50): Promise<number> {
  const svc = createServiceClient();
  // Stale opens (never started) and stuck in-progress tournaments (never
  // finished): one nudge each, sharing the stale_nudged_at claim.
  const [opens, stuck] = await Promise.all([
    svc.from("tournaments").select("id, title, organizer_id, status")
      .eq("status", "open").is("archived_at", null).is("stale_nudged_at", null)
      .lt("date_time", staleCutoffIso()).limit(limit),
    svc.from("tournaments").select("id, title, organizer_id, status")
      .eq("status", "in_progress").is("archived_at", null).is("stale_nudged_at", null).is("championship_id", null)
      .lt("date_time", stuckCutoffIso()).limit(limit),
  ]);
  if (opens.error) return 0; // columns missing until events-archive-m1.sql runs
  let sent = 0;
  const rows = [...(opens.data ?? []), ...(stuck.error ? [] : stuck.data ?? [])] as { id: string; title: string; organizer_id: string; status: "open" | "in_progress" }[];
  for (const t of rows) {
    const { data: claimed } = await svc.from("tournaments").update({ stale_nudged_at: new Date().toISOString() })
      .eq("id", t.id).is("stale_nudged_at", null).select("id").maybeSingle();
    if (!claimed) continue;
    const copy = NUDGES[t.status] ?? NUDGES.open;
    await createNotification({
      userId: t.organizer_id,
      type: "tournament_update",
      title: copy.title(t.title),
      message: copy.message,
      link: `/tournament/${t.id}/manage`,
    }).catch((err) => console.warn("[stale] nudge failed:", err));
    sent += 1;
  }
  return sent;
}
