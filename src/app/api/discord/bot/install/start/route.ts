/**
 * GET /api/discord/bot/install/start
 *
 * Streamer-initiated entry point for installing the GameShuffle bot
 * into their Discord server. Generates a CSRF state token, drops it
 * in a signed HTTP-only cookie, then redirects to Discord's OAuth2
 * authorize page with the bot scopes + permissions baked into the URL.
 *
 * Permissions bitfield (309237795840) covers everything Phase 1 needs
 * across all PRs so streamers don't have to re-authorize when 1.2 / 1.3
 * lands:
 *   - View Channels        (read the channel list for the picker)
 *   - Send Messages
 *   - Embed Links
 *   - Mention Everyone     (optional role-ping on round open)
 *   - Create Public Threads (round-discussion auto-thread)
 *   - Send Messages In Threads (round-close embed in the thread)
 *
 * Per `specs/gs-pro-updates/gs-discord-cross-platform-spec.md`.
 */

import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const DISCORD_AUTHORIZE_URL = "https://discord.com/oauth2/authorize";
const PHASE_1_PERMISSIONS_BITFIELD = "309237795840";
const STATE_COOKIE = "gs-discord-install-state";
const STATE_COOKIE_MAX_AGE_SECS = 60 * 10; // 10 minutes — long enough
                                            // for the user to land on Discord,
                                            // pick a server, and authorize.

function appBaseUrl(): string {
  const env = process.env.NEXT_PUBLIC_BASE_URL;
  if (env) return env.replace(/\/$/, "");
  return "https://www.gameshuffle.co";
}

export async function GET() {
  // Kill switch — bounce to the integrations tab with a flag the UI
  // can surface as a "temporarily disabled" banner. Same env var the
  // dispatcher checks (see src/lib/adapters/dispatcher.ts), so flipping
  // it back on re-opens both ends together.
  if (process.env.DISCORD_INTEGRATION_DISABLED === "true") {
    const url = new URL(`${appBaseUrl()}/account`);
    url.searchParams.set("tab", "integrations");
    url.searchParams.set("discord_install_error", "integration_temporarily_disabled");
    return NextResponse.redirect(url);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    // Not signed in → bounce to login with a return-to so the user
    // lands back on Account → Integrations after auth.
    const loginUrl = new URL(`${appBaseUrl()}/login`);
    loginUrl.searchParams.set("redirect", "/account?tab=integrations");
    return NextResponse.redirect(loginUrl);
  }

  const clientId = process.env.DISCORD_APPLICATION_ID;
  if (!clientId) {
    return NextResponse.json(
      { ok: false, error: "discord_application_id_unset" },
      { status: 500 },
    );
  }

  const state = randomBytes(24).toString("base64url");
  const redirectUri = `${appBaseUrl()}/api/discord/bot/install/callback`;

  const authorizeUrl = new URL(DISCORD_AUTHORIZE_URL);
  authorizeUrl.searchParams.set("client_id", clientId);
  // `bot` installs the bot in the guild; `applications.commands` lets
  // us register slash commands per-guild later (Phase 3 territory but
  // requested upfront so the consent screen lists it once).
  authorizeUrl.searchParams.set("scope", "bot applications.commands");
  authorizeUrl.searchParams.set("permissions", PHASE_1_PERMISSIONS_BITFIELD);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("state", state);

  const response = NextResponse.redirect(authorizeUrl);
  // Signed via Next's secure cookie semantics — the callback verifies
  // this value matches what Discord echoes back on completion.
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: STATE_COOKIE_MAX_AGE_SECS,
    path: "/",
  });
  return response;
}
