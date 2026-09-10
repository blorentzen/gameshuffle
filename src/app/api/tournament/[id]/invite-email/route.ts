import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { sendTransactionalEmail } from "@/lib/email/mailersend";

export const runtime = "nodejs";

/**
 * POST /api/tournament/[id]/invite-email  { emails: string[] }
 * Organizer-initiated email invites. The invitee lands on the public tournament
 * page and joins via the existing guest-join → soft-signup → claim funnel. The
 * email carries the account motivation (save your spot, track placements across
 * events, one-click via Discord/Twitch). Organizer only.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { emails } = (await req.json().catch(() => ({}))) as { emails?: unknown };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const admin = createServiceClient();
  const { data: t } = await admin
    .from("tournaments")
    .select("id, title, organizer_id")
    .eq("id", id)
    .maybeSingle();
  if (!t) return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
  if (t.organizer_id !== user.id) return NextResponse.json({ error: "Not your tournament" }, { status: 403 });

  const list = (Array.isArray(emails) ? emails : [])
    .map((e) => String(e).trim().toLowerCase())
    .filter((e, i, a) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && a.indexOf(e) === i)
    .slice(0, 50);
  if (list.length === 0) return NextResponse.json({ error: "Enter at least one valid email." }, { status: 400 });

  const { data: host } = await admin.from("users").select("display_name, username").eq("id", user.id).maybeSingle();
  const hostName = (host?.display_name as string) || (host?.username as string) || "A GameShuffle organizer";

  const base = process.env.NEXT_PUBLIC_BASE_URL || "https://gameshuffle.co";
  const link = `${base}/tournament/${id}`;

  let sent = 0;
  for (const email of list) {
    try {
      await sendTransactionalEmail({
        to: email,
        subject: `${hostName} invited you to ${t.title} on GameShuffle`,
        text:
          `${hostName} invited you to play in "${t.title}".\n\n` +
          `Join here: ${link}\n\n` +
          `Create a free GameShuffle account when you join to lock in your spot, track your placements across every event you enter, and get a heads-up when ${hostName} runs the next one. It takes a few seconds — or continue with Discord or Twitch in one click.\n\n` +
          `See you on the grid!`,
      });
      sent++;
    } catch {
      // best-effort per address
    }
  }

  return NextResponse.json({ ok: true, sent });
}
