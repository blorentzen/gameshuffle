import "server-only";

/**
 * Cans' data (supabase/cans-m1.sql, service role): a server's teams, can checks and answers, each Discord player's
 * time zone, and usual hours. Rules in rules.ts; the bot in src/lib/discord/commands/cans.ts; the War room's tab
 * through /api/activity/cans.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { isFull, isTimeZone, type CanAnswer, type CanRow } from "./rules";

type DbError = { code?: string; message?: string } | null;
const missing = (e: DbError) => !!e && (["42P01", "PGRST205"].includes(e.code ?? "") || /does not exist|schema cache/i.test(e.message ?? ""));

let ready: boolean | null = null;
/** Whether supabase/cans-m1.sql has run (kept once true). */
export async function cansReady(): Promise<boolean> {
  if (ready) return true;
  const { error } = await createServiceClient().from("comp_can_checks").select("id").limit(1);
  ready = !error;
  if (error && !missing(error)) console.error("[cans] ready check:", error);
  return ready;
}

// ── Time zones ──────────────────────────────────────────────────────────────

/** A Discord player's time zone: the one they picked with /cans timezone (or the first-time question), else their
 *  GameShuffle account's when Discord is linked. Null: ask. */
export async function zoneFor(discordId: string): Promise<string | null> {
  const db = createServiceClient();
  const [{ data: acct }, { data: own }] = await Promise.all([
    db.from("users").select("timezone").eq("discord_id", discordId).limit(1).maybeSingle(),
    db.from("comp_user_tz").select("tz").eq("user_id", discordId).maybeSingle(),
  ]);
  const o = (own as { tz: string } | null)?.tz;
  if (isTimeZone(o)) return o;
  const a = (acct as { timezone: string | null } | null)?.timezone;
  return isTimeZone(a) ? a : null;
}

export async function setZone(discordId: string, tz: string): Promise<boolean> {
  if (!isTimeZone(tz)) return false;
  const { error } = await createServiceClient().from("comp_user_tz").upsert({ user_id: discordId, tz, updated_at: new Date().toISOString() });
  return !error;
}

// ── Teams ───────────────────────────────────────────────────────────────────

export interface CanTeam { roleId: string; tag: string | null }

export async function teamsFor(guildId: string): Promise<CanTeam[]> {
  const { data } = await createServiceClient().from("comp_can_teams").select("role_id, tag").eq("guild_id", guildId).order("created_at");
  return ((data ?? []) as { role_id: string; tag: string | null }[]).map((r) => ({ roleId: r.role_id, tag: r.tag }));
}

export async function addTeam(guildId: string, roleId: string, tag: string | null, by: string): Promise<boolean> {
  const { error } = await createServiceClient().from("comp_can_teams").upsert({ guild_id: guildId, role_id: roleId, tag, created_by: by });
  return !error;
}

export async function removeTeam(guildId: string, roleId: string): Promise<boolean> {
  const { error } = await createServiceClient().from("comp_can_teams").delete().eq("guild_id", guildId).eq("role_id", roleId);
  return !error;
}

// ── Checks ──────────────────────────────────────────────────────────────────

export interface CanCheck {
  id: string;
  guildId: string;
  channelId: string;
  messageId: string | null;
  roleId: string | null;
  teamTag: string | null;
  vs: string | null;
  size: number;
  startsAt: string;
  createdBy: string;
  createdByName: string | null;
  status: "open" | "locked" | "cancelled";
  lineup: { players: string[]; subs: string[] } | null;
  lockedAt: string | null;
}

const COLS = "id, guild_id, channel_id, message_id, role_id, team_tag, vs, size, starts_at, created_by, created_by_name, status, lineup, locked_at";
type Raw = { id: string; guild_id: string; channel_id: string; message_id: string | null; role_id: string | null; team_tag: string | null; vs: string | null; size: number; starts_at: string; created_by: string; created_by_name: string | null; status: CanCheck["status"]; lineup: CanCheck["lineup"]; locked_at: string | null };
const fromRaw = (r: Raw): CanCheck => ({
  id: r.id, guildId: r.guild_id, channelId: r.channel_id, messageId: r.message_id, roleId: r.role_id, teamTag: r.team_tag, vs: r.vs, size: r.size,
  startsAt: r.starts_at, createdBy: r.created_by, createdByName: r.created_by_name, status: r.status, lineup: r.lineup, lockedAt: r.locked_at,
});

