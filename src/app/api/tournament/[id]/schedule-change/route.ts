import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { getTournamentRecipients } from "@/lib/tournaments/recipients";
import { createNotification } from "@/lib/social/notifications";
import { sendTournamentRescheduledEmail, sendTournamentCancelledEmail } from "@/lib/email/tournament";
import { formatEventTime } from "@/lib/time/format";

export const runtime = "nodejs";

/**
 * POST /api/tournament/[id]/schedule-change
 * Organizer-only. Moves the tournament to a new time OR cancels it, then fans
 * out an in-app notification (account participants) + email (account + guest)
 * so nobody's left on the old plan.
 *   body: { action: "reschedule", dateTime: ISO } | { action: "cancel" }
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { action?: string; dateTime?: string };
  const admin = createServiceClient();

  const { data: t } = await admin
    .from("tournaments")
    .select("id, title, organizer_id, status")
    .eq("id", id)
    .maybeSingle();
  if (!t) return NextResponse.json({ error: "Tournament not found." }, { status: 404 });
  if (t.organizer_id !== user.id) return NextResponse.json({ error: "Not the organizer." }, { status: 403 });

  const base = process.env.NEXT_PUBLIC_BASE_URL || "https://gameshuffle.co";
  const url = `${base}/tournament/${id}`;
  const link = `/tournament/${id}`;

  if (body.action === "reschedule") {
    const iso = body.dateTime ? new Date(body.dateTime) : null;
    if (!iso || Number.isNaN(iso.getTime())) {
      return NextResponse.json({ error: "Invalid date/time." }, { status: 400 });
    }
    const startIso = iso.toISOString();
    const { error } = await admin.from("tournaments").update({ date_time: startIso }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const recipients = await getTournamentRecipients(admin, id);
    let notified = 0, emailed = 0;
    for (const r of recipients) {
      if (r.userId) {
        await createNotification({
          userId: r.userId,
          type: "tournament_update",
          title: "Tournament time changed",
          message: `${t.title} now starts ${formatEventTime(startIso, r.timezone)}`,
          link,
          data: { tournamentId: id, change: "reschedule" },
        });
        notified++;
      }
      if (r.email) {
        await sendTournamentRescheduledEmail({
          to: r.email, toName: r.displayName ?? undefined,
          tournamentTitle: t.title, startIso, tournamentUrl: url, viewerTz: r.timezone,
        });
        emailed++;
      }
    }
    const reached = recipients.filter((r) => r.userId || r.email).length;
    return NextResponse.json({ ok: true, dateTime: startIso, reached, notified, emailed });
  }

  if (body.action === "cancel") {
    const { error } = await admin.from("tournaments").update({ status: "cancelled" }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const recipients = await getTournamentRecipients(admin, id);
    let notified = 0, emailed = 0;
    for (const r of recipients) {
      if (r.userId) {
        await createNotification({
          userId: r.userId,
          type: "tournament_update",
          title: "Tournament cancelled",
          message: `${t.title} has been cancelled by the organizer.`,
          link,
          data: { tournamentId: id, change: "cancel" },
        });
        notified++;
      }
      if (r.email) {
        await sendTournamentCancelledEmail({
          to: r.email, toName: r.displayName ?? undefined,
          tournamentTitle: t.title, tournamentUrl: url,
        });
        emailed++;
      }
    }
    const reached = recipients.filter((r) => r.userId || r.email).length;
    return NextResponse.json({ ok: true, status: "cancelled", reached, notified, emailed });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
