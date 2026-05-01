import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

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
  "/randomizers/",
  "/competitive/",
  "/tournament",
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

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const redirect = safeRedirect(searchParams.get("redirect"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Sync OAuth profile data to public.users
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await syncProfileFromOAuth(supabase, user);

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
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}

async function syncProfileFromOAuth(supabase: any, user: any) {
  const identities = user.identities || [];
  const discordIdentity = identities.find((i: any) => i.provider === "discord");
  const twitchIdentity = identities.find((i: any) => i.provider === "twitch");

  // Nothing to sync if no OAuth providers linked
  if (!discordIdentity && !twitchIdentity) return;

  const { data: existing } = await supabase
    .from("users")
    .select("display_name, gamertags")
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
}
