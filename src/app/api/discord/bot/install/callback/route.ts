/**
 * GET /api/discord/bot/install/callback
 *
 * Discord redirects here after the streamer authorizes the bot into
 * their server. We:
 *   1. Verify the CSRF state cookie matches what Discord echoed back.
 *   2. Exchange the code for an access token (Discord OAuth2 token
 *      endpoint). This also returns the `guild` payload — that's how
 *      we know which server the bot landed in.
 *   3. Add the server to the account (discord_guilds via addGuild): a
 *      server another account has is refused, and so is a new server past
 *      the plan's limit. Reinstalling into a connected server refreshes it.
 *   4. Redirect back to Account → Integrations with a success flash.
 *
 * The streamer still needs to pick a channel (and optional ping role)
 * after install — that happens via separate API calls from the
 * ConnectionsCard UI.
 */

import { NextResponse } from "next/server";
import { getBaseUrl } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { addGuild } from "@/lib/discord/guilds";

export const runtime = "nodejs";

const STATE_COOKIE = "gs-discord-install-state";
const DISCORD_TOKEN_URL = "https://discord.com/api/v10/oauth2/token";

function appBaseUrl(): string {
  // Env-pinned base, else the deployment URL, never a hardcoded prod fallback
  // (a preview must not redirect the install flow into production).
  return getBaseUrl();
}

function failureRedirect(reason: string): NextResponse {
  const url = new URL(`${appBaseUrl()}/account/streaming`);
  url.searchParams.set("tab", "discord");
  url.searchParams.set("discord_install_error", reason);
  return NextResponse.redirect(url);
}

interface DiscordTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
  /** Only present on the bot install flow — Discord includes the guild
   *  the user authorized the install for. */
  guild?: {
    id: string;
    name: string;
  };
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return failureRedirect("unauthenticated");
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const incomingState = url.searchParams.get("state");
  const discordError = url.searchParams.get("error");
  if (discordError) {
    // Streamer hit "Cancel" on the consent screen, or scope is wrong.
    return failureRedirect(discordError);
  }
  if (!code || !incomingState) {
    return failureRedirect("missing_code_or_state");
  }

  const cookieState = request.headers
    .get("cookie")
    ?.split("; ")
    .find((c) => c.startsWith(`${STATE_COOKIE}=`))
    ?.slice(STATE_COOKIE.length + 1);
  if (!cookieState || cookieState !== incomingState) {
    return failureRedirect("state_mismatch");
  }

  const clientId = process.env.DISCORD_APPLICATION_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.error(
      "[discord-bot-install] missing DISCORD_APPLICATION_ID or DISCORD_CLIENT_SECRET",
    );
    return failureRedirect("server_misconfigured");
  }

  // Must equal the one the start route sent: both come from the request host (www on production).
  const redirectUri = `${new URL(request.url).origin}/api/discord/bot/install/callback`;

  // Exchange the code. Discord returns `guild` because we passed
  // `scope=bot` — that's the server the user just authorized.
  let tokenPayload: DiscordTokenResponse;
  try {
    const res = await fetch(DISCORD_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }).toString(),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(
        `[discord-bot-install] token exchange failed (${res.status}): ${body}`,
      );
      return failureRedirect("token_exchange_failed");
    }
    tokenPayload = (await res.json()) as DiscordTokenResponse;
  } catch (err) {
    console.error("[discord-bot-install] token exchange threw:", err);
    return failureRedirect("token_exchange_threw");
  }

  if (!tokenPayload.guild?.id) {
    // Bot scope without guild means the user didn't actually install
    // the bot — they only authorized the OAuth grant. Treat as failure.
    return failureRedirect("no_guild_installed");
  }

  // One row per server (discord_guilds): refuses a server another account
  // has, and a new server past the plan's limit (1 free, 5 with GS Pro).
  const added = await addGuild(user.id, tokenPayload.guild.id, tokenPayload.guild.name);
  if (!added.ok) return failureRedirect(added.error);

  const success = new URL(`${appBaseUrl()}/account/streaming`);
  success.searchParams.set("tab", "discord");
  success.searchParams.set("discord_installed", added.added ? "1" : "again");
  success.searchParams.set("guild", added.guild.guildId);
  const response = NextResponse.redirect(success);
  // Clear the state cookie so a refresh of this URL doesn't re-trigger
  // a code reuse attempt.
  response.cookies.set(STATE_COOKIE, "", { maxAge: 0, path: "/" });
  return response;
}
