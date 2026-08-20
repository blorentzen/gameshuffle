/**
 * POST /api/discord/bot/announce
 *
 * Post or schedule a Discord announcement (GS Pro). Routes to the streamer's
 * `announcements` channel (or default). Body:
 *   { title, body, url?, mode: "now" | "schedule", fireAt?,
 *     followUps?: [{ offsetMinutes, body }] }
 * Follow-ups are scheduled relative to the base send time.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { effectiveTier, normalizeTier } from "@/lib/subscription";
import { postAnnouncementToCategory } from "@/lib/adapters/discord";
import { scheduleDiscordPost } from "@/lib/discord/scheduled";

export const runtime = "nodejs";

const CATEGORY = "announcements";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });

  const admin = createServiceClient();
  const { data: profile } = await admin
    .from("users")
    .select("discord_guild_id, subscription_tier, role")
    .eq("id", user.id)
    .maybeSingle();
  const p = profile as { discord_guild_id: string | null; subscription_tier: string | null; role: string | null } | null;
  const isPro = effectiveTier({ tier: normalizeTier(p?.subscription_tier ?? null), role: p?.role ?? null }) === "pro";
  if (!isPro) return NextResponse.json({ ok: false, error: "pro_required" }, { status: 403 });
  if (!p?.discord_guild_id) return NextResponse.json({ ok: false, error: "bot_not_installed" }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }
  const b = body as {
    title?: unknown; body?: unknown; url?: unknown; mode?: unknown; fireAt?: unknown;
    followUps?: unknown;
  };
  const title = typeof b.title === "string" ? b.title.trim().slice(0, 256) : "";
  const text = typeof b.body === "string" ? b.body.trim().slice(0, 4000) : "";
  const url = typeof b.url === "string" && b.url.trim() ? b.url.trim().slice(0, 300) : null;
  const mode = b.mode === "schedule" ? "schedule" : "now";
  if (!title || !text) return NextResponse.json({ ok: false, error: "title_and_body_required" }, { status: 400 });

  // Base send time.
  let baseMs = Date.now();
  if (mode === "schedule") {
    const t = typeof b.fireAt === "string" ? new Date(b.fireAt).getTime() : NaN;
    if (Number.isNaN(t)) return NextResponse.json({ ok: false, error: "invalid_fireAt" }, { status: 400 });
    baseMs = t;
  }

  const content = { title, body: text, url };

  // Main post: fire now if "now" and due, else schedule.
  if (mode === "now") {
    const res = await postAnnouncementToCategory({ ownerUserId: user.id, category: CATEGORY, title, body: text, url });
    if (!res.ok) {
      // no_channel / no_routing → tell the streamer to configure routing.
      return NextResponse.json({ ok: false, error: res.reason }, { status: 400 });
    }
  } else {
    await scheduleDiscordPost({ userId: user.id, category: CATEGORY, content, fireAt: new Date(baseMs).toISOString() });
  }

  // Follow-ups (always scheduled, relative to base).
  const followUps = Array.isArray(b.followUps) ? b.followUps : [];
  let scheduled = 0;
  for (const f of followUps) {
    const fu = f as { offsetMinutes?: unknown; body?: unknown };
    const offset = typeof fu.offsetMinutes === "number" && Number.isFinite(fu.offsetMinutes) ? fu.offsetMinutes : null;
    const fbody = typeof fu.body === "string" ? fu.body.trim().slice(0, 4000) : "";
    if (offset === null || offset <= 0 || !fbody) continue;
    const fireAt = new Date(baseMs + offset * 60_000).toISOString();
    const id = await scheduleDiscordPost({ userId: user.id, category: CATEGORY, content: { title, body: fbody, url }, fireAt });
    if (id) scheduled += 1;
  }

  return NextResponse.json({ ok: true, mode, followUpsScheduled: scheduled });
}
