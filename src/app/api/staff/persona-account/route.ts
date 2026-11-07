/**
 * Dev only: sign in as a test persona account, and back (menus and account picks 2026-11-05, pick 6A).
 *   POST { handle }      staff/admin → signs this browser in as that test account (src/lib/preview/devAccounts.ts)
 *   POST { back: true }  a test account that came from staff → signs the staff account back in
 *
 * Refused everywhere but the dev database on a deployment that isn't production (`devAccountsOn`). Sign-in is a
 * server-side magic link (generateLink + verifyOtp), like the recovery-code path in /api/account/mfa. A staff account
 * with two-factor comes back at the first step and is asked for its code, as at any sign-in.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { VIEW_AS_TIER_COOKIE, VIEW_AS_UNAUTH_COOKIE } from "@/lib/capabilities/staff-impersonation";
import { PERSONA_COOKIE } from "@/lib/preview/persona";
import { devAccountsOn, devPersonaByEmail, devPersonaByHandle, personaEmail } from "@/lib/preview/devAccounts";
import { DEV_RETURN_COOKIE, readReturn, signReturn } from "@/lib/preview/server";

export const runtime = "nodejs";
const NO_STORE = { "Cache-Control": "private, no-store" };
const fail = (error: string, status: number) => NextResponse.json({ ok: false, error }, { status, headers: NO_STORE });

async function signInAs(email: string): Promise<boolean> {
  const { data: link } = await createServiceClient().auth.admin.generateLink({ type: "magiclink", email });
  const tokenHash = link?.properties?.hashed_token;
  if (!tokenHash) return false;
  const { error } = await (await createClient()).auth.verifyOtp({ type: "magiclink", token_hash: tokenHash });
  return !error;
}

export async function POST(req: Request) {
  if (!devAccountsOn()) return fail("not_here", 404);
  const body = (await req.json().catch(() => ({}))) as { handle?: unknown; back?: unknown };
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user) return fail("signin", 401);
  const jar = await cookies();
  const attrs = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/" };

  if (body.back === true) {
    if (!devPersonaByEmail(user.email)) return fail("not_a_test_account", 400);
    const staffId = readReturn(jar.get(DEV_RETURN_COOKIE)?.value);
    if (!staffId) return fail("no_return", 400);
    const admin = createServiceClient();
    const { data: row } = await admin.from("users").select("role").eq("id", staffId).maybeSingle();
    if (row?.role !== "staff" && row?.role !== "admin") return fail("forbidden", 403);
    const { data: staff } = await admin.auth.admin.getUserById(staffId);
    const email = staff?.user?.email;
    if (!email || !(await signInAs(email))) return fail("signin_failed", 500);
    jar.delete(DEV_RETURN_COOKIE);
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  }

  const persona = devPersonaByHandle(typeof body.handle === "string" ? body.handle : null);
  if (!persona) return fail("unknown_persona", 400);
  // Only staff start from here; a test account switching to another keeps the staff account it came from.
  const { data: me } = await createServiceClient().from("users").select("role").eq("id", user.id).maybeSingle();
  const isStaff = me?.role === "staff" || me?.role === "admin";
  const returnTo = isStaff ? user.id : devPersonaByEmail(user.email) ? readReturn(jar.get(DEV_RETURN_COOKIE)?.value) : null;
  if (!returnTo) return fail("forbidden", 403);
  if (!(await signInAs(personaEmail(persona.handle)))) return fail("not_seeded", 500);
  jar.set({ name: DEV_RETURN_COOKIE, value: signReturn(returnTo), ...attrs, maxAge: 60 * 60 * 24 * 7 });
  // A test account is its own person: no previews ride along.
  for (const name of [PERSONA_COOKIE, VIEW_AS_TIER_COOKIE, VIEW_AS_UNAUTH_COOKIE]) jar.delete(name);
  return NextResponse.json({ ok: true, name: persona.name }, { headers: NO_STORE });
}
