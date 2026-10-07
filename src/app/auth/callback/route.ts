import { createClient } from "@/lib/supabase/server";
import { mergeIdentityAcrossSurfaces } from "@/lib/identity/merge";
import { ensureUsername } from "@/lib/social/usernameAssign";
import { NextResponse } from "next/server";
import { offerGuestClaims } from "@/lib/tournaments/claims";
import { describeAuthError } from "@/lib/auth/errors";
import { reportAuthError } from "@/lib/auth/report";

/**
 * Allowlist for the `?redirect=` param. Phase B introduced live-view
 * sign-in flows that pass `redirect=/live/[slug]`, which expanded the
 * surface area for path-based open-redirect attacks. Restricting to
 * known-good prefixes keeps the existing flows working while preventing
 * a malicious URL from bouncing users to a forged in-product path.
 *
 * External redirects (e.g. https://evil.com) were already prevented by
 * the `${origin}${redirect}` concatenation; this allowlist guards the
 * remaining path-based vectors.
 */
const ALLOWED_REDIRECT_PREFIXES = [
  "/account",
  "/hub",
  "/live/",
  "/signup",
  "/reset-password",
  "/randomizers/",
  "/competitive/",
  "/tournament",
  "/claim",
  "/party",
  // Mod invites send people back to their invite after signing in; without
  // this they were dropped on /account instead.
  "/mod/invite/",
  // Signing up from the Discord Activity: its join page (signing in first to
  // connect Discord) and the "head back to Discord" page it ends on.
  "/discord/join",
  "/discord/joined",
];

function safeRedirect(raw: string | null): string {
  if (!raw) return "/account";
  // Reject anything that looks like an absolute URL or protocol-relative.
  if (raw.startsWith("//") || raw.includes("://")) return "/account";
  if (!raw.startsWith("/")) return "/account";
  // Allow exact matches or matches with a path suffix on the prefix.
  for (const prefix of ALLOWED_REDIRECT_PREFIXES) {
    if (raw === prefix) return raw;
    if (prefix.endsWith("/") && raw.startsWith(prefix)) return raw;
    if (!prefix.endsWith("/") && (raw === prefix || raw.startsWith(`${prefix}/`) || raw.startsWith(`${prefix}?`))) {
      return raw;
    }
  }
  return "/account";
}

/**
 * Where a failed sign-in lands, with the reason attached (`?auth_error=`) for
 * AuthErrorNotice. Connecting an account from /account goes back there;
 * everything else goes to /login, keeping the original destination.
 */
function failureUrl(origin: string, redirect: string, code: string, explicit: boolean): string {
  // Only an explicit /account destination (the Connect button) goes back there;
  // the default would bounce a signed-out person to /login and lose the reason.
  if (explicit && redirect.startsWith("/account")) {
    const u = new URL(redirect, origin);
    u.searchParams.set("auth_error", code);
    return u.toString();
  }
  const u = new URL("/login", origin);
  u.searchParams.set("auth_error", code);
  if (redirect !== "/account") u.searchParams.set("redirect", redirect);
  return u.toString();
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const redirect = safeRedirect(searchParams.get("redirect"));
  const explicitRedirect = searchParams.has("redirect");

  // Supabase sends provider and flow failures back here as error params
  // instead of a code. Keep the reason: log it, report it, show it.
  if (!code) {
    const friendly = describeAuthError({
      code: searchParams.get("error_code"),
      error: searchParams.get("error"),
      message: searchParams.get("error_description"),
    });
    console.error("[auth/callback] sign-in failed:", friendly.code, searchParams.get("error_description") ?? searchParams.get("error") ?? "(no code, no error)");
    reportAuthError(friendly, { surface: "callback", detail: searchParams.get("error_description") });
    return NextResponse.redirect(failureUrl(origin, redirect, friendly.code, explicitRedirect));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    const friendly = describeAuthError({ code: error.code, message: error.message });
    console.error("[auth/callback] code exchange failed:", friendly.code, error.message);
    reportAuthError(friendly, { surface: "callback:exchange", detail: error.message });
    return NextResponse.redirect(failureUrl(origin, redirect, friendly.code, explicitRedirect));
  }
  // Sync OAuth profile data to public.users
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    await syncProfileFromOAuth(supabase, user);

    // Guest entries saved under this (verified) address get offered, never
    // linked silently (spec F). Skipped when the user is already on their
    // way to a claim link, which offers the same entry itself.
    if (user.email && user.email_confirmed_at && !redirect.startsWith("/claim")) {
      await offerGuestClaims(user.id, user.email).catch((err) => console.error("[auth/callback] claim offer failed:", err));
    }

    // Per gs-connections-architecture.md §5 — OAuth-only signups must
    // set a password before landing on the rest of the app. If this
    // user has no `email` provider on app_metadata.providers, route
    // them through /signup/set-password and forward the original
    // `redirect` as `return_to` so they land where they intended
    // after completing the step.
    const providers = Array.isArray(user.app_metadata?.providers)
      ? (user.app_metadata.providers as string[])
      : [];
    const hasPassword = providers.length === 0 || providers.includes("email");
    if (!hasPassword) {
      const setPasswordUrl = new URL("/signup/set-password", request.url);
      setPasswordUrl.searchParams.set("return_to", redirect);
      return NextResponse.redirect(setPasswordUrl);
    }
  }
  return NextResponse.redirect(`${origin}${redirect}`);
}

