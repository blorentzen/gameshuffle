import { NextRequest, NextResponse } from "next/server";
import { getBaseUrl } from "@/lib/env";
import { createServiceClient } from "@/lib/supabase/admin";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { recordOptIns } from "@/lib/email/subscriptions";
import { sendTransactionalEmail } from "@/lib/email/mailersend";
import { issueClaim } from "@/lib/tournaments/claims";
import { joinDecision } from "@/lib/events/waitlist";

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
    .select("id, title, status, acceptance_mode, max_participants, entry_policy")
    .eq("id", id)
    .maybeSingle();
  if (!t) return NextResponse.json({ error: "Tournament not found." }, { status: 404 });
  if (t.status !== "open") return NextResponse.json({ error: "Registration isn't open for this tournament." }, { status: 400 });

  /* Accounts-only rejects guests here as well as in the database. The trigger in
     tournament-entry-policy-m1.sql is the real guarantee; this exists so the
     person gets a sentence they can act on instead of a constraint violation.
     `entry_policy` is absent until that migration runs, and undefined is not
     'accounts_only', so pre-migration behaviour is unchanged. */
  if ((t as { entry_policy?: string }).entry_policy === "accounts_only") {
    return NextResponse.json(
      { error: "This tournament needs a GameShuffle account to enter.", needsAccount: true },
      { status: 403 },
    );
  }

  // A seat, or the waitlist when it's full (guests can wait in line too; offers come by email).
  const decision = await joinDecision("tournament", id);
  if (decision === "paid") return NextResponse.json({ error: "This tournament sells tickets. Get one from the tournament page." }, { status: 400 });
  if (decision === "waitlist_full") return NextResponse.json({ error: "This tournament is full and so is its waitlist." }, { status: 400 });
  const waitlisted = decision === "waitlist";

  const status = waitlisted ? "waitlisted" : t.acceptance_mode === "auto" ? "confirmed" : "registered";
  const { data: participant, error } = await admin
    .from("tournament_participants")
    .insert({ tournament_id: id, user_id: null, display_name: displayName, status, ...(waitlisted ? { waitlisted_at: new Date().toISOString() } : {}) })
    .select("id")
    .single();
  if (error || !participant) {
    return NextResponse.json({ error: error?.message || "Could not join." }, { status: 400 });
  }

  /* Contact goes to the private table, never onto the participant row, which
     is world-readable. Best effort: a missing friend code must not fail a join,
     and the table is absent until participant-contact-privacy-m1 is applied. */
  if (friendCode) {
    await admin.from("tournament_participant_contact")
      .upsert({ participant_id: participant.id, tournament_id: id, friend_code: friendCode }, { onConflict: "participant_id" })
      .then(undefined, () => {});
  }

  if (hasEmail) {
    if (body.consent) {
      await recordOptIns({ email, userId: null, categories: ["product_updates"] });
    }
    // Only a hash of the token is stored (after tournament-claims-m1); the
    // plaintext exists just long enough to go in this email.
    const token = await issueClaim({ tournamentId: id, participantId: participant.id, email });
    if (token) {
      const base = getBaseUrl();
      // The dedicated claim page, never the public tournament URL (spec F).
      const claimPath = `/claim/${token}`;
      const signupUrl = `${base}/signup?prefillEmail=${encodeURIComponent(email)}&prefillName=${encodeURIComponent(displayName)}&redirect=${encodeURIComponent(claimPath)}`;
      await sendTransactionalEmail({
        to: email,
        toName: displayName,
        subject: waitlisted ? `You're on the waitlist: ${t.title}` : `You're in: ${t.title} on GameShuffle`,
        text: (waitlisted
          ? `"${t.title}" is full, so you're on the waitlist as ${displayName}. If a spot opens up, we'll email you a link to claim it.\n\n`
          : `You saved your spot in "${t.title}" as ${displayName}.\n\n`) + `Create a free GameShuffle account to lock in your spot, track your rankings across events, and save your progress. It takes a few seconds and links this entry to your account:\n${signupUrl}\n\nSee you on the grid!`,
      });
    }
  }

  return NextResponse.json({ ok: true, participantId: participant.id, waitlisted });
}
