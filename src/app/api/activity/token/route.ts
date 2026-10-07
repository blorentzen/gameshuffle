/**
 * POST /api/activity/token  { code }
 *
 * The Discord Activity's sign-in. The page asks Discord for an authorization
 * code, sends it here, and gets back:
 *   accessToken  for the SDK's commands.authenticate
 *   session      our signed session for /api/activity/* (src/lib/activity/session.ts)
 *   user         name, avatar and whether a GameShuffle account signs in with this Discord user
 *   startTab     the game a "Play" button asked for, if one did in the last few minutes
 * Who the person is comes from Discord (/users/@me), never from the page.
 */

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { exchangeCode } from "@/lib/activity/discord";
import { signSession } from "@/lib/activity/session";
import { accountForDiscord } from "@/lib/daily/results";
import { resolveIdentity } from "@/lib/economy/identity";

export const runtime = "nodejs";

const INTENT_MINUTES = 5;

/** The game a Play button asked for, read once. */
async function takeIntent(discordId: string): Promise<string | null> {
  const admin = createServiceClient();
  const { data } = await admin.from("discord_activity_intents").delete().eq("discord_user_id", discordId).select("tab, created_at").maybeSingle();
  const row = data as { tab: string; created_at: string } | null;
  return row && Date.now() - Date.parse(row.created_at) < INTENT_MINUTES * 60_000 ? row.tab : null;
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { code?: unknown } | null;
  const code = typeof body?.code === "string" ? body.code : "";
  if (!code || code.length > 200) return NextResponse.json({ ok: false, error: "bad_code" }, { status: 400 });

  const x = await exchangeCode(code);
  if (!x.ok) return NextResponse.json({ ok: false, error: x.error }, { status: x.error === "bad_code" ? 400 : 503 });

  const name = x.me.global_name || x.me.username;
  const [{ identityId }, userId, startTab] = await Promise.all([
    resolveIdentity({ platform: "discord", platformId: x.me.id, displayName: name }),
    accountForDiscord(x.me.id).catch(() => null),
    takeIntent(x.me.id).catch(() => null),
  ]);
  const session = signSession({ did: x.me.id, iid: identityId, uid: userId, name, avatar: x.me.avatar });
  return NextResponse.json({
    ok: true,
    accessToken: x.accessToken,
    session,
    user: { id: x.me.id, name, avatar: x.me.avatar, linked: !!userId },
    startTab,
  }, { headers: { "Cache-Control": "no-store" } });
}
