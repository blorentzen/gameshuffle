import "server-only";

/**
 * Teams for a war: MKCentral's registry first (its tag, name and logo, no upload), then the teams a server
 * has played. The registry is public (mkcentral.com/api/registry/teams?name_or_tag=), its rosters carry a
 * tag and name per game, and a team's logo sits on the team. Answers are kept 10 minutes per search.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import type { WarGame } from "./rules";

export interface WarTeam { tag: string; name: string | null; logo: string | null; source: "mkcentral" | "played" }

const MKC = "https://mkcentral.com";
const TTL = 10 * 60_000;
const cache = new Map<string, { at: number; teams: WarTeam[] }>();

type Roster = { game: string; tag: string; name: string; is_active: boolean };
type RegistryTeam = { tag: string; name: string; logo: string | null; is_historical: boolean; rosters: Roster[] };

/** MKCentral teams matching what's typed, with the tag and name of their roster for this game when they have one. */
export async function searchRegistry(q: string, game: WarGame): Promise<WarTeam[]> {
  const text = q.trim();
  if (text.length < 1) return [];
  const key = `${game}|${text.toLowerCase()}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.teams;
  const res = await fetch(`${MKC}/api/registry/teams?name_or_tag=${encodeURIComponent(text)}`, { signal: AbortSignal.timeout(2000) }).catch(() => null);
  if (!res?.ok) return hit?.teams ?? [];
  const body = (await res.json().catch(() => null)) as { teams?: RegistryTeam[] } | null;
  const want = game === "mk8dx" ? "mk8dx" : "mkworld";
  const teams: WarTeam[] = [];
  for (const t of body?.teams ?? []) {
    const rosters = (t.rosters ?? []).filter((r) => r.game === want && r.is_active);
    const logo = t.logo ? `${MKC}${t.logo.startsWith("/") ? "" : "/"}${t.logo}` : null;
    if (rosters.length) for (const r of rosters) teams.push({ tag: r.tag.slice(0, 12), name: r.name.slice(0, 60), logo, source: "mkcentral" });
    else if (!t.is_historical) teams.push({ tag: t.tag.slice(0, 12), name: t.name.slice(0, 60), logo, source: "mkcentral" });
  }
  const lower = text.toLowerCase();
  teams.sort((a, b) => Number(b.tag.toLowerCase() === lower) - Number(a.tag.toLowerCase() === lower) || Number(b.tag.toLowerCase().startsWith(lower)) - Number(a.tag.toLowerCase().startsWith(lower)));
  cache.set(key, { at: Date.now(), teams });
  return teams;
}

/** The registry team with exactly this tag for the game, if any. */
export async function registryTeam(tag: string, game: WarGame): Promise<WarTeam | null> {
  const list = await searchRegistry(tag, game);
  return list.find((t) => t.tag.toLowerCase() === tag.trim().toLowerCase()) ?? null;
}

/** Teams this server has played (newest first) and its channels' own teams. */
export async function playedTeams(guildId: string): Promise<(WarTeam & { lastAt: string })[]> {
  const db = createServiceClient();
  const { data } = await db.from("wars").select("us_tag, us_name, us_logo, them_tag, them_name, them_logo, created_at").eq("guild_id", guildId).order("created_at", { ascending: false }).limit(60);
  const seen = new Set<string>();
  const out: (WarTeam & { lastAt: string })[] = [];
  for (const r of (data ?? []) as { us_tag: string; us_name: string | null; us_logo: string | null; them_tag: string; them_name: string | null; them_logo: string | null; created_at: string }[]) {
    for (const [tag, name, logo] of [[r.them_tag, r.them_name, r.them_logo], [r.us_tag, r.us_name, r.us_logo]] as const) {
      const k = tag.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ tag, name, logo, source: "played", lastAt: r.created_at });
    }
  }
  return out;
}
