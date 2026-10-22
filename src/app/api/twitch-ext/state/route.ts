/**
 * GET /api/twitch-ext/state?channel=<Twitch channel id> → what's running on that
 * channel right now (src/lib/twitch/extension/state.ts publicState): public,
 * the same for every viewer and the same things the overlay and /live show,
 * so it needs no token and the CDN keeps it for two seconds.
 */

import { extChannel } from "@/lib/twitch/extension/context";
import { extJson, extPreflight } from "@/lib/twitch/extension/http";
import { publicState } from "@/lib/twitch/extension/state";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const channel = new URL(req.url).searchParams.get("channel") ?? "";
  if (!/^\d{1,20}$/.test(channel)) return extJson(req, { ok: false, error: "bad_channel" }, 400);
  const state = await publicState(await extChannel(channel));
  return extJson(req, { ok: true, state }, 200, { "Cache-Control": "public, max-age=0, s-maxage=2, stale-while-revalidate=2" });
}

export const OPTIONS = extPreflight;
