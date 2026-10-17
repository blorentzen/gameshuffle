/**
 * Help bought with tokens at the last chance, for a signed-in account
 * (src/lib/daily/help.ts).
 *   GET  ?game=dex → { signedIn, ready, balance, prices, help, lettersLeft } for today
 *   POST { game, kind: "letter" | "guess" } → buys one: { ok, help, balance } or { ok: false, error }
 * Signed out → { signedIn: false } (guests have no wallet; the page offers an account).
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ensureAccountWallet } from "@/lib/economy/accountWallet";
import { buyHelp, helpState } from "@/lib/daily/help";
import { hasFinished } from "@/lib/daily/results";
import { SHUFFLE, dayKey } from "@/lib/originals/daily";
import { DEX } from "@/lib/originals/dailyDex";

export const runtime = "nodejs";
const NO_STORE = { "Cache-Control": "private, no-store" };
const gameOf = (v: unknown) => (v === "dex" ? DEX : SHUFFLE);

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ signedIn: false }, { headers: NO_STORE });
  const wallet = (await ensureAccountWallet(user.id))?.identityId ?? null;
  const state = await helpState(`u:${user.id}`, wallet, gameOf(new URL(req.url).searchParams.get("game")));
  return NextResponse.json({ signedIn: true, ...state }, { headers: NO_STORE });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { game?: unknown; kind?: unknown } | null;
  const kind = body?.kind === "guess" ? "guess" : body?.kind === "letter" ? "letter" : null;
  if (!kind) return NextResponse.json({ ok: false, error: "bad_kind" }, { status: 400 });
  const game = gameOf(body?.game);
  const wallet = (await ensureAccountWallet(user.id))?.identityId ?? null;
  const finished = await hasFinished({ userId: user.id }, dayKey(), game);
  return NextResponse.json(await buyHelp({ player: `u:${user.id}`, wallet, game, kind, finished }), { headers: NO_STORE });
}
