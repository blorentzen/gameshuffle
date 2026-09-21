/**
 * POST /api/youtube/disconnect
 *
 * User-initiated YouTube integration teardown — revokes the Google grant and
 * deletes the connection row. Auth required (own account only).
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { disconnectYouTubeIntegration } from "@/lib/youtube/disconnect";

export const runtime = "nodejs";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const result = await disconnectYouTubeIntegration(user.id);
  return NextResponse.json({ ok: true, ...result });
}
