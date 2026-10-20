/**
 * GET /api/twitch-ext/me (Authorization: Bearer <Twitch extension token>) → the
 * viewer's own part of what's running: tokens, their vote, bingo card,
 * answers, captain turn, ballot. A viewer who hasn't shared their Twitch id
 * gets { shared: false } (they can watch; playing asks them to share).
 */

import { claimsFrom } from "@/lib/twitch/extension/jwt";
import { extChannel } from "@/lib/twitch/extension/context";
import { extViewer } from "@/lib/twitch/extension/viewer";
import { extJson, extPreflight } from "@/lib/twitch/extension/http";
import { myState, publicState } from "@/lib/twitch/extension/state";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const claims = claimsFrom(req);
  if (!claims) return extJson(req, { ok: false, error: "bad_token" }, 401);
  const viewer = await extViewer(claims);
  if (!viewer) return extJson(req, { ok: true, shared: false, role: claims.role });
  const ch = await extChannel(claims.channel_id);
  const me = await myState(ch, viewer, await publicState(ch));
  return extJson(req, { ok: true, shared: true, role: claims.role, me });
}

export const OPTIONS = extPreflight;
