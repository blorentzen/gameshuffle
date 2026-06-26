/**
 * GET /api/economy/balance → the signed-in viewer's token balance.
 *
 * Read-only on purpose: resolves the viewer's *existing* Twitch identity via
 * getIdentityByPlatform (NOT resolveIdentity) so a passive balance check never
 * lazily creates an identity or fires a starting grant — that only happens on
 * a real interaction (bet, chat command). Balance is the Twitch identity's
 * wallet, matching what the viewer bets with on /live.
 *
 * Always 200 with a discriminated shape so a UI badge can render without
 * treating "not signed in" / "not yet activated" as errors:
 *   { signedIn: false }                      — no session
 *   { signedIn: true, activated: false }     — signed in, no GS identity yet
 *   { signedIn: true, activated: true, balance, identityId }
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getIdentityByPlatform } from "@/lib/economy/identity";
import { getBalance } from "@/lib/economy/tokens";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: true, signedIn: false, balance: null });
  }

  const twitch = (user.identities ?? []).find((i) => i.provider === "twitch");
  const twitchId =
    (twitch?.identity_data?.sub as string | undefined) ??
    (twitch?.identity_data?.provider_id as string | undefined) ??
    null;
  if (!twitchId) {
    return NextResponse.json({ ok: true, signedIn: true, activated: false, balance: null });
  }

  const identity = await getIdentityByPlatform("twitch", twitchId);
  if (!identity) {
    return NextResponse.json({ ok: true, signedIn: true, activated: false, balance: null });
  }

  const balance = await getBalance(identity.id);
  return NextResponse.json({
    ok: true,
    signedIn: true,
    activated: true,
    balance,
    identityId: identity.id,
  });
}
