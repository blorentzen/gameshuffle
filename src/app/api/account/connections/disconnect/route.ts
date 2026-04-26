/**
 * POST /api/account/connections/disconnect
 *
 * Body: { provider: "discord" | "twitch" }
 *
 * Unified disconnect endpoint for the Profile-tab Connections card.
 * Per gs-connections-architecture.md §4.2 — replaces the older
 * `/api/account/sign-in/unlink` shape with a provider-keyed call that
 * also tears down the streamer-scope integration when disconnecting Twitch.
 *
 * Order of operations matters: Twitch streamer teardown FIRST (needs the
 * encrypted access token to revoke + delete EventSub subs + remove the
 * channel point reward), THEN identity removal. If the auth identity
 * went first, the user could end up with orphaned Twitch infrastructure
 * we can't clean up because the user-facing OAuth path is gone.
 *
 * Returns:
 *   200 { ok: true }
 *   400 { error: 'invalid_provider' }
 *   401 { error: 'unauthenticated' }
 *   404 { error: 'identity_not_found' }
 *   422 { error: 'last_sign_in_method', message: string }
 *   500 { error: 'disconnect_failed' }
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { disconnectTwitchIntegration } from "@/lib/twitch/disconnect";
import { ALL_CONNECTION_PROVIDERS, type ConnectionProvider } from "@/lib/connections";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const provider = body.provider as ConnectionProvider | undefined;
  if (!provider || !ALL_CONNECTION_PROVIDERS.includes(provider)) {
    return NextResponse.json({ error: "invalid_provider" }, { status: 400 });
  }

  const admin = createServiceClient();
  const { data: adminView, error: adminErr } = await admin.auth.admin.getUserById(user.id);
  if (adminErr || !adminView?.user) {
    console.error("[connections/disconnect] admin lookup failed:", adminErr);
    return NextResponse.json({ error: "lookup_failed" }, { status: 500 });
  }
  const adminUser = adminView.user;
  const identities = adminUser.identities ?? [];
  const target = identities.find((i) => i.provider === provider);
  if (!target) {
    return NextResponse.json({ error: "identity_not_found" }, { status: 404 });
  }

  // Safety check: user retains at least one sign-in path after this.
  const providers = Array.isArray(adminUser.app_metadata?.providers)
    ? (adminUser.app_metadata!.providers as string[])
    : [];
  const hasPassword = providers.includes("email");
  const otherOauthExists = identities.some(
    (i) => i.provider !== provider && i.id !== target.id
  );
  if (!hasPassword && !otherOauthExists) {
    return NextResponse.json(
      {
        error: "last_sign_in_method",
        message:
          "This is your only sign-in method. Set a password or link another provider before disconnecting.",
      },
      { status: 422 }
    );
  }

  // Streamer-scope teardown FIRST (only Twitch has one today).
  if (provider === "twitch") {
    try {
      await disconnectTwitchIntegration(user.id);
    } catch (err) {
      // Don't abort on teardown failure — the user's clear intent is
      // "disconnect me." We log and continue, leaving any orphaned
      // EventSub subs to be cleaned up by the next subscription audit.
      console.error("[connections/disconnect] Twitch streamer teardown failed:", err);
    }
  }

  // Auto-reset avatar source per gs-avatars-spec.md §6.4 — if the user
  // was rendering this provider's avatar, fall back to DiceBear so they
  // don't end up with a broken image after disconnect.
  try {
    const { data: userRow } = await admin
      .from("users")
      .select("avatar_source")
      .eq("id", user.id)
      .maybeSingle();
    if (userRow?.avatar_source === provider) {
      const update: Record<string, unknown> = {
        avatar_source: "dicebear",
        updated_at: new Date().toISOString(),
      };
      // Also clear the now-stale URL.
      if (provider === "twitch") update.twitch_avatar = null;
      if (provider === "discord") update.discord_avatar = null;
      await admin.from("users").update(update).eq("id", user.id);
    } else {
      // Even if avatar_source wasn't set to this provider, clear the URL
      // so a future picker doesn't show a stale option for an unlinked
      // account.
      const clear: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (provider === "twitch") clear.twitch_avatar = null;
      if (provider === "discord") clear.discord_avatar = null;
      await admin.from("users").update(clear).eq("id", user.id);
    }
  } catch (err) {
    console.warn("[connections/disconnect] avatar cleanup failed (non-fatal):", err);
  }

  // Direct delete on auth.identities — bypasses GoTrue's strict rule.
  const { error: deleteErr } = await admin
    .schema("auth")
    .from("identities")
    .delete()
    .eq("id", target.id);
  if (deleteErr) {
    console.error("[connections/disconnect] identity delete failed:", deleteErr);
    return NextResponse.json({ error: "disconnect_failed" }, { status: 500 });
  }

  // Sync app_metadata.providers so subsequent reads reflect the new state.
  const newProviders = providers.filter((p) => p !== provider);
  try {
    await admin.auth.admin.updateUserById(user.id, {
      app_metadata: { ...adminUser.app_metadata, providers: newProviders },
    });
  } catch (err) {
    console.warn("[connections/disconnect] provider metadata sync failed:", err);
  }

  return NextResponse.json({ ok: true });
}
