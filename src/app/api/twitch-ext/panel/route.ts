/**
 * GET /api/twitch-ext/panel?channel=<Twitch channel id> → the panel under the
 * stream: the channel's leaderboard, the next scheduled stream and last
 * stream's recap. Public (shows offline too); the CDN keeps it 30 seconds.
 */

import { extChannel } from "@/lib/twitch/extension/context";
import { extJson, extPreflight } from "@/lib/twitch/extension/http";
import { panelState } from "@/lib/twitch/extension/state";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const channel = new URL(req.url).searchParams.get("channel") ?? "";
  if (!/^\d{1,20}$/.test(channel)) return extJson(req, { ok: false, error: "bad_channel" }, 400);
  const panel = await panelState(await extChannel(channel));
  return extJson(req, { ok: true, panel }, 200, { "Cache-Control": "public, max-age=0, s-maxage=30, stale-while-revalidate=30" });
}

export const OPTIONS = extPreflight;
