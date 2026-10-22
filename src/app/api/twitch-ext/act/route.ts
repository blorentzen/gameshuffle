/**
 * POST /api/twitch-ext/act (Bearer <Twitch extension token>) { kind, … } → a
 * viewer's play: vote, bingo_card, bingo_claim, trivia, break, brain,
 * captain_pick, ballot (src/lib/twitch/extension/act.ts). Needs the viewer's
 * shared Twitch id (403 share_needed otherwise). Rate limited per viewer.
 */

import { claimsFrom } from "@/lib/twitch/extension/jwt";
import { extChannel } from "@/lib/twitch/extension/context";
import { extViewer } from "@/lib/twitch/extension/viewer";
import { extJson, extPreflight } from "@/lib/twitch/extension/http";
import { extAct, parseAction } from "@/lib/twitch/extension/act";
import { rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const claims = claimsFrom(req);
  if (!claims) return extJson(req, { ok: false, error: "bad_token" }, 401);
  const viewer = await extViewer(claims);
  if (!viewer) return extJson(req, { ok: false, error: "share_needed" }, 403);
  const { ok: allowed } = await rateLimit(`twext:${viewer.viewer}`, { max: 20, windowMs: 10_000 });
  if (!allowed) return extJson(req, { ok: false, error: "slow_down" }, 429);
  const action = parseAction(await req.json().catch(() => null));
  if (!action) return extJson(req, { ok: false, error: "bad_request" }, 400);
  const r = await extAct(await extChannel(claims.channel_id), viewer, action);
  return extJson(req, r, r.ok ? 200 : 409);
}

export const OPTIONS = extPreflight;
