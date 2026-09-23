/**
 * GET    /api/account/mfa → factor list, assurance level, policy, code count
 * POST   /api/account/mfa → { action: "recovery.regenerate" | "recovery.consume" | "prompt.dismiss" }
 *
 * Enrolment and challenges happen client-side against Supabase Auth (the SDK
 * needs the session), so this route owns only the pieces Supabase doesn't:
 * recovery codes and the nudge state.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { consumeRecoveryCode, getMfaState, regenerateRecoveryCodes } from "@/lib/auth/mfa";

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
    return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "invalid_code" }, { status: 400 });
  }

  if (body.action === "prompt.dismiss") {
    await createServiceClient().from("users").update({ mfa_prompt_dismissed_at: new Date().toISOString() }).eq("id", user.id);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "unknown_action" }, { status: 400 });
}
