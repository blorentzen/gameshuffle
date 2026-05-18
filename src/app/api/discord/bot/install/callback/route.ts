/**
 * GET /api/discord/bot/install/callback
 *
 * Discord redirects here after the streamer authorizes the bot into
 * their server. We:
 *   1. Verify the CSRF state cookie matches what Discord echoed back.
 *   2. Exchange the code for an access token (Discord OAuth2 token
 *      endpoint). This also returns the `guild` payload — that's how
 *      we know which server the bot landed in.
 *   3. Persist `discord_guild_id` + `discord_guild_name` on the
 *      streamer's users row.
 *   4. Redirect back to Account → Integrations with a success flash.
 *
 * The streamer still needs to pick a channel (and optional ping role)
 * after install — that happens via separate API calls from the
 * ConnectionsCard UI.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const STATE_COOKIE = "gs-discord-install-state";
const DISCORD_TOKEN_URL = "https://discord.com/api/v10/oauth2/token";

function appBaseUrl(): string {
  const env = process.env.NEXT_PUBLIC_BASE_URL;
  if (env) return env.replace(/\/$/, "");
  return "https://www.gameshuffle.co";
}

function failureRedirect(reason: string): NextResponse {
  const url = new URL(`${appBaseUrl()}/account`);
  url.searchParams.set("tab", "integrations");
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

  const redirectUri = `${appBaseUrl()}/api/discord/bot/install/callback`;

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

  // Persist routing on the streamer's users row. Channel + role stay
  // null until the streamer picks them in the Account UI.
  const admin = createServiceClient();
  const { error: updateErr } = await admin
    .from("users")
    .update({
      discord_guild_id: tokenPayload.guild.id,
      discord_guild_name: tokenPayload.guild.name,
    })
    .eq("id", user.id);
  if (updateErr) {
    console.error("[discord-bot-install] users write failed:", updateErr);
    return failureRedirect("db_write_failed");
  }

  const success = new URL(`${appBaseUrl()}/account`);
  success.searchParams.set("tab", "integrations");
  success.searchParams.set("discord_installed", "1");
  const response = NextResponse.redirect(success);
  // Clear the state cookie so a refresh of this URL doesn't re-trigger
  // a code reuse attempt.
  response.cookies.set(STATE_COOKIE, "", { maxAge: 0, path: "/" });
  return response;
}
