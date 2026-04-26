/**
 * POST /api/twitch/disconnect
 *
 * User-initiated disconnect. Delegates the actual teardown to the
 * shared `disconnectTwitchIntegration` helper so the Stripe webhook
 * (subscription-cancellation path) can run the exact same cleanup.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { disconnectTwitchIntegration } from "@/lib/twitch/disconnect";

export const runtime = "nodejs";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  try {
    const result = await disconnectTwitchIntegration(user.id);
    if (result.alreadyDisconnected) {
      return NextResponse.json({ success: true, alreadyDisconnected: true });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[twitch-disconnect] failed:", err);
    return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  }
}
