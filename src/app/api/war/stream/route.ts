/**
 * The war channel on the signed-in streamer's GameShuffle overlay (GS Pro; overlay looks pick 3A).
 *   GET    → { war: { token, lookId, channel, server, setupUrl } | null, pro }
 *   POST   { token, look } → saves the look as the account's look for its layout, puts that channel's war on the
 *          overlay and turns the piece on ({ lookId }). 403 pro_required without GS Pro.
 *   DELETE → takes it off.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isProUser } from "@/lib/subscription-server";
import { rateLimit } from "@/lib/ratelimit";
import { channelByToken } from "@/lib/wars/store";
import { channelLabel } from "@/lib/wars/channelLabel";
import { looksReady, saveLook } from "@/lib/wars/looks";
import { clearStreamWar, setStreamWar, streamWarFor } from "@/lib/wars/streamPiece";

export const runtime = "nodejs";

async function viewer() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function GET() {
  const user = await viewer();
  if (!user) return NextResponse.json({ error: "signin" }, { status: 401 });
  const [war, pro] = await Promise.all([streamWarFor(user.id), isProUser(user.id).catch(() => false)]);
  const channel = war ? await channelByToken(war.token) : null;
  if (!war || !channel) return NextResponse.json({ war: null, pro });
  const label = await channelLabel(channel.guildId, channel.channelId);
  return NextResponse.json({ war: { token: war.token, lookId: war.lookId, channel: label.channel, server: label.server, setupUrl: `/war-overlay/${war.token}` }, pro });
}

export async function POST(req: Request) {
  const user = await viewer();
  if (!user) return NextResponse.json({ error: "signin" }, { status: 401 });
  const rl = await rateLimit(`war-stream:${user.id}`, { max: 20, windowMs: 10 * 60_000 });
  if (!rl.ok) return NextResponse.json({ error: "slow_down" }, { status: 429 });
  if (!(await isProUser(user.id).catch(() => false))) return NextResponse.json({ error: "pro_required" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { token?: unknown; look?: unknown };
  const token = typeof body.token === "string" ? body.token : "";
  if (!(await channelByToken(token))) return NextResponse.json({ error: "no_channel" }, { status: 404 });
  if (!(await looksReady())) return NextResponse.json({ error: "not_ready" }, { status: 503 });
  const lookId = await saveLook(user.id, body.look);
  if (!lookId) return NextResponse.json({ error: "failed" }, { status: 500 });
  if (!(await setStreamWar(user.id, { token, lookId }))) return NextResponse.json({ error: "failed" }, { status: 500 });
  return NextResponse.json({ lookId });
}

export async function DELETE() {
  const user = await viewer();
  if (!user) return NextResponse.json({ error: "signin" }, { status: 401 });
  await clearStreamWar(user.id);
  return NextResponse.json({ ok: true });
}
