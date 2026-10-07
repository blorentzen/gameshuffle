/**
 * Discord sign-in for the Activity (server only).
 *
 * The page asks the Discord client for an authorization code
 * (commands.authorize, scope `identify`); we trade it for an access token with
 * the app's client secret, then ask Discord who that token belongs to. The
 * page never tells us who it is: the user id comes from Discord's
 * /users/@me answer.
 *
 * Which Discord app: production by default. Set DISCORD_ACTIVITY_APP=dev
 * locally to use the dev app (DEV_DISCORD_*), so the Activity can be tested
 * through a tunnel without touching the production app's settings.
 */

import "server-only";

const API = "https://discord.com/api/v10";

export function activityApp(): { clientId: string; clientSecret: string } | null {
  const dev = process.env.DISCORD_ACTIVITY_APP === "dev";
  const clientId = dev ? process.env.DEV_DISCORD_APPLICATION_ID : process.env.DISCORD_APPLICATION_ID;
  const clientSecret = dev ? process.env.DEV_DISCORD_CLIENT_SECRET : process.env.DISCORD_CLIENT_SECRET;
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export interface DiscordMe { id: string; username: string; global_name: string | null; avatar: string | null }

export type ExchangeResult = { ok: true; accessToken: string; me: DiscordMe } | { ok: false; error: "not_configured" | "bad_code" | "discord_unavailable" };

export async function exchangeCode(code: string): Promise<ExchangeResult> {
  const app = activityApp();
  if (!app) return { ok: false, error: "not_configured" };
  const tokenRes = await fetch(`${API}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: app.clientId, client_secret: app.clientSecret, grant_type: "authorization_code", code }),
  }).catch(() => null);
  if (!tokenRes) return { ok: false, error: "discord_unavailable" };
  if (!tokenRes.ok) {
    console.warn("[activity] token exchange failed:", tokenRes.status);
    return { ok: false, error: tokenRes.status >= 500 ? "discord_unavailable" : "bad_code" };
  }
  const token = (await tokenRes.json().catch(() => null)) as { access_token?: string } | null;
  if (!token?.access_token) return { ok: false, error: "bad_code" };
  const meRes = await fetch(`${API}/users/@me`, { headers: { Authorization: `Bearer ${token.access_token}` } }).catch(() => null);
  if (!meRes?.ok) return { ok: false, error: "discord_unavailable" };
  const me = (await meRes.json().catch(() => null)) as DiscordMe | null;
  if (!me?.id) return { ok: false, error: "discord_unavailable" };
  return { ok: true, accessToken: token.access_token, me };
}
