/**
 * POST /api/dsar/submit
 *
 * Public DSAR submission endpoint. Anyone can call it (Turnstile-gated to
 * keep bots out). Each successful call inserts a row in `dsar_requests`
 * with status='pending_verification' and emails the requester a magic
 * link they must click within 7 days to confirm.
 *
 * Per gs-dsar-spec.md §4.2.
 */

import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { createServiceClient } from "@/lib/supabase/admin";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { sendDSARVerificationEmail } from "@/lib/email/dsar";

export const runtime = "nodejs";

const VALID_REQUEST_TYPES = new Set([
  "access",
  "correction",
  "deletion",
  "portability",
  "opt_out_marketing",
  "opt_out_sale",
  "other",
]);

const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

function publicBaseUrl(request: Request): string {
  return (
    process.env.NEXT_PUBLIC_BASE_URL ||
    new URL(request.url).origin ||
    "https://www.gameshuffle.co"
  );
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const name: string | null = typeof body.name === "string" ? body.name.trim().slice(0, 200) || null : null;
  const email: string = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const requestType: string = typeof body.request_type === "string" ? body.request_type : "";
  const description: string | null =
    typeof body.description === "string" && body.description.trim() ? body.description.trim().slice(0, 1000) : null;
  const turnstileToken: string | null = typeof body.turnstileToken === "string" ? body.turnstileToken : null;

  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
  }
  if (!VALID_REQUEST_TYPES.has(requestType)) {
    return NextResponse.json({ error: "Please select a valid request type." }, { status: 400 });
  }

  const remoteIp =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    undefined;
  const captchaOk = await verifyTurnstileToken(turnstileToken, remoteIp);
  if (!captchaOk) {
    return NextResponse.json({ error: "Bot verification failed. Please try again." }, { status: 400 });
  }

  // Random 32-byte token shown to the user; store only its SHA-256 hash so a
  // DB read can't be replayed back into a valid verification link.
  const verificationToken = crypto.randomBytes(32).toString("base64url");
  const verificationTokenHash = crypto
    .createHash("sha256")
    .update(verificationToken)
    .digest("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const supabase = createServiceClient();

  // Best-effort account match by email so the admin notification can flag
  // whether this requester has a current GameShuffle account. `auth.users`
  // is the source of truth for emails — `public.users` doesn't store them.
  let userId: string | null = null;
  try {
    const { data } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
    const match = data?.users?.find((u) => u.email?.toLowerCase() === email);
    userId = match?.id ?? null;
  } catch (err) {
    console.warn("[dsar/submit] auth.admin lookup failed (non-fatal):", err);
  }

  const { data: dsarRow, error: insertErr } = await supabase
    .from("dsar_requests")
    .insert({
      user_id: userId,
      requester_email: email,
      requester_name: name,
      request_type: requestType,
      description,
      status: "pending_verification",
      verification_token_hash: verificationTokenHash,
      verification_token_expires_at: expiresAt.toISOString(),
    })
    .select("id")
    .single();

  if (insertErr || !dsarRow) {
    console.error("[dsar/submit] insert failed:", insertErr);
    return NextResponse.json({ error: "Failed to submit request." }, { status: 500 });
  }

  const baseUrl = publicBaseUrl(request);
  const verificationUrl = `${baseUrl}/data-request/verify?token=${encodeURIComponent(
    verificationToken
  )}&id=${encodeURIComponent(dsarRow.id)}`;

  const sendResult = await sendDSARVerificationEmail({
    to: email,
    name,
    verificationUrl,
    requestType,
  });
  if (!sendResult.ok) {
    console.error("[dsar/submit] verification email send failed:", sendResult.error);
    // Don't expose the underlying failure — request is still on file.
    return NextResponse.json(
      { error: "We couldn't send the verification email. Please email privacy@gameshuffle.co directly." },
      { status: 502 }
    );
  }

  return NextResponse.json({ success: true });
}
