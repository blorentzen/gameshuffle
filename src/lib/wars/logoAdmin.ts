import "server-only";

/**
 * Who manages a server's team logos on GameShuffle (the Logos page, war tools pick 5A): the account that added
 * GameShuffle Competitive to that server, and staff. Everyone else in the server uses /logo in Discord, where
 * Discord tells us who can manage the server.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { getAppGuild } from "@/lib/discord/appGuilds";
import { isStaffRole } from "@/lib/subscription";
import { listLogos, type WarLogo } from "./logos";
import { playedTeams } from "./teams";

export interface LogoManager { userId: string; by: { id: string; name: string }; serverName: string | null }

/** The signed-in account as this server's logo manager, or null. `by` is who the logos say added them. */
export async function logoManager(userId: string, guildId: string): Promise<LogoManager | null> {
  if (!/^\d{5,25}$/.test(guildId)) return null;
  const db = createServiceClient();
  const [row, { data: me }] = await Promise.all([
    getAppGuild("comp", guildId),
    db.from("users").select("role, discord_id, display_name, username").eq("id", userId).maybeSingle(),
  ]);
  const u = me as { role: string | null; discord_id: string | null; display_name: string | null; username: string | null } | null;
  if (!row || !u) return null;
  if (row.ownerUserId !== userId && !isStaffRole(u.role)) return null;
  return {
    userId,
    // A linked Discord account counts as the same person in /logo (whoever added a logo can replace it there).
    by: { id: u.discord_id ?? `u:${userId}`, name: (u.display_name || u.username || "GameShuffle").slice(0, 32) },
    serverName: row.name,
  };
}

export interface LogoPageTeam { tag: string; name: string | null; logo: string | null; source: "mkcentral" | "none" }
export interface LogoPageData { logos: (Pick<WarLogo, "tag" | "name" | "url" | "verdict"> & { by: string | null })[]; teams: LogoPageTeam[] }

/** The server's own logos, and the teams from its wars that have none here (MKCentral's logo, or nothing yet). */
export async function logoPageData(guildId: string): Promise<LogoPageData> {
  const [logos, played] = await Promise.all([listLogos(guildId), playedTeams(guildId).catch(() => [])]);
  const own = new Set(logos.map((l) => l.tag.toLowerCase()));
  return {
    logos: logos.map((l) => ({ tag: l.tag, name: l.name, url: l.url, verdict: l.verdict, by: l.createdByName })),
    teams: played.filter((t) => !own.has(t.tag.toLowerCase())).map((t) => ({ tag: t.tag, name: t.name, logo: t.logo && /^https:\/\/mkcentral\.com\//.test(t.logo) ? t.logo : null, source: t.logo && /^https:\/\/mkcentral\.com\//.test(t.logo) ? "mkcentral" : "none" })),
  };
}
