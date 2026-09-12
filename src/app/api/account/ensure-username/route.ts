/** POST /api/account/ensure-username — assign a handle if the account has none.
 *  Idempotent; called once on sign-in (covers email signups + backfills older
 *  accounts that predate auto-assignment). Returns the resulting username. */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { ensureUsername } from "@/lib/social/usernameAssign";

export const runtime = "nodejs";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { data: profile } = await createServiceClient()
    .from("users")
    .select("username, display_name, gamertags")
    .eq("id", user.id)
    .maybeSingle();
  const p = profile as { username: string | null; display_name: string | null; gamertags: { discord?: string; twitch?: string } | null } | null;
  if (p?.username) return NextResponse.json({ ok: true, username: p.username });

  const username = await ensureUsername(user.id, {
    discord: p?.gamertags?.discord ?? null,
    twitch: p?.gamertags?.twitch ?? null,
    displayName: p?.display_name ?? null,
    email: user.email ?? null,
  });
  return NextResponse.json({ ok: true, username });
}
