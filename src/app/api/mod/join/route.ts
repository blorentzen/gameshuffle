/**
 * POST /api/mod/join { streamer } — a signed-in Twitch mod joins the
 * streamer's GameShuffle mod team (src/lib/mods/join.ts). Verified against
 * the channel's live Twitch mod list.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { joinAsMod, joinStreamer, JOIN_ERRORS } from "@/lib/mods/join";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "not_signed_in", message: JOIN_ERRORS.not_signed_in }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { streamer?: string };
  const streamer = typeof body.streamer === "string" ? await joinStreamer(body.streamer) : null;
  if (!streamer) return NextResponse.json({ ok: false, error: "streamer_not_found", message: "We couldn't find that channel." }, { status: 404 });
  try {
    const res = await joinAsMod(streamer.id, user.id);
    if (!res.ok) return NextResponse.json({ ok: false, error: res.error, message: JOIN_ERRORS[res.error] }, { status: 400 });
    return NextResponse.json({ ok: true, slug: streamer.slug });
  } catch (err) {
    console.error("[api/mod/join] failed:", err);
    return NextResponse.json({ ok: false, error: "not_saved", message: "That didn't save. Try again." }, { status: 500 });
  }
}
