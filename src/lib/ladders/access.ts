import "server-only";

/**
 * Who may use a lounge's staff page (name, web and docs picks 2026-11-01, https://claude.ai/artifact/EqB2cEaG1D2FLphwWVzaNP,
 * pick 5A): the lounge's own Discord roles, read by the bot from the lounge's server, so staff are managed in one
 * place. The server's owner and anyone who can manage it (Administrator or Manage Server) are admins; the lounge's
 * updater roles are updaters; GameShuffle staff always get in.
 *
 *   admin     everything, settings and season ends included
 *   updater   tables, players, penalties and the log
 *   reporter  submits tables (the reporter roles, or everyone when there are none)
 *   member    in the server, no lounge role
 *   outside   signed out, no Discord linked, or not in the server
 */

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { compRest } from "@/lib/discord/compRest";
import type { Ladder } from "./types";

export type RankedRole = "admin" | "updater" | "reporter" | "member" | "outside";

export interface RankedAccess {
  userId: string | null;
  discordId: string | null;
  name: string;
  role: RankedRole;
  /** Admins and updaters: the staff page. */
  staff: boolean;
  gsStaff: boolean;
  /** Why someone signed in isn't staff, for the page to say. */
  why: "signed_out" | "no_discord" | "not_member" | "no_role" | null;
}

const ADMINISTRATOR = BigInt(8);
const MANAGE_GUILD = BigInt(32);
const ZERO = BigInt(0);

type Guild = { owner_id: string; roles: { id: string; permissions: string }[] };
type Member = { roles: string[]; nick: string | null; user?: { global_name?: string | null; username?: string } };

// The bot's view of a server changes rarely; a member's roles can change any time, so their cache is short.
const guilds = new Map<string, { at: number; guild: Guild | null }>();
const members = new Map<string, { at: number; member: Member | null }>();
const GUILD_MS = 5 * 60_000;
const MEMBER_MS = 60_000;

async function guildOf(id: string): Promise<Guild | null> {
  const hit = guilds.get(id);
  if (hit && Date.now() - hit.at < GUILD_MS) return hit.guild;
  const res = await compRest<Guild>("GET", `/guilds/${id}`);
  const guild = res.ok ? res.data : null;
  if (res.ok || res.status === 404 || res.status === 403) guilds.set(id, { at: Date.now(), guild });
  return guild;
}

async function memberOf(guildId: string, discordId: string): Promise<Member | null> {
  const key = `${guildId}:${discordId}`;
  const hit = members.get(key);
  if (hit && Date.now() - hit.at < MEMBER_MS) return hit.member;
  const res = await compRest<Member>("GET", `/guilds/${guildId}/members/${discordId}`);
  const member = res.ok ? res.data : null;
  if (res.ok || res.status === 404) members.set(key, { at: Date.now(), member });
  return member;
}

/** What a Discord member may do in a lounge, from their roles in its server. */
export async function roleInLounge(ladder: Ladder, discordId: string): Promise<{ role: RankedRole; name: string | null }> {
  const [guild, member] = await Promise.all([guildOf(ladder.guildId), memberOf(ladder.guildId, discordId)]);
  if (!member) return { role: "outside", name: null };
  const name = member.nick || member.user?.global_name || member.user?.username || null;
  if (guild?.owner_id === discordId) return { role: "admin", name };
  let perms = ZERO;
  for (const r of guild?.roles ?? []) {
    if (r.id !== ladder.guildId && !member.roles.includes(r.id)) continue;
    try { perms |= BigInt(r.permissions); } catch { /* a malformed number counts as none */ }
  }
  if ((perms & ADMINISTRATOR) !== ZERO || (perms & MANAGE_GUILD) !== ZERO) return { role: "admin", name };
  if (ladder.updaterRoles.some((r) => member.roles.includes(r))) return { role: "updater", name };
  if (!ladder.reporterRoles.length || ladder.reporterRoles.some((r) => member.roles.includes(r))) return { role: "reporter", name };
  return { role: "member", name };
}

/** The signed-in person's access to a lounge. */
export async function rankedAccess(ladder: Ladder): Promise<RankedAccess> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { userId: null, discordId: null, name: "", role: "outside", staff: false, gsStaff: false, why: "signed_out" };
  const { data } = await createServiceClient().from("users").select("role, discord_id, display_name, username").eq("id", user.id).maybeSingle();
  const row = (data ?? {}) as { role?: string | null; discord_id?: string | null; display_name?: string | null; username?: string | null };
  const gsStaff = row.role === "staff" || row.role === "admin";
  const discordId = row.discord_id ?? null;
  const fallback = row.display_name || row.username || "Staff";
  if (!discordId) {
    return gsStaff
      ? { userId: user.id, discordId: null, name: fallback, role: "admin", staff: true, gsStaff, why: null }
      : { userId: user.id, discordId: null, name: fallback, role: "outside", staff: false, gsStaff, why: "no_discord" };
  }
  const { role, name } = await roleInLounge(ladder, discordId);
  const final: RankedRole = gsStaff ? "admin" : role;
  const staff = final === "admin" || final === "updater";
  return {
    userId: user.id, discordId, name: (name || fallback).slice(0, 32), role: final, staff, gsStaff,
    why: staff ? null : role === "outside" ? "not_member" : "no_role",
  };
}
