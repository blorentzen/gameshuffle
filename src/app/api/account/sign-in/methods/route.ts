/**
 * GET /api/account/sign-in/methods
 *
 * Returns a snapshot of the authenticated user's sign-in methods.
 * Supabase's `user.identities` only lists OAuth provider rows — it
 * omits email+password state — so we combine what the client can see
 * (identities) with what the admin API sees (app_metadata.providers,
 * which includes `email` when a password is set).
 *
 * Response shape:
 *   {
 *     ok: true,
 *     methods: {
 *       password: { hasPassword: boolean, email: string | null },
 *       providers: [
 *         { id: string, provider: 'twitch' | 'discord' | string,
 *           displayName: string | null, linked: true }
 *       ]
 *     }
 *   }
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

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const admin = getAdmin();
  const { data: adminView, error: adminErr } = await admin.auth.admin.getUserById(user.id);
  if (adminErr || !adminView?.user) {
    console.error("[sign-in-methods] admin lookup failed:", adminErr);
    return NextResponse.json({ error: "lookup_failed" }, { status: 500 });
  }
  const adminUser = adminView.user;

  // Supabase records every provider the user has ever authenticated
  // through on `app_metadata.providers`. Password sign-in registers as
  // `email` there, which is our reliable "has password" signal — the
  // encrypted_password field isn't exposed via the JS admin API.
  const providers = Array.isArray(adminUser.app_metadata?.providers)
    ? (adminUser.app_metadata!.providers as string[])
    : [];
  const hasPassword = providers.includes("email");

  const identities = (adminUser.identities ?? []).map((identity) => ({
    id: identity.id,
    identity_id: identity.identity_id ?? identity.id,
    provider: identity.provider,
    displayName:
      (identity.identity_data?.preferred_username as string | undefined) ||
      (identity.identity_data?.full_name as string | undefined) ||
      (identity.identity_data?.name as string | undefined) ||
      null,
    linked: true as const,
  }));

  return NextResponse.json({
    ok: true,
    methods: {
      password: {
        hasPassword,
        email: adminUser.email ?? null,
      },
      providers: identities,
    },
  });
}
