/**
 * GET /api/cron/qotd-discord
 *
 * Daily sweep that posts each opted-in streamer's Question of the Day to
 * their Discord channel.
 *
 * `!qotd` (Twitch) answers on demand; this is the push side. Both resolve
 * through `resolveQotdForCommunity`, so the Discord post always names the
 * same question chat would give today.
 *
 * Opt-in only: a streamer must explicitly set the `qotd` flag in the
 * server's `discord_guilds.event_subscriptions`. Each connected server posts
 * the same question at its own hour (GS Pro). Unlike the other Discord events
 * (which react to something the streamer just did), this posts on a
 * schedule — so it defaults OFF and is never enabled implicitly.
 *
 * Idempotence: the (community, local day, server) slot is CLAIMED in
 * `gs_qotd_discord_posts` before posting, so a retry or overlapping run
 * can't double-post. A failed post releases its claim so the next run can
 * retry the same day.
 *
 * Auth: Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`.
 * Schedule: see `vercel.json` — once per day.
 */

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { resolveCommunityIdForOwner } from "@/lib/economy/communityResolver";
import { resolveQotdForCommunity, qotdDayKey } from "@/lib/qotd";
import { postQotdToDiscord } from "@/lib/adapters/discord";
import { isProUser } from "@/lib/subscription-server";

export const runtime = "nodejs";

/** One connected server, with its owner's timezone. */
interface CandidateRow {
  id: string;
  guild_id: string;
  is_main: boolean;
  event_subscriptions: Record<string, boolean> | null;
  qotd_hour: number | null;
  timezone: string | null;
}

/** Current hour (0-23) in a streamer's timezone; falls back to Pacific. */
function currentHourInTz(tz: string | null): number {
  const zone = tz || "America/Los_Angeles";
  try {
    return Number(new Intl.DateTimeFormat("en-US", { timeZone: zone, hour: "2-digit", hourCycle: "h23" }).format(new Date()));
  } catch {
    return Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hour: "2-digit", hourCycle: "h23" }).format(new Date()));
  }
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    console.error("[cron/qotd-discord] CRON_SECRET missing in production");
    return NextResponse.json({ error: "misconfigured" }, { status: 500 });
  }

  const admin = createServiceClient();

  // Candidates: every connected server with a channel (discord_guilds). The
  // explicit qotd opt-in is re-checked below and again inside postQotdToDiscord.
  const { data, error } = await admin
    .from("discord_guilds")
    .select("guild_id, owner_user_id, is_main, event_subscriptions, qotd_hour, users!inner(timezone)")
    .is("removed_at", null)
    .not("default_channel_id", "is", null);
  if (error) {
    console.error("[cron/qotd-discord] candidate query failed:", error);
    return NextResponse.json({ error: "sweep_failed" }, { status: 500 });
  }
  const rows: CandidateRow[] = ((data ?? []) as unknown as { guild_id: string; owner_user_id: string; is_main: boolean; event_subscriptions: Record<string, boolean> | null; qotd_hour: number | null; users: { timezone: string | null } | { timezone: string | null }[] }[])
    .map((r) => ({ id: r.owner_user_id, guild_id: r.guild_id, is_main: r.is_main, event_subscriptions: r.event_subscriptions, qotd_hour: r.qotd_hour, timezone: (Array.isArray(r.users) ? r.users[0] : r.users)?.timezone ?? null }));

  // Runs hourly: only post for servers whose chosen local hour matches now
  // (default noon). The per-server, per-day claim below still guarantees once a day.
  const due = rows.filter((r) => {
    if (r.event_subscriptions?.qotd !== true) return false;
    const target = typeof r.qotd_hour === "number" ? r.qotd_hour : 12;
    return currentHourInTz(r.timezone) === target;
  });
  // QOTD is a GS Pro tool: a lapsed account's servers stop posting it.
  const proByOwner = new Map<string, boolean>();
  for (const id of new Set(due.map((r) => r.id))) proByOwner.set(id, await isProUser(id));
  const candidates = due.filter((r) => proByOwner.get(r.id));

  let posted = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of candidates) {
    try {
      const communityId = await resolveCommunityIdForOwner(row.id);
      if (!communityId) {
        skipped++;
        continue;
      }

      const pick = await resolveQotdForCommunity(communityId);
      if (!pick) {
        // No qotd command, or an empty pool — nothing to say today.
        skipped++;
        continue;
      }

      // Claim the day BEFORE posting. A duplicate/overlapping run loses
      // the race here and skips instead of double-posting. Keyed to the
      // streamer's local day so it lines up with the rotation.
      const postedOn = qotdDayKey(Date.now(), row.timezone);
      const { error: claimErr } = await admin
        .from("gs_qotd_discord_posts")
        .insert({
          community_id: communityId,
          posted_on: postedOn,
          guild_id: row.guild_id,
          owner_user_id: row.id,
          response_id: pick.id,
        });
      if (claimErr) {
        // 23505 = already claimed for this (community, day, server).
        if ((claimErr as { code?: string }).code !== "23505") {
          console.error("[cron/qotd-discord] claim failed:", claimErr.message);
        }
        skipped++;
        continue;
      }

      const result = await postQotdToDiscord({
        ownerUserId: row.id,
        question: pick.question,
        guildId: row.guild_id,
      });
      if (result.ok) {
        posted++;
        continue;
      }

      // Post failed — release the claim so a later run can retry today.
      await admin
        .from("gs_qotd_discord_posts")
        .delete()
        .eq("community_id", communityId)
        .eq("posted_on", postedOn)
        .eq("guild_id", row.guild_id);
      if (result.reason === "not_subscribed" || result.reason === "no_routing") {
        skipped++;
      } else {
        failed++;
        console.error(
          `[cron/qotd-discord] post failed for ${row.id}:`,
          result.error,
        );
      }
    } catch (err) {
      failed++;
      console.error(`[cron/qotd-discord] failed for ${row.id}:`, err);
    }
  }

  return NextResponse.json({
    ranAtUtc: new Date().toISOString(),
    candidates: candidates.length,
    posted,
    skipped,
    failed,
  });
}
