/**
 * Help bought with tokens at the last chance, inside the Discord Activity
 * (Bearer session): paid from the wallet the player's Discord identity uses
 * (its own, or the account it signs in to). Same shapes as /api/daily/help.
 */

import { NextResponse } from "next/server";
import { sessionFrom } from "@/lib/activity/session";
import { walletIdentityFor } from "@/lib/economy/accountWallet";
import { buyHelp, helpState } from "@/lib/daily/help";
import { hasFinished } from "@/lib/daily/results";
import { SHUFFLE, dayKey } from "@/lib/originals/daily";
import { DEX } from "@/lib/originals/dailyDex";

export const runtime = "nodejs";
const NO_STORE = { "Cache-Control": "private, no-store" };
const gameOf = (v: unknown) => (v === "dex" ? DEX : SHUFFLE);

export async function GET(req: Request) {
  const s = sessionFrom(req);
  if (!s) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const wallet = await walletIdentityFor(s.iid).catch(() => s.iid);
  const state = await helpState(`i:${s.iid}`, wallet, gameOf(new URL(req.url).searchParams.get("game")));
  return NextResponse.json({ signedIn: true, ...state }, { headers: NO_STORE });
}

export async function POST(req: Request) {
  const s = sessionFrom(req);
  if (!s) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { game?: unknown; kind?: unknown } | null;
  const kind = body?.kind === "guess" ? "guess" : body?.kind === "letter" ? "letter" : null;
  if (!kind) return NextResponse.json({ ok: false, error: "bad_kind" }, { status: 400 });
  const game = gameOf(body?.game);
  const wallet = await walletIdentityFor(s.iid).catch(() => s.iid);
  const finished = await hasFinished({ identityId: s.iid, userId: s.uid }, dayKey(), game);
  return NextResponse.json(await buyHelp({ player: `i:${s.iid}`, wallet, game, kind, finished }), { headers: NO_STORE });
}