export async function createCheck(c: { guildId: string; channelId: string; roleId: string | null; teamTag: string | null; vs: string | null; size: number; startsAt: Date; by: string; byName: string }): Promise<CanCheck | null> {
  const { data, error } = await createServiceClient().from("comp_can_checks").insert({
    guild_id: c.guildId, channel_id: c.channelId, role_id: c.roleId, team_tag: c.teamTag, vs: c.vs, size: c.size, starts_at: c.startsAt.toISOString(), created_by: c.by, created_by_name: c.byName,
  }).select(COLS).single();
  if (error) { console.error("[cans] create:", error); return null; }
  return fromRaw(data as unknown as Raw);
}

export async function setMessage(id: string, messageId: string): Promise<void> {
  await createServiceClient().from("comp_can_checks").update({ message_id: messageId }).eq("id", id);
}

export async function checkById(id: string): Promise<CanCheck | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await createServiceClient().from("comp_can_checks").select(COLS).eq("id", id).maybeSingle();
  return data ? fromRaw(data as unknown as Raw) : null;
}

export async function answersFor(id: string): Promise<CanRow[]> {
  const { data } = await createServiceClient().from("comp_can_answers").select("user_id, name, answer, answered_at").eq("check_id", id).order("answered_at");
  return ((data ?? []) as { user_id: string; name: string; answer: CanAnswer; answered_at: string }[]).map((r) => ({ userId: r.user_id, name: r.name, answer: r.answer, at: r.answered_at }));
}

/**
 * An answer (or a change). Moving between Can and Sub keeps your place in line; anything else starts it again.
 * `full` is true for exactly one answer: the one that filled the check (claimed on full_noted_at).
 */
export async function setAnswer(check: CanCheck, userId: string, name: string, answer: CanAnswer): Promise<{ rows: CanRow[]; full: boolean } | "closed"> {
  if (check.status !== "open") return "closed";
  const db = createServiceClient();
  const { data: had } = await db.from("comp_can_answers").select("answer, answered_at").eq("check_id", check.id).eq("user_id", userId).maybeSingle();
  const prev = had as { answer: CanAnswer; answered_at: string } | null;
  const keep = prev && (prev.answer === "can" || prev.answer === "sub") && (answer === "can" || answer === "sub");
  await db.from("comp_can_answers").upsert({ check_id: check.id, user_id: userId, name: name.slice(0, 40), answer, answered_at: keep ? prev!.answered_at : new Date().toISOString() });
  const rows = await answersFor(check.id);
  let full = false;
  if (isFull(rows, check.size)) {
    const { data: claimed } = await db.from("comp_can_checks").update({ full_noted_at: new Date().toISOString() }).eq("id", check.id).is("full_noted_at", null).select("id");
    full = !!claimed?.length;
  }
  return { rows, full };
}

/** Locks the lineup (claimed: one lock). */
export async function lockCheck(check: CanCheck, lineup: { players: string[]; subs: string[] }): Promise<CanCheck | null> {
  const { data } = await createServiceClient().from("comp_can_checks").update({ status: "locked", locked_at: new Date().toISOString(), lineup }).eq("id", check.id).eq("status", "open").select(COLS).maybeSingle();
  return data ? fromRaw(data as unknown as Raw) : null;
}

export async function cancelCheck(check: CanCheck): Promise<CanCheck | null> {
  const { data } = await createServiceClient().from("comp_can_checks").update({ status: "cancelled" }).eq("id", check.id).neq("status", "cancelled").select(COLS).maybeSingle();
  return data ? fromRaw(data as unknown as Raw) : null;
}

