/**
 * GET    /api/account/mfa → factor list, assurance level, policy, code count
 * POST   /api/account/mfa → { action: "recovery.regenerate" | "recovery.consume" | "prompt.dismiss" }
 *        recovery.consume: a valid code turns two-factor off (the authenticator is presumably lost),
 *        voids the other codes, signs this browser back in and tells the person by email, text
 *        (a verified number) and an in-app notice, asking them to set it up again.
 *
 * Enrolment and challenges happen client-side against Supabase Auth (the SDK
 * needs the session), so this route owns only the pieces Supabase doesn't:
 * recovery codes and the nudge state.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { consumeRecoveryCode, getMfaState, regenerateRecoveryCodes, turnOffMfaAfterRecovery } from "@/lib/auth/mfa";
import { sendSecurityAlert } from "@/lib/sms/securityAlerts";
import { createNotification } from "@/lib/social/notifications";
import { sendTransactionalEmail } from "@/lib/email/mailersend";
import { getBaseUrl } from "@/lib/env";

export const runtime = "nodejs";

export async function GET() {
  const state = await getMfaState();
  if (!state) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(state);
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { action?: string; code?: string };

  if (body.action === "recovery.regenerate") {
    // Issuing codes is itself a sensitive action: require a completed second
    // factor in this session (or that none exists yet, i.e. first enrolment).
    const state = await getMfaState();
    if (state?.enabled && state.currentLevel !== "aal2") return NextResponse.json({ error: "step_up_required" }, { status: 403 });
    const codes = await regenerateRecoveryCodes(user.id);
    return NextResponse.json({ ok: true, codes });
  }

  if (body.action === "recovery.consume") {
    if (!body.code) return NextResponse.json({ error: "code_required" }, { status: 400 });
    const ok = await consumeRecoveryCode(user.id, body.code);
    if (!ok) return NextResponse.json({ error: "invalid_code" }, { status: 400 });
    // The authenticator is presumably lost: two-factor goes off and they're asked to set it up again.
    try {
      await turnOffMfaAfterRecovery(user.id);
    } catch (err) {
      console.error("[mfa] recovery reset failed:", err);
      return NextResponse.json({ error: "reset_failed" }, { status: 500 });
    }
    // Removing the factor signed the account out everywhere. This browser already passed both
    // steps (password or email link, then the recovery code), so sign it straight back in.
    let signedIn = false;
    if (user.email) {
      const { data: link } = await createServiceClient().auth.admin.generateLink({ type: "magiclink", email: user.email });
      const tokenHash = link?.properties?.hashed_token;
      if (tokenHash) signedIn = !(await supabase.auth.verifyOtp({ type: "magiclink", token_hash: tokenHash })).error;
    }
    await tellMfaTurnedOff(user.id, user.email ?? null);
    return NextResponse.json({ ok: true, reset: true, signedIn });
  }

  if (body.action === "prompt.dismiss") {
    await createServiceClient().from("users").update({ mfa_prompt_dismissed_at: new Date().toISOString() }).eq("id", user.id);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "unknown_action" }, { status: 400 });
}

/** Email, text and an in-app notice: two-factor is off after a recovery code. Never fails the sign-in. */
async function tellMfaTurnedOff(userId: string, email: string | null): Promise<void> {
  const settings = `${getBaseUrl()}/account?tab=security`;
  await Promise.allSettled([
    sendSecurityAlert(userId, "mfa_disabled"),
    createNotification({
      userId,
      type: "system",
      title: "Two-factor sign-in is off",
      message: "You signed in with a recovery code, so two-factor sign-in was turned off and your other codes stopped working. Set it up again to keep your account safe.",
      link: "/account?tab=security",
    }),
    email
      ? sendTransactionalEmail({
        to: email,
        subject: "Two-factor sign-in was turned off on your GameShuffle account",
        text: [
          "Hi,",
          "",
          "Someone signed in to your GameShuffle account with one of your recovery codes, so two-factor sign-in was turned off and your other recovery codes stopped working.",
          "",
          "If that was you, set two-factor sign-in up again with your authenticator app:",
          settings,
          "",
          "If it wasn't you, change your password straight away from the same page and reply to this email so we can help.",
          "",
          "The GameShuffle team",
        ].join("\n"),
        replyTo: "security@gameshuffle.co",
      })
      : Promise.resolve(),
  ]);
}