async function syncProfileFromOAuth(supabase: any, user: any) {
  const identities = user.identities || [];
  const discordIdentity = identities.find((i: any) => i.provider === "discord");
  const twitchIdentity = identities.find((i: any) => i.provider === "twitch");

  // Nothing to sync if no OAuth providers linked
  if (!discordIdentity && !twitchIdentity) return;

  const { data: existing } = await supabase
    .from("users")
    .select("display_name, gamertags, discord_id, twitch_id")
    .eq("id", user.id)
    .single();

  const updates: Record<string, any> = {};
  const gamertags = { ...(existing?.gamertags || {}) };

  // Set display name if not already set (prefer Discord, then Twitch)
  if (!existing?.display_name) {
    const meta = discordIdentity?.identity_data || twitchIdentity?.identity_data || {};
    updates.display_name = meta.full_name || meta.custom_claims?.global_name || meta.name || null;
  }

  // Sync Discord
  if (discordIdentity) {
    const d = discordIdentity.identity_data || {};
    updates.discord_id = d.provider_id || d.sub || discordIdentity.id || null;
    updates.discord_username = d.preferred_username || d.name || null;
    updates.discord_avatar = d.avatar_url || null;
    if (updates.discord_username && !gamertags.discord) {
      gamertags.discord = updates.discord_username;
    }
  }

  // Sync Twitch
  if (twitchIdentity) {
    const t = twitchIdentity.identity_data || {};
    updates.twitch_id = t.provider_id || t.sub || twitchIdentity.id || null;
    updates.twitch_username = t.preferred_username || t.name || null;
    updates.twitch_avatar = t.avatar_url || t.picture || null;
    if (updates.twitch_username && !gamertags.twitch) {
      gamertags.twitch = updates.twitch_username;
    }
  }

  // Only update gamertags if we added something
  if (gamertags.discord || gamertags.twitch) {
    updates.gamertags = { ...(existing?.gamertags || {}), ...gamertags };
  }

  if (Object.keys(updates).length > 0) {
    await supabase.from("users").update(updates).eq("id", user.id);
  }

  // Auto-assign a handle if they don't have one yet, so every account is
  // addressable + discoverable. No-op once a username exists.
  try {
    await ensureUsername(user.id, {
      discord: updates.discord_username ?? null,
      twitch: updates.twitch_username ?? null,
      displayName: updates.display_name ?? existing?.display_name ?? null,
      email: user.email ?? null,
    });
  } catch (err) {
    console.error("[auth/callback] username auto-assign failed:", err);
  }

  // Cross-surface identity merge — rebinds any ghost prequeue rows
  // and pending mod rows that were waiting for this Discord/Twitch
  // identity to surface. Idempotent + cheap, so we call it on every
  // OAuth callback (sign-in, sign-up, provider-link) without trying
  // to detect "is this the first time."
  try {
    // Use the freshly-synced id when available; fall back to the
    // existing column so a returning user with no provider-data change
    // still sweeps any ghost rows that landed since their last sign-in.
    await mergeIdentityAcrossSurfaces({
      gsUserId: user.id,
      discordUserId: updates.discord_id ?? existing?.discord_id ?? null,
      twitchUserId: updates.twitch_id ?? existing?.twitch_id ?? null,
    });
  } catch (err) {
    // Merge failure is non-fatal — the user lands successfully and
    // can re-trigger by signing out + back in. Logging only.
    console.error("[auth/callback] identity merge failed:", err);
  }
}