/** Players this team has: anyone who answered one of its checks in the last 60 days or set usual hours for it. */
export async function rosterFor(guildId: string, roleId: string | null, channelId: string): Promise<{ userId: string; name: string }[]> {
  const db = createServiceClient();
  const since = new Date(Date.now() - 60 * 86_400_000).toISOString();
  let q = db.from("comp_can_checks").select("id").eq("guild_id", guildId).gte("created_at", since).limit(200);
  q = roleId ? q.eq("role_id", roleId) : q.eq("channel_id", channelId).is("role_id", null);
  const { data: checks } = await q;
  const ids = ((checks ?? []) as { id: string }[]).map((c) => c.id);
  const [{ data: ans }, { data: hours }] = await Promise.all([
    ids.length ? db.from("comp_can_answers").select("user_id, name, answered_at").in("check_id", ids).order("answered_at", { ascending: false }).limit(2000) : Promise.resolve({ data: [] }),
    roleId ? db.from("comp_usual_hours").select("user_id, name").eq("guild_id", guildId).eq("role_id", roleId) : Promise.resolve({ data: [] }),
  ]);
  const out = new Map<string, string>();
  for (const r of (ans ?? []) as { user_id: string; name: string }[]) if (!out.has(r.user_id)) out.set(r.user_id, r.name);
  for (const r of (hours ?? []) as { user_id: string; name: string }[]) if (!out.has(r.user_id)) out.set(r.user_id, r.name);
  return [...out].map(([userId, name]) => ({ userId, name }));
}

/** Locked checks whose war starts within `minutes` and haven't been reminded, claimed one at a time by `claimReminder`. */
export async function remindersDue(minutes: number, now = Date.now()): Promise<CanCheck[]> {
  const { data } = await createServiceClient().from("comp_can_checks").select(COLS)
    .eq("status", "locked").is("reminded_at", null)
    .lte("starts_at", new Date(now + minutes * 60_000).toISOString()).gte("starts_at", new Date(now - 5 * 60_000).toISOString()).limit(100);
  return ((data ?? []) as unknown as Raw[]).map(fromRaw);
}

export async function claimReminder(id: string): Promise<boolean> {
  const { data } = await createServiceClient().from("comp_can_checks").update({ reminded_at: new Date().toISOString() }).eq("id", id).is("reminded_at", null).select("id");
  return !!data?.length;
}

/** The channel's locked lineup for a war starting about now (from an hour before to an hour after), for the War room. */
export async function lineupNow(guildId: string, channelId: string, now = Date.now()): Promise<CanCheck | null> {
  const { data } = await createServiceClient().from("comp_can_checks").select(COLS)
    .eq("guild_id", guildId).eq("channel_id", channelId).eq("status", "locked")
    .gte("starts_at", new Date(now - 60 * 60_000).toISOString()).lte("starts_at", new Date(now + 60 * 60_000).toISOString())
    .order("starts_at").limit(1);
  const r = (data ?? [])[0] as unknown as Raw | undefined;
  return r ? fromRaw(r) : null;
}

// ── Usual hours ─────────────────────────────────────────────────────────────

export async function saveHours(guildId: string, roleId: string, userId: string, name: string, tz: string, slots: number[]): Promise<boolean> {
  const { error } = await createServiceClient().from("comp_usual_hours").upsert({
    guild_id: guildId, role_id: roleId, user_id: userId, name: name.slice(0, 40), tz, hours: slots, updated_at: new Date().toISOString(),
  });
  return !error;
}

export async function hoursFor(guildId: string, roleId: string): Promise<{ userId: string; name: string; slots: number[] }[]> {
  const { data } = await createServiceClient().from("comp_usual_hours").select("user_id, name, hours").eq("guild_id", guildId).eq("role_id", roleId).limit(200);
  return ((data ?? []) as { user_id: string; name: string; hours: number[] }[]).map((r) => ({ userId: r.user_id, name: r.name, slots: r.hours ?? [] }));
}
