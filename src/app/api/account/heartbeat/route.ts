/**
 * POST /api/account/heartbeat — stamps users.last_seen_at = now for presence
 * ("online" = seen within the last few minutes). Called periodically by the
 * PresenceHeartbeat client while a signed-in user has the app open.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { ensureAccountWallet } from "@/lib/economy/accountWallet";

export const runtime = "nodejs";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const admin = createServiceClient();
  await admin.from("users").update({ last_seen_at: new Date().toISOString() }).eq("id", user.id);

  // Ensure the account has a wallet + starting grant (idempotent — grants once,
  // backfills existing accounts). Best-effort: never fail the heartbeat over it,
  // and tolerate the migration not being applied yet.
  try {
    const displayName =
      (user.user_metadata?.display_name as string | undefined) ??
      (user.user_metadata?.full_name as string | undefined) ??
      user.email ??
      null;
    await ensureAccountWallet(user.id, displayName);
  } catch (err) {
    console.error("[heartbeat] ensureAccountWallet failed:", err);
  }

  return NextResponse.json({ ok: true });
}
