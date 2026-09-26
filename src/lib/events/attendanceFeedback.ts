import "server-only";

/**
 * What the organizer learns from withdrawals and no-shows.
 *
 * The aggregate is the point. "Four of your last ten no-shows said the time did
 * not work for them" is something an organizer can act on by moving the start;
 * ten individual apologies are not. So the summary leads with counts and keeps
 * the notes underneath.
 *
 * This never reaches player insight. One organizer's event is not the next
 * organizer's business, and a list of somebody's excuses is exactly the
 * unappealable reputation record the seeding spec decided against.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { reasonLabel } from "@/data/attendance-reasons";

export interface FeedbackTally {
  reason: string;
  label: string;
  count: number;
}

export interface AttendanceFeedbackSummary {
  /** Counted separately: pulling out in advance and never arriving are
   *  different problems with different fixes. */
  withdrew: FeedbackTally[];
  noShow: FeedbackTally[];
  notes: { displayName: string; kind: string; label: string; note: string }[];
  total: number;
  /** How many withdrew or no-showed WITHOUT saying anything. Shown so the
   *  organizer reads the tally as a sample, not as the whole story. */
  silent: number;
}

export async function getAttendanceFeedback(
  tournamentId: string,
  absentCount: number,
): Promise<AttendanceFeedbackSummary | null> {
  const svc = createServiceClient();
  const { data, error } = await svc
    .from("tournament_attendance_feedback")
    .select("kind, reason, note, participant_id, tournament_participants(display_name)")
    .eq("tournament_id", tournamentId);
  // Absent until attendance-feedback-m1; nothing to show is not a failure.
  if (error) return null;

  const rows = (data ?? []) as unknown as {
    kind: string; reason: string; note: string | null;
    tournament_participants?: { display_name?: string } | { display_name?: string }[] | null;
  }[];

  const tally = (kind: string): FeedbackTally[] => {
    const counts = new Map<string, number>();
    for (const r of rows.filter((x) => x.kind === kind)) {
      counts.set(r.reason, (counts.get(r.reason) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([reason, count]) => ({ reason, label: reasonLabel(reason), count }))
      .sort((a, b) => b.count - a.count);
  };

  const nameOf = (r: (typeof rows)[number]): string => {
    const p = r.tournament_participants;
    const one = Array.isArray(p) ? p[0] : p;
    return one?.display_name ?? "Someone";
  };

  return {
    withdrew: tally("withdrew"),
    noShow: tally("no_show"),
    notes: rows.filter((r) => r.note?.trim()).map((r) => ({
      displayName: nameOf(r), kind: r.kind, label: reasonLabel(r.reason), note: r.note!.trim(),
    })),
    total: rows.length,
    silent: Math.max(0, absentCount - rows.length),
  };
}
