/**
 * POST /api/account/sign-in/unlink
 *
 * Body: { identityId: string }
 *
 * Safer counterpart to Supabase's client-side `unlinkIdentity` that
 * respects the UX we want ("you can disconnect Twitch if you've set a
 * password, even if it's your only OAuth provider") rather than
 * GoTrue's strict rule of "len(identities) > 1".
 *
 * Flow:
 *   1. Auth the caller via the regular session.
 *   2. Use admin API to fetch the authoritative user view (identities +
 *      app_metadata.providers).
 *   3. Refuse if removing this identity would leave the user with no
 *      way to sign in at all — i.e. no password AND no other OAuth
 *      identity.
 *   4. Otherwise, delete the identity directly from `auth.identities`
 *      via a signed SQL call and refresh `app_metadata.providers` to
 *      keep it in sync.
 *
 * Returns:
 *   200 { ok: true }                      — identity removed
 *   401 { error: 'unauthenticated' }      — missing session
 *   404 { error: 'identity_not_found' }   — no matching identity on this user
 *   422 { error: 'last_sign_in_method',   — would lock the user out
 *         message: string }
 *   500 { error: 'unlink_failed' }
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminSupabase } from "@supabase/supabase-js";

export const runtime = "nodejs";

function getAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase admin credentials missing");
  return createAdminSupabase(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const identityId = body.identityId as string | undefined;
  if (!identityId || typeof identityId !== "string") {
    return NextResponse.json({ error: "invalid_identity_id" }, { status: 400 });
  }

  const admin = getAdmin();
  const { data: adminView, error: adminErr } = await admin.auth.admin.getUserById(user.id);
  if (adminErr || !adminView?.user) {
    console.error("[sign-in-unlink] admin lookup failed:", adminErr);
    return NextResponse.json({ error: "lookup_failed" }, { status: 500 });
  }
  const adminUser = adminView.user;

  const identities = adminUser.identities ?? [];
  const target = identities.find(
    (i) => i.id === identityId || i.identity_id === identityId
  );
  if (!target) {
    return NextResponse.json({ error: "identity_not_found" }, { status: 404 });
  }

  const providers = Array.isArray(adminUser.app_metadata?.providers)
    ? (adminUser.app_metadata!.providers as string[])
    : [];
  const hasPassword = providers.includes("email");
  const otherOauthCount = identities.filter(
    (i) => i.id !== target.id && i.identity_id !== target.identity_id
  ).length;

  // Require at least one way back in after the unlink.
  if (!hasPassword && otherOauthCount === 0) {
    return NextResponse.json(
      {
        error: "last_sign_in_method",
        message:
          "This is your only sign-in method. Set a password or link another provider first.",
      },
      { status: 422 }
    );
  }

  // Direct delete via PostgREST on the auth schema (service-role only).
  // GoTrue's own endpoint enforces `identities > 1`; bypass by touching
  // the table directly now that we've verified a safe fallback exists.
  const adminAuth = admin.schema("auth");
  const { error: deleteErr } = await adminAuth
    .from("identities")
    .delete()
    .eq("id", target.id);
  if (deleteErr) {
    console.error("[sign-in-unlink] identity delete failed:", deleteErr);
    return NextResponse.json({ error: "unlink_failed" }, { status: 500 });
  }

  // Sync app_metadata.providers so the in-memory user object reflects
  // reality. Non-fatal if this fails — the next session refresh will
  // catch up either way.
  const newProviders = providers.filter((p) => p !== target.provider);
  try {
    await admin.auth.admin.updateUserById(user.id, {
      app_metadata: { ...adminUser.app_metadata, providers: newProviders },
    });
  } catch (err) {
    console.warn("[sign-in-unlink] provider metadata sync failed:", err);
  }

  return NextResponse.json({ ok: true });
}
