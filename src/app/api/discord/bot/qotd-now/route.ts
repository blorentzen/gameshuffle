/**
 * POST /api/discord/bot/qotd-now
 *
 * Fire today's Question of the Day to one server (?guild=, else the main
 * one) immediately. Claims that server's day in gs_qotd_discord_posts, so
 * the scheduled cron won't repeat it there. Returns
 * already_posted if today's question already went out.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { resolveCommunityIdForOwner } from "@/lib/economy/communityResolver";
import { resolveQotdForCommunity, qotdDayKey } from "@/lib/qotd";
import { postQotdToDiscord } from "@/lib/adapters/discord";
import { isProUser } from "@/lib/subscription-server";
import { pickGuild } from "@/lib/discord/guilds";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  // GS Pro, checked here: the Discord Bot tab only greys the card out.
  if (!(await isProUser(user.id))) return NextResponse.json({ ok: false, error: "pro_required" }, { status: 403 });

  const communityId = await resolveCommunityIdForOwner(user.id);
  if (!communityId) return NextResponse.json({ ok: false, error: "no_community" }, { status: 400 });

  // The server picked on the Discord Bot tab (?guild=), else the main one.
  const guild = await pickGuild(user.id, new URL(request.url).searchParams.get("guild"));
  if (!guild || guild.removedAt) return NextResponse.json({ ok: false, error: "no_server" }, { status: 400 });

  const pick = await resolveQotdForCommunity(communityId);
  if (!pick) return NextResponse.json({ ok: false, error: "no_questions" }, { status: 400 });

  const admin = createServiceClient();
  const { data: tzRow } = await admin
    .from("users")
    .select("timezone")
    .eq("id", user.id)
    .maybeSingle();
  const postedOn = qotdDayKey(Date.now(), (tzRow as { timezone: string | null } | null)?.timezone ?? null);

  // Claim the day before posting; a duplicate (manual or cron) loses the race.
  const { error: claimErr } = await admin
    .from("gs_qotd_discord_posts")
    .insert({ community_id: communityId, posted_on: postedOn, guild_id: guild.guildId, owner_user_id: user.id, response_id: pick.id });
  if (claimErr) {
    if ((claimErr as { code?: string }).code === "23505") {
      return NextResponse.json({ ok: false, error: "already_posted" }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: "claim_failed" }, { status: 500 });
  }

  const result = await postQotdToDiscord({ ownerUserId: user.id, question: pick.question, guildId: guild.guildId });
  if (!result.ok) {
    // Release the claim so a later attempt can retry today.
    await admin.from("gs_qotd_discord_posts").delete().eq("community_id", communityId).eq("posted_on", postedOn).eq("guild_id", guild.guildId);
    return NextResponse.json({ ok: false, error: result.reason }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
