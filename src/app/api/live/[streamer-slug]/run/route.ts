/**
 * GET /api/live/[streamer-slug]/run → { ok, run: LiveRunBody | null }
 *
 * The runner's speedrun as the overlay has it, for the live page's run card (and the Twitch extension's, which answers
 * this same path from its own state). Null when no run is going and none ended in the last two minutes. Public; the
 * same for everyone, so it's cached briefly at the edge.
 */

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { liveRunBody } from "@/lib/speedrun/liveRun";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ "streamer-slug": string }> }) {
  const { "streamer-slug": slug } = await params;
  if (!slug) return NextResponse.json({ error: "missing_slug" }, { status: 400 });
  const admin = createServiceClient();
  const { data: byUsername } = await admin.from("users").select("id").eq("username", slug.toLowerCase()).maybeSingle();
  const streamer = byUsername ?? (await admin.from("users").select("id").eq("twitch_username", slug).limit(1).maybeSingle()).data;
  if (!streamer) return NextResponse.json({ ok: true, run: null });
  const run = await liveRunBody((streamer as { id: string }).id);
  return NextResponse.json({ ok: true, run }, { headers: { "cache-control": "public, s-maxage=2, stale-while-revalidate=4" } });
}
