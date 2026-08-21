/**
 * POST /api/discord/bot/qotd-now
 *
 * Fire today's Question of the Day to Discord immediately. Claims the day in
 * gs_qotd_discord_posts, so the scheduled cron won't repeat it. Returns
 * already_posted if today's question already went out.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { resolveCommunityIdForOwner } from "@/lib/economy/communityResolver";
import { resolveQotdForCommunity, qotdDayKey } from "@/lib/qotd";
import { postQotdToDiscord } from "@/lib/adapters/discord";

export const runtime = "nodejs";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });

  const communityId = await resolveCommunityIdForOwner(user.id);
  if (!communityId) return NextResponse.json({ ok: false, error: "no_community" }, { status: 400 });

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
    .insert({ community_id: communityId, posted_on: postedOn, owner_user_id: user.id, response_id: pick.id });
  if (claimErr) {
    if ((claimErr as { code?: string }).code === "23505") {
      return NextResponse.json({ ok: false, error: "already_posted" }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: "claim_failed" }, { status: 500 });
  }

  const result = await postQotdToDiscord({ ownerUserId: user.id, question: pick.question });
  if (!result.ok) {
    // Release the claim so a later attempt can retry today.
    await admin.from("gs_qotd_discord_posts").delete().eq("community_id", communityId).eq("posted_on", postedOn);
    return NextResponse.json({ ok: false, error: result.reason }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
