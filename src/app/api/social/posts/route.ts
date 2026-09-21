/** Social feed posts. GET ?scope=for_you|following&before=<iso> — feed. POST — create. */

import { NextResponse, after, type NextRequest } from "next/server";
import { getBaseUrl } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { userCanUseCommunity } from "@/lib/community/guard";
import { createServiceClient } from "@/lib/supabase/admin";
import { effectiveTier, normalizeTier } from "@/lib/subscription";
import { postAnnouncementToCategory } from "@/lib/adapters/discord";
import { listFeed, listCommunityFeed, createPost, getPost } from "@/lib/social/feed";
import { isMember, getCommunityById } from "@/lib/communities/membership";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!(await userCanUseCommunity(user.id))) return NextResponse.json({ error: "unavailable" }, { status: 403 });

  const sp = req.nextUrl.searchParams;
  const communityId = sp.get("communityId");
  if (communityId) {
    const posts = await listCommunityFeed({ communityId, viewerId: user.id, before: sp.get("before") });
    return NextResponse.json({ ok: true, posts });
  }
  const scopeParam = sp.get("scope");
  const scope = scopeParam === "following" ? "following" : scopeParam === "communities" ? "communities" : "for_you";
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
  const b = body as { body?: unknown; kind?: unknown; meta?: unknown; announceDiscord?: unknown; communityId?: unknown; asCommunity?: unknown };
  const text = typeof b?.body === "string" ? b.body : "";
  const kind = b?.kind === "game_night" ? "game_night" : b?.kind === "share" ? "share" : undefined;
  const meta = b?.meta && typeof b.meta === "object" ? (b.meta as Record<string, unknown>) : undefined;
  const communityId = typeof b?.communityId === "string" ? b.communityId : null;
  const rawImages = (b as { imageUrls?: unknown })?.imageUrls;
  const imageUrls = Array.isArray(rawImages) ? rawImages.filter((u): u is string => typeof u === "string") : [];
  const rawTopics = (b as { topics?: unknown })?.topics;
  const topics = Array.isArray(rawTopics) ? rawTopics.filter((t): t is string => typeof t === "string") : [];
  let asCommunity = b?.asCommunity === true;

  // Posting to a community requires membership.
  if (communityId && !(await isMember(user.id, communityId))) {
    return NextResponse.json({ error: "not_a_member" }, { status: 403 });
  }
  // Posting AS the community (Page-style) requires ownership.
  if (asCommunity) {
    if (!communityId) return NextResponse.json({ error: "no_community" }, { status: 400 });
    const community = await getCommunityById(communityId);
    if (!community || community.ownerUserId !== user.id) {
      return NextResponse.json({ error: "not_owner" }, { status: 403 });
    }
  } else {
    asCommunity = false;
  }

  let res: Awaited<ReturnType<typeof createPost>>;
  try {
    res = await createPost({ authorId: user.id, body: text, kind, meta, communityId, asCommunity, imageUrls, topics });
  } catch (err) {
    console.error("[social/posts] createPost threw:", err);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
  if (!res.ok) {
    const status = res.reason === "rate_limited" ? 429 : 400;
    return NextResponse.json({ error: res.reason }, { status });
  }

  // Hydrate the created post so the client can drop it straight to the top of
  // the feed (optimistic insert) without a full refetch. Best-effort.
  const post = await getPost(res.id, user.id).catch(() => null);

  // Game-night → Discord announce (opt-in, GS Pro). Best-effort after responding;
  // no-ops if the streamer isn't Pro or hasn't routed a game_nights channel.
  if (kind === "game_night" && b?.announceDiscord === true) {
    const postId = res.id;
    after(async () => {
      try {
        const { data: profile } = await createServiceClient()
          .from("users")
          .select("subscription_tier, role, circuit_tier, circuit_status")
          .eq("id", user.id)
          .maybeSingle();
        const p = profile as { subscription_tier: string | null; role: string | null; circuit_tier: string | null; circuit_status: string | null } | null;
        const isPro = effectiveTier({ tier: normalizeTier(p?.subscription_tier ?? null), role: p?.role ?? null, circuitTier: p?.circuit_tier ?? null, circuitStatus: p?.circuit_status ?? null }) === "pro";
        if (!isPro) return;

        const game = typeof meta?.game === "string" ? meta.game : null;
        const startAt = typeof meta?.startAt === "string" ? meta.startAt : null;
        const capacity = typeof meta?.capacity === "number" ? meta.capacity : null;
        const whenStr = startAt ? new Date(startAt).toLocaleString() : "Hosting now";
        const base = getBaseUrl();

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

  return NextResponse.json({ ok: true, id: res.id, post });
}
