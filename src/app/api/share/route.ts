/**
 * POST /api/share { kind, shuffle?, dex?, fireRun? } → { code, url, version, alt }: makes (or
 * refreshes) this player's share card (src/lib/share/store.ts). The player is the signed-in
 * account, else the browser's daily guest (x-daily-guest, hashed). Errors: 400 bad_request /
 * no_result / mismatch, 401 no_player, 503 not_ready (before share-cards-m1).
 */

import { NextResponse } from "next/server";
import { firePlayer, ipOf } from "@/lib/fireRound/player";
import { playerKey } from "@/lib/daily/boardRules";
import { rateLimit } from "@/lib/ratelimit";
import { makeShare } from "@/lib/share/store";
import { SITE_URL } from "@/lib/seo";
import type { ShareRequest } from "@/lib/share/types";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const player = await firePlayer(req);
  if (!player) return NextResponse.json({ error: "no_player" }, { status: 401 });
  const limited = await rateLimit(`share:${ipOf(req)}`, { max: 30, windowMs: 60_000 });
  if (!limited.ok) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const body = (await req.json().catch(() => null)) as ShareRequest | null;
  if (!body || typeof body.kind !== "string") return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const made = await makeShare(playerKey(player.kind, player.id), body);
  if (typeof made === "string") return NextResponse.json({ error: made }, { status: made === "not_ready" ? 503 : 400 });
  // The dev server's own links point at itself; production at www.
  const origin = process.env.NODE_ENV === "production" ? SITE_URL : new URL(req.url).origin;
  return NextResponse.json({ ...made, url: `${origin}/r/${made.code}` }, { headers: { "Cache-Control": "private, no-store" } });
}
