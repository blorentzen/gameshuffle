import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { recordOptIns } from "@/lib/email/subscriptions";
import { sendTransactionalEmail } from "@/lib/email/mailersend";

export const runtime = "nodejs";

/**
 * POST /api/tournament/[id]/guest-join
 * Public (logged-out) join. Turnstile-gated to protect the email-send path.
 * Creates a guest participant; if an email is given, records marketing consent
 * (when checked) and emails a soft-signup link that claims the spot on signup.
 *   body: { displayName, friendCode?, email?, consent?, turnstileToken }
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    displayName?: string; friendCode?: string; email?: string; consent?: boolean; turnstileToken?: string;
  };

  const displayName = (body.displayName || "").trim().slice(0, 60);
  const friendCode = (body.friendCode || "").trim().slice(0, 40) || null;
  const email = (body.email || "").trim().toLowerCase();
  // Email is required — it's how a guest claims their spot with a free account,
  // and it keeps rosters to real, reachable people.
  const hasEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!displayName) return NextResponse.json({ error: "Enter a display name." }, { status: 400 });
  if (!hasEmail) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });

  const remoteIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (!(await verifyTurnstileToken(body.turnstileToken, remoteIp))) {
    return NextResponse.json({ error: "Captcha check failed. Please try again." }, { status: 400 });
  }

  const admin = createServiceClient();
  const { data: t } = await admin
    .from("tournaments")
    .select("id, title, status, acceptance_mode, max_participants")
    .eq("id", id)
    .maybeSingle();
  if (!t) return NextResponse.json({ error: "Tournament not found." }, { status: 404 });
  if (t.status !== "open") return NextResponse.json({ error: "Registration isn't open for this tournament." }, { status: 400 });

  if (t.max_participants) {
    const { count } = await admin
      .from("tournament_participants")
      .select("id", { count: "exact", head: true })
      .eq("tournament_id", id)
      .neq("status", "dropped");
    if ((count || 0) >= t.max_participants) {
      return NextResponse.json({ error: "This tournament is full." }, { status: 400 });
    }
  }

  const status = t.acceptance_mode === "auto" ? "confirmed" : "registered";
  const { data: participant, error } = await admin
    .from("tournament_participants")
    .insert({ tournament_id: id, user_id: null, display_name: displayName, friend_code: friendCode, status })
    .select("id")
    .single();
  if (error || !participant) {
    return NextResponse.json({ error: error?.message || "Could not join." }, { status: 400 });
  }

  if (hasEmail) {
    if (body.consent) {
      await recordOptIns({ email, userId: null, categories: ["product_updates"] });
    }
    const { data: claim } = await admin
      .from("tournament_guest_claims")
      .insert({ tournament_id: id, participant_id: participant.id, email })
      .select("token")
      .single();
    if (claim) {
      const base = process.env.NEXT_PUBLIC_BASE_URL || "https://gameshuffle.co";
      const claimPath = `/tournament/${id}?claim=${claim.token}`;
      const signupUrl = `${base}/signup?prefillEmail=${encodeURIComponent(email)}&prefillName=${encodeURIComponent(displayName)}&redirect=${encodeURIComponent(claimPath)}`;
      await sendTransactionalEmail({
        to: email,
        toName: displayName,
        subject: `You're in: ${t.title} on GameShuffle`,
        text: `You saved your spot in "${t.title}" as ${displayName}.\n\nCreate a free GameShuffle account to lock in your spot, track your rankings across events, and save your progress. It takes a few seconds and links this entry to your account:\n${signupUrl}\n\nSee you on the grid!`,
      });
    }
  }

  return NextResponse.json({ ok: true, participantId: participant.id });
}
