import "server-only";

/**
 * Division roles in a lounge's Discord (lounge system pick 12A, free for lounges): each player tied to a Discord account
 * gets their division's role, kept up to date after every table, penalty and season reset. The roles are made the
 * first time they're needed, in each division's colors, and kept on the lounge's settings. Players still placing get
 * none. The bot (GameShuffle Competitive) needs Manage Roles, with its own role above the division roles.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { compRest } from "@/lib/discord/compRest";
import { divisionLook } from "@/lib/mmr/look";
import { readAllPages } from "@/lib/supabase/pages";
import { divisionFor } from "./rules";
import { placedEvents } from "./store";
import type { Ladder } from "./types";

const db = () => createServiceClient();
const colorInt = (hex: string) => parseInt(hex.replace("#", "").slice(0, 6), 16) || 0x2b52d6;
/** "Platinum 2" and "Platinum 1" share a role: the division's name without its step. */
const roleName = (division: string) => division.replace(/\s+\d+$/, "");

export type RolesResult = { ok: true; changed: number } | { ok: false; error: "off" | "no_access" | "failed" };

/** The lounge's role for each division, made where missing (and saved on the lounge's settings). */
async function ensureRoles(ladder: Ladder): Promise<Record<string, string> | null> {
  const wanted = [...new Set(ladder.settings.divisions.map((d) => roleName(d.name)))];
  const ids = { ...ladder.settings.roles.ids };
  const existing = await compRest<{ id: string; name: string }[]>("GET", `/guilds/${ladder.guildId}/roles`);
  if (!existing.ok) return null;
  const present = new Set(existing.data.map((r) => r.id));
  let changed = false;
  for (const name of wanted) {
    if (ids[name] && present.has(ids[name])) continue;
    const same = existing.data.find((r) => r.name === name);
    if (same) { ids[name] = same.id; changed = true; continue; }
    const made = await compRest<{ id: string }>("POST", `/guilds/${ladder.guildId}/roles`, { name, color: colorInt(divisionLook(name).c2), mentionable: false, hoist: false });
    if (!made.ok) return null;
    ids[name] = made.data.id;
    changed = true;
  }
  if (changed) await db().from("ladders").update({ settings: { ...ladder.settings, roles: { ...ladder.settings.roles, ids } } }).eq("id", ladder.id);
  return ids;
}

/** Sets each player's division role (and takes off the lounge's other division roles). */
export async function syncRoles(ladder: Ladder, players: { discordId: string; division: string }[]): Promise<RolesResult> {
  if (!ladder.settings.roles.on) return { ok: false, error: "off" };
  if (!players.length) return { ok: true, changed: 0 };
  const ids = await ensureRoles(ladder);
  if (!ids) return { ok: false, error: "no_access" };
  const ours = new Set(Object.values(ids));
  let changed = 0;
  for (const p of players) {
    const member = await compRest<{ roles: string[] }>("GET", `/guilds/${ladder.guildId}/members/${p.discordId}`);
    if (!member.ok) continue;
    const want = p.division === "Placement" ? null : ids[roleName(p.division)] ?? null;
    for (const role of member.data.roles) {
      if (ours.has(role) && role !== want) { const r = await compRest("DELETE", `/guilds/${ladder.guildId}/members/${p.discordId}/roles/${role}`); if (r.ok) changed++; else if (r.status === 403) return { ok: false, error: "no_access" }; }
    }
    if (want && !member.data.roles.includes(want)) {
      const r = await compRest("PUT", `/guilds/${ladder.guildId}/members/${p.discordId}/roles/${want}`);
      if (r.ok) changed++; else if (r.status === 403) return { ok: false, error: "no_access" };
    }
  }
  return { ok: true, changed };
}

/** Each named player's division right now, for the ones tied to a Discord account. */
export async function divisionsFor(ladder: Ladder, playerIds: string[]): Promise<{ discordId: string; division: string }[]> {
  if (!playerIds.length) return [];
  const [{ data: players }, { data: ratings }] = await Promise.all([
    db().from("ladder_players").select("id, discord_id").in("id", playerIds).not("discord_id", "is", null),
    db().from("ladder_ratings").select("player_id, mmr, events, carried").eq("ladder_id", ladder.id).eq("season", ladder.season).in("player_id", playerIds),
  ]);
  const rating = new Map(((ratings ?? []) as { player_id: string; mmr: number; events: number; carried: boolean | null }[]).map((r) => [r.player_id, r]));
  return ((players ?? []) as { id: string; discord_id: string }[]).map((p) => {
    const r = rating.get(p.id);
    return { discordId: p.discord_id, division: r ? divisionFor(r.mmr, placedEvents(r, ladder.settings), ladder.settings).division : "Placement" };
  });
}

/** After anything that moves MMR: the named players' roles. Quiet when the lounge has roles off. */
export async function rolesAfter(ladder: Ladder, playerIds: string[]): Promise<void> {
  if (!ladder.settings.roles.on || !playerIds.length) return;
  await syncRoles(ladder, await divisionsFor(ladder, playerIds)).catch((err) => console.error("[ranked] roles failed:", err));
}

/** Staff's "Sync everyone now": every player tied to a Discord account. */
export async function syncAllRoles(ladder: Ladder): Promise<RolesResult> {
  if (!ladder.settings.roles.on) return { ok: false, error: "off" };
  const { data } = await readAllPages<{ id: string }>((from, to) => db().from("ladder_players").select("id").eq("ladder_id", ladder.id).not("discord_id", "is", null).order("id").range(from, to));
  const ids = data.map((p) => p.id);
  const all: { discordId: string; division: string }[] = [];
  for (let i = 0; i < ids.length; i += 150) all.push(...(await divisionsFor(ladder, ids.slice(i, i + 150))));
  return syncRoles(ladder, all);
}
