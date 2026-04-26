/**
 * POST /api/contact/submit
 *
 * Public contact form endpoint. Turnstile-gated. Sends a team notification
 * to support@gameshuffle.co (reply-to set to the requester) and an
 * auto-confirmation back to the requester.
 *
 * If the requester is signed in, their user_id is included in the team
 * notification for context (no DB write — keeps this endpoint lightweight).
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { sendContactTeamNotification, sendContactConfirmation, CONTACT_TOPIC_LABELS } from "@/lib/email/contact";

export const runtime = "nodejs";

const VALID_TOPICS = new Set(Object.keys(CONTACT_TOPIC_LABELS));
const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const name: string | null =
    typeof body.name === "string" ? body.name.trim().slice(0, 200) || null : null;
  const email: string =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const topic: string = typeof body.topic === "string" ? body.topic : "";
  const message: string =
    typeof body.message === "string" ? body.message.trim().slice(0, 5000) : "";
  const turnstileToken: string | null =
    typeof body.turnstileToken === "string" ? body.turnstileToken : null;

  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
  }
  if (!VALID_TOPICS.has(topic)) {
    return NextResponse.json({ error: "Please select a topic." }, { status: 400 });
  }
  if (!message || message.length < 10) {
    return NextResponse.json({ error: "Please include a short message (at least 10 characters)." }, { status: 400 });
  }

  const remoteIp =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    undefined;
  const captchaOk = await verifyTurnstileToken(turnstileToken, remoteIp);
  if (!captchaOk) {
    return NextResponse.json({ error: "Bot verification failed. Please try again." }, { status: 400 });
  }

  // Best-effort: if the requester is signed in, attach their user id to the
  // team notification for routing context.
  let authenticatedUserId: string | null = null;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    authenticatedUserId = user?.id ?? null;
  } catch {
    // Anonymous submitter — fine.
  }

  const submittedAt = new Date();

  const teamResult = await sendContactTeamNotification({
    name,
    email,
    topic,
    message,
    submittedAt,
    authenticatedUserId,
  });
  if (!teamResult.ok) {
    console.error("[contact/submit] team notification failed:", teamResult.error);
    return NextResponse.json(
      { error: "We couldn't deliver your message. Please email support@gameshuffle.co directly." },
      { status: 502 }
    );
  }

  // Confirmation is best-effort — team notification is what matters most.
  await sendContactConfirmation({ to: email, name, topic }).catch((err) => {
    console.error("[contact/submit] confirmation send failed (non-fatal):", err);
  });

  return NextResponse.json({ success: true });
}
