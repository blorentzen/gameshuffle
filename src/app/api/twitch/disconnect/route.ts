/**
 * POST /api/twitch/disconnect
 *
 * Tears down the streamer's Twitch integration:
 *   1. Revokes the access token at Twitch
 *   2. Deletes all EventSub subscriptions
 *   3. Deletes the twitch_connections row (CASCADE handles related tables)
 *
 * Each step is best-effort — we'd rather leave dangling external state than
 * leave a broken integration in our DB. Logs failures for cleanup later.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createTwitchAdminClient } from "@/lib/twitch/admin";
import { decryptToken, TwitchCryptoError } from "@/lib/twitch/crypto";
import { revokeToken } from "@/lib/twitch/client";
import { unsubscribeAllForUser } from "@/lib/twitch/eventsub";

export const runtime = "nodejs";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const admin = createTwitchAdminClient();
  const { data: connection } = await admin
    .from("twitch_connections")
    .select("id, access_token_encrypted")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!connection) {
    return NextResponse.json({ success: true, alreadyDisconnected: true });
  }

  // 1. Revoke access token (best-effort — Twitch returns 200 even for unknown tokens)
  if (connection.access_token_encrypted) {
    try {
      const accessToken = decryptToken(connection.access_token_encrypted);
      await revokeToken(accessToken);
    } catch (err) {
      if (err instanceof TwitchCryptoError) {
        console.warn("[twitch-disconnect] could not decrypt token to revoke:", err.message);
      } else {
        console.error("[twitch-disconnect] revoke failed:", err);
      }
    }
  }

  // 2. Delete EventSub subscriptions (best-effort)
  try {
    await unsubscribeAllForUser(user.id);
  } catch (err) {
    console.error("[twitch-disconnect] EventSub unsubscribe failed:", err);
  }

  // 3. Delete the connection row — CASCADE clears configs, sessions, participants, shuffle events
  const { error: deleteErr } = await admin
    .from("twitch_connections")
    .delete()
    .eq("id", connection.id);
  if (deleteErr) {
    console.error("[twitch-disconnect] connection delete failed:", deleteErr);
    return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
