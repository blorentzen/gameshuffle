import "server-only";

/**
 * Player cards on a team series page (Summer Series pick 10A): filled from what the player already has on
 * GameShuffle. Main combo = the saved Mario Kart 8 Deluxe kart build they pick (else their newest), best time
 * = their best-placed 150cc time trial, lounge MMR for Mario Kart 8 Deluxe, Twitch live, profile links.
 * Hours played is the player's own count. Facts are cached a few minutes per series; live status is read
 * on every view (cheap, and it's what changes).
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { SOCIAL_PLATFORMS, socialUrl, type SocialPlatformKey } from "@/data/socials-types";
import { formatTime } from "@/lib/timeTrials/rules";
import { ttTrack } from "@/lib/timeTrials/tracks";
import { accountAvatar, type AccountRow } from "@/lib/discord/faces";
import type { PlayerRole } from "./rules";

export interface CardCombo { character: string; vehicle: string; wheels: string; glider: string; img: string | null }
export interface CardBest { track: string; time: string; place: number; total: number }

export interface PlayerCard {
  id: string;
  teamId: string;
  name: string;
  role: PlayerRole;
  userId: string | null;
  username: string | null;
  avatar: string | null;
  twitch: string | null;
  live: boolean;
  combo: CardCombo | null;
  best: CardBest | null;
  mmr: number | null;
  hours: number | null;
  links: { label: string; url: string }[];
}

export interface CardPlayerRow { id: string; team_id: string; user_id: string | null; name: string; role: PlayerRole; hours: number | null; kart_config_id: string | null }

interface Facts { username: string | null; displayName: string | null; avatar: string | null; twitch: string | null; combo: CardCombo | null; best: CardBest | null; mmr: number | null; links: { label: string; url: string }[] }

const FACTS_TTL = 5 * 60_000;
const factsCache = new Map<string, { at: number; facts: Map<string, Facts> }>();

/** Drop a series' cached facts (after a player edits their card). */
export function forgetCards(seriesId: string): void {
  factsCache.delete(seriesId);
}

async function loadFacts(players: CardPlayerRow[]): Promise<Map<string, Facts>> {
  const admin = createServiceClient();
  const ids = [...new Set(players.flatMap((p) => (p.user_id ? [p.user_id] : [])))];
  const out = new Map<string, Facts>();
  if (!ids.length) return out;
  const [usersRes, twitchRes, buildsRes, loungeRes, bestsRes] = await Promise.all([
    admin.from("users").select("id, username, display_name, socials, avatar_source, avatar_seed, avatar_options, discord_avatar, twitch_avatar").in("id", ids),
    admin.from("twitch_connections").select("user_id, twitch_login").in("user_id", ids),
    admin.from("saved_configs").select("id, user_id, config_data, created_at").in("user_id", ids).eq("config_data->>type", "kart-build").order("created_at", { ascending: false }).limit(400),
    admin.from("lounge_links").select("user_id, game, mmr").in("user_id", ids).eq("game", "mk8dx"),
    admin.rpc("tt_player_bests2", { p_players: ids.map((id) => `u:${id}`) }),
  ]);
  type U = AccountRow & { username: string | null; display_name: string | null; socials: Record<string, string> | null };
  type B = { id: string; user_id: string; config_data: { gameSlug?: string; character?: { name?: string; img?: string }; vehicle?: { name?: string }; wheels?: { name?: string }; glider?: { name?: string } } };
  type T = { player: string; game: string; track: string; cc: number; items: string; vehicle: string; time_ms: number; place: number; total: number };
  const builds = ((buildsRes.data ?? []) as B[]).filter((b) => (b.config_data?.gameSlug ?? "mario-kart-8-deluxe") === "mario-kart-8-deluxe");
  const bests = bestsRes.error ? [] : ((bestsRes.data ?? []) as T[]).filter((t) => t.game === "mk8dx" && Number(t.cc) === 150 && t.vehicle === "any" && t.items === "shrooms");

  for (const u of (usersRes.data ?? []) as U[]) {
    const player = players.find((p) => p.user_id === u.id);
    const pick = builds.find((b) => b.id === player?.kart_config_id && b.user_id === u.id) ?? builds.find((b) => b.user_id === u.id) ?? null;
    const c = pick?.config_data;
    const combo: CardCombo | null = c?.character?.name && c.vehicle?.name && c.wheels?.name && c.glider?.name
      ? { character: c.character.name, vehicle: c.vehicle.name, wheels: c.wheels.name, glider: c.glider.name, img: c.character.img ?? null }
      : null;
    const top = bests.filter((t) => t.player === `u:${u.id}`).sort((a, b) => a.place / Math.max(1, a.total) - b.place / Math.max(1, b.total) || a.place - b.place)[0];
    const best: CardBest | null = top ? { track: ttTrack("mk8dx", top.track)?.name ?? top.track, time: formatTime(top.time_ms), place: top.place, total: top.total } : null;
    const lounge = ((loungeRes.data ?? []) as { user_id: string; mmr: number | null }[]).find((l) => l.user_id === u.id);
    const twitch = ((twitchRes.data ?? []) as { user_id: string; twitch_login: string | null }[]).find((t) => t.user_id === u.id)?.twitch_login ?? null;
    const links: { label: string; url: string }[] = [];
    if (twitch) links.push({ label: "Twitch", url: `https://twitch.tv/${twitch}` });
    for (const sp of SOCIAL_PLATFORMS) {
      if (sp.key === "discord_invite") continue;
      const url = socialUrl(sp.key as SocialPlatformKey, u.socials?.[sp.key]);
      if (url) links.push({ label: sp.label === "Twitter / X" ? "X" : sp.label, url });
    }
    out.set(u.id, { username: u.username, displayName: u.display_name, avatar: accountAvatar(u), twitch, combo, best, mmr: lounge?.mmr ?? null, links: links.slice(0, 4) });
  }
  return out;
}

/** Cards for a series' players, in the order given. */
export async function playerCards(seriesId: string, players: CardPlayerRow[]): Promise<PlayerCard[]> {
  const hit = factsCache.get(seriesId);
  let facts = hit && Date.now() - hit.at < FACTS_TTL ? hit.facts : null;
  if (!facts) {
    facts = await loadFacts(players).catch((e) => { console.error("[series] card facts failed:", e); return new Map<string, Facts>(); });
    factsCache.set(seriesId, { at: Date.now(), facts });
    if (factsCache.size > 50) factsCache.delete(factsCache.keys().next().value as string);
  }
  const ids = players.flatMap((p) => (p.user_id ? [p.user_id] : []));
  const liveRes = ids.length ? await createServiceClient().from("twitch_connections").select("user_id, is_live").in("user_id", ids) : { data: [] };
  const live = new Set(((liveRes.data ?? []) as { user_id: string; is_live: boolean | null }[]).filter((r) => r.is_live).map((r) => r.user_id));
  return players.map((p) => {
    const f = p.user_id ? facts!.get(p.user_id) : undefined;
    return {
      id: p.id, teamId: p.team_id, name: p.name, role: p.role, userId: p.user_id,
      username: f?.username ?? null, avatar: f?.avatar ?? null, twitch: f?.twitch ?? null,
      live: !!p.user_id && live.has(p.user_id),
      combo: f?.combo ?? null, best: f?.best ?? null, mmr: f?.mmr ?? null, hours: p.hours, links: f?.links ?? [],
    };
  });
}
