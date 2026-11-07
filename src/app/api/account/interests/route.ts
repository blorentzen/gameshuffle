/**
 * An account's interests (personalization picks 2026-11-05; src/lib/interests).
 *   GET   → { ready, interests (null until they pick), suggested (what to preselect) }; ?steps=1 adds `steps`; ?nav=1 → { interests } only
 *   PATCH { interests: string[] } → saves their picks (an empty list is a choice: none)
 * While a staff member previews a persona (src/lib/preview), both read and change the preview instead.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { accountInterests, firstStepsFor, interestState, saveInterests } from "@/lib/interests/store";
import { cleanInterests } from "@/lib/interests/rules";
import { personaPreview } from "@/lib/preview/server";
import { PERSONA_COOKIE, encodePersona } from "@/lib/preview/persona";

export const runtime = "nodejs";
const NO_STORE = { "Cache-Control": "private, no-store" };

async function who() {
  const { data: { user } } = await (await createClient()).auth.getUser();
  return user;
}

export async function GET(req: Request) {
  const user = await who();
  if (!user) return NextResponse.json({ ok: false, error: "signin" }, { status: 401 });
  // ?nav=1: just the interests that order the menus (stored, or inferred once and stored; a staff preview wins).
  if (new URL(req.url).searchParams.get("nav") === "1") {
    return NextResponse.json({ ok: true, interests: await accountInterests(user.id).catch(() => []) }, { headers: NO_STORE });
  }
  const provider = (user.app_metadata?.provider as string | undefined) ?? null;
  const state = await interestState(user.id, { provider });
  // ?steps=1 adds the first steps for these interests, each with whether it's done (Account ▸ Your home).
  const steps = new URL(req.url).searchParams.get("steps") === "1"
    ? await firstStepsFor(user.id, state.interests ?? state.suggested).catch(() => [])
    : undefined;
  return NextResponse.json({ ok: true, ...state, ...(steps ? { steps } : {}) }, { headers: NO_STORE });
}

export async function PATCH(req: Request) {
  const user = await who();
  if (!user) return NextResponse.json({ ok: false, error: "signin" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { interests?: unknown };
  if (!Array.isArray(body.interests)) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  // A staff member previewing a persona changes the preview, never their own account.
  const preview = await personaPreview();
  if (preview) {
    const interests = cleanInterests(body.interests);
    (await cookies()).set({ name: PERSONA_COOKIE, value: encodePersona({ ...preview, interests }), httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/" });
    return NextResponse.json({ ok: true, interests, preview: true }, { headers: NO_STORE });
  }
  const res = await saveInterests(user.id, body.interests);
  return NextResponse.json(res, { status: res.ok ? 200 : res.error === "not_ready" ? 503 : 500, headers: NO_STORE });
}
