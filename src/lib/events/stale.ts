/**
 * The one nudge for a stale tournament (server only): an open tournament
 * whose date passed STALE_OPEN_DAYS ago without starting has already left
 * browse; its organizer hears about it once, with a link to finish or cancel
 * it. Claimed per tournament (stale_nudged_at) so a retried cron can't nudge
 * twice. Runs with the event reminders cron.
 */

import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { createNotification } from "@/lib/social/notifications";
import { staleCutoffIso } from "@/lib/events/lifecycle";

export async function nudgeStaleTournaments(limit = 50): Promise<number> {
  const svc = createServiceClient();
  const { data, error } = await svc.from("tournaments").select("id, title, organizer_id")
    .eq("status", "open").is("archived_at", null).is("stale_nudged_at", null)
    .lt("date_time", staleCutoffIso()).limit(limit);
  if (error) return 0; // columns missing until events-archive-m1.sql runs
  let sent = 0;
  for (const t of (data ?? []) as { id: string; title: string; organizer_id: string }[]) {
    const { data: claimed } = await svc.from("tournaments").update({ stale_nudged_at: new Date().toISOString() })
      .eq("id", t.id).is("stale_nudged_at", null).select("id").maybeSingle();
    if (!claimed) continue;
    await createNotification({
      userId: t.organizer_id,
      type: "tournament_update",
      title: `${t.title}: its date has passed`,
      message: "It never started, so it's no longer listed. Mark it finished, cancel it, or move it to a new date.",
      link: `/tournament/${t.id}/manage`,
    }).catch((err) => console.warn("[stale] nudge failed:", err));
    sent += 1;
  }
  return sent;
}
