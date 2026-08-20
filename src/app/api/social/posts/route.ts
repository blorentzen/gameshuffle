/** Social feed posts. GET ?scope=for_you|following&before=<iso> — feed. POST — create. */

import { NextResponse, after, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { userCanUseCommunity } from "@/lib/community/guard";
import { createServiceClient } from "@/lib/supabase/admin";
import { effectiveTier, normalizeTier } from "@/lib/subscription";
import { postAnnouncementToCategory } from "@/lib/adapters/discord";
import { listFeed, createPost } from "@/lib/social/feed";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!(await userCanUseCommunity(user.id))) return NextResponse.json({ error: "unavailable" }, { status: 403 });

  const sp = req.nextUrl.searchParams;
  const scope = sp.get("scope") === "following" ? "following" : "for_you";
  const posts = await listFeed({ viewerId: user.id, scope, before: sp.get("before") });
  return NextResponse.json({ ok: true, posts });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!(await userCanUseCommunity(user.id))) return NextResponse.json({ error: "unavailable" }, { status: 403 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const b = body as { body?: unknown; kind?: unknown; meta?: unknown; announceDiscord?: unknown };
  const text = typeof b?.body === "string" ? b.body : "";
  const kind = b?.kind === "game_night" ? "game_night" : undefined;
  const meta = b?.meta && typeof b.meta === "object" ? (b.meta as Record<string, unknown>) : undefined;
  const res = await createPost({ authorId: user.id, body: text, kind, meta });
  if (!res.ok) {
    const status = res.reason === "rate_limited" ? 429 : 400;
    return NextResponse.json({ error: res.reason }, { status });
  }

  // Game-night → Discord announce (opt-in, GS Pro). Best-effort after responding;
  // no-ops if the streamer isn't Pro or hasn't routed a game_nights channel.
  if (kind === "game_night" && b?.announceDiscord === true) {
    const postId = res.id;
    after(async () => {
      try {
        const { data: profile } = await createServiceClient()
          .from("users")
          .select("subscription_tier, role")
          .eq("id", user.id)
          .maybeSingle();
        const p = profile as { subscription_tier: string | null; role: string | null } | null;
        const isPro = effectiveTier({ tier: normalizeTier(p?.subscription_tier ?? null), role: p?.role ?? null }) === "pro";
        if (!isPro) return;

        const game = typeof meta?.game === "string" ? meta.game : null;
        const startAt = typeof meta?.startAt === "string" ? meta.startAt : null;
        const capacity = typeof meta?.capacity === "number" ? meta.capacity : null;
        const whenStr = startAt ? new Date(startAt).toLocaleString() : "Hosting now";
        const base = (process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.gameshuffle.co").replace(/\/$/, "");

        await postAnnouncementToCategory({
          ownerUserId: user.id,
          category: "game_nights",
          title: `🎮 Game Night${game ? `: ${game}` : ""}`,
          body: `${text}\n\n🕒 ${whenStr}${capacity ? ` · ${capacity} spots` : ""}`,
          url: `${base}/community/post/${postId}`,
        });
      } catch (err) {
        console.error("[social/posts] game-night discord announce failed:", err);
      }
    });
  }

  return NextResponse.json({ ok: true, id: res.id });
}
