/**
 * GET /api/twitch-ext/dev-token?channel=&user=&role= (development only): a
 * token signed with the local secret, so the extension's local stand-in for
 * Twitch can play against the dev server. `user` = a Twitch user id to act as
 * one who shared their id; leave it out for an anonymous viewer.
 */

import { signExtToken } from "@/lib/twitch/extension/jwt";
import { extJson, extPreflight } from "@/lib/twitch/extension/http";

export const runtime = "nodejs";

export async function GET(req: Request) {
  if (process.env.NODE_ENV !== "development") return extJson(req, { ok: false, error: "not_found" }, 404);
  const q = new URL(req.url).searchParams;
  const channel = q.get("channel") ?? "";
  const user = q.get("user") ?? "";
  const role = ["broadcaster", "moderator", "viewer"].includes(q.get("role") ?? "") ? q.get("role") : "viewer";
  if (!/^\d{1,20}$/.test(channel) || (user && !/^\d{1,20}$/.test(user))) return extJson(req, { ok: false, error: "bad_request" }, 400);
  const token = signExtToken({
    exp: Math.floor(Date.now() / 1000) + 3600,
    channel_id: channel,
    opaque_user_id: user ? `U${user}` : "ATESTVIEWER",
    ...(user ? { user_id: user } : {}),
    role,
    pubsub_perms: { listen: ["broadcast"] },
  });
  return extJson(req, { ok: true, token, channelId: channel, clientId: "local-dev", userId: user ? `U${user}` : "ATESTVIEWER" });
}

export const OPTIONS = extPreflight;
