/**
 * GET /api/cron/discord-pro-roles
 *
 * Keeps each streamer's chosen "GS Pro" Discord role in sync with their members'
 * GameShuffle tier: lists guild members, cross-references linked GS accounts
 * (users.discord_id → effective tier), and adds/removes the Pro role. Handles
 * upgrades, downgrades, and members who joined before linking. The gateway
 * worker handles the immediate on-join case; this reconciles everyone else.
 *
 * Auth: Vercel Cron Bearer CRON_SECRET.
 */

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { effectiveTier, normalizeTier } from "@/lib/subscription";
import { listGuildMembers, addGuildMemberRole, removeGuildMemberRole } from "@/lib/adapters/discord/adapter";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "misconfigured" }, { status: 500 });
  }

  const admin = createServiceClient();
  const { data: streamers } = await admin
    .from("users")
    .select("discord_guild_id, discord_pro_role_id")
    .not("discord_pro_role_id", "is", null)
    .not("discord_guild_id", "is", null);

  let added = 0;
  let removed = 0;
  for (const s of (streamers ?? []) as Array<{ discord_guild_id: string; discord_pro_role_id: string }>) {
    const guildId = s.discord_guild_id;
    const proRoleId = s.discord_pro_role_id;

    const membersRes = await listGuildMembers(guildId);
    if (!membersRes.ok) continue;
    const members = membersRes.members.filter((m) => !m.bot);
    if (!members.length) continue;

    // Which of these members are linked to a GS Pro account?
    const { data: accounts } = await admin
      .from("users")
      .select("discord_id, subscription_tier, role")
      .in("discord_id", members.map((m) => m.userId));
    const proIds = new Set<string>();
    for (const a of (accounts ?? []) as Array<{ discord_id: string; subscription_tier: string | null; role: string | null }>) {
      if (effectiveTier({ tier: normalizeTier(a.subscription_tier), role: a.role }) === "pro") proIds.add(a.discord_id);
    }

    for (const m of members) {
      const hasRole = m.roles.includes(proRoleId);
      const shouldHave = proIds.has(m.userId);
      if (shouldHave && !hasRole) {
        if ((await addGuildMemberRole(guildId, m.userId, proRoleId)).ok) added += 1;
      } else if (!shouldHave && hasRole) {
        if ((await removeGuildMemberRole(guildId, m.userId, proRoleId)).ok) removed += 1;
      }
    }
  }

  if (added || removed) console.log("[cron/discord-pro-roles]", { added, removed });
  return NextResponse.json({ ok: true, added, removed });
}
