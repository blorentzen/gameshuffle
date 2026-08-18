/**
 * POST /api/beta/submit
 *
 * Public Streamer Beta application endpoint. Turnstile-gated. Sends a team
 * notification to support@gameshuffle.co (reply-to the applicant) plus an
 * auto-confirmation to the applicant.
 *
 * Best-effort persistence to `public.beta_applications` (service role) so the
 * team has a reviewable list — non-fatal if the table hasn't been migrated yet,
 * since the team-notification email is the guaranteed path.
 */

import { NextResponse, after } from "next/server";
import { createHash } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { syncUserByEmail } from "@/lib/marketing/mailerlite";
import {
  sendBetaTeamNotification,
  sendBetaConfirmation,
  BETA_PLATFORM_LABELS,
  BETA_SIZE_LABELS,
} from "@/lib/email/beta";

export const runtime = "nodejs";

const VALID_PLATFORMS = new Set(Object.keys(BETA_PLATFORM_LABELS));
const VALID_SIZES = new Set(Object.keys(BETA_SIZE_LABELS));
const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  // Account-first: applicants must be signed in so we can tie the application
  // to a real user and set them up with Pro when accepted.
  let authenticatedUserId: string | null = null;
  let accountEmail: string | null = null;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    authenticatedUserId = user?.id ?? null;
    accountEmail = user?.email ?? null;
  } catch {
    // fall through to the 401 below
  }
  if (!authenticatedUserId || !accountEmail) {
    return NextResponse.json(
      { error: "Please create an account and sign in before applying." },
      { status: 401 },
    );
  }

  const name = typeof body.name === "string" ? body.name.trim().slice(0, 200) || null : null;
  const email = accountEmail.trim().toLowerCase();
  const platformRaw = typeof body.platform === "string" ? body.platform : "";
  const platform = VALID_PLATFORMS.has(platformRaw) ? platformRaw : null;
  const channelUrl =
    typeof body.channelUrl === "string" ? body.channelUrl.trim().slice(0, 300) || null : null;
  const sizeRaw = typeof body.communitySize === "string" ? body.communitySize : "";
  const communitySize = VALID_SIZES.has(sizeRaw) ? sizeRaw : null;
  const about = typeof body.about === "string" ? body.about.trim().slice(0, 3000) || null : null;
  const turnstileToken = typeof body.turnstileToken === "string" ? body.turnstileToken : null;

  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Your account email looks invalid. Contact support." }, { status: 400 });
  }

  const remoteIp =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    undefined;
  const captchaOk = await verifyTurnstileToken(turnstileToken, remoteIp);
  if (!captchaOk) {
    return NextResponse.json({ error: "Bot verification failed. Please try again." }, { status: 400 });
  }

  const submittedAt = new Date();

  // Team notification is the guaranteed path — fail the request only if it fails.
  const teamResult = await sendBetaTeamNotification({
    name,
    email,
    platform,
    channelUrl,
    communitySize,
    about,
    submittedAt,
    authenticatedUserId,
  });
  if (!teamResult.ok) {
    console.error("[beta/submit] team notification failed:", teamResult.error);
    return NextResponse.json(
      { error: "We couldn't submit your application. Please email support@gameshuffle.co directly." },
      { status: 502 },
    );
  }

  // Best-effort persistence — non-fatal if the table isn't migrated yet.
  try {
    const admin = createServiceClient();
    const ipHash = remoteIp ? createHash("sha256").update(remoteIp).digest("hex") : null;
    const { error } = await admin.from("beta_applications").insert({
      name,
      email,
      platform,
      channel_url: channelUrl,
      community_size: communitySize,
      about,
      user_id: authenticatedUserId,
      ip_hash: ipHash,
    });
    if (error) console.error("[beta/submit] db insert failed (non-fatal):", error.message);
  } catch (err) {
    console.error("[beta/submit] db insert threw (non-fatal):", err);
  }

  // Confirmation is best-effort — the application is already recorded.
  await sendBetaConfirmation({ to: email, name }).catch((err) => {
    console.error("[beta/submit] confirmation send failed (non-fatal):", err);
  });

  // Add to the MailerLite Beta/Testing group (drives the beta-welcome
  // automation) after responding — best-effort, inert without the API key.
  after(async () => {
    try {
      await syncUserByEmail(email, { origination: "beta", beta: true });
    } catch (err) {
      console.error("[beta/submit] mailerlite sync failed (non-fatal):", err);
    }
  });

  return NextResponse.json({ success: true });
}
