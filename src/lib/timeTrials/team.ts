import "server-only";

/**
 * The time trials review team (picks 2026-11-05, https://claude.ai/artifact/M63s976hfvnrUqsKVUwgts, all as recommended).
 *
 * Two roles, one window: a reviewer (tt_reviewers) checks everything; an updater (tt_updaters) checks one game and
 * items, and someone can be both. Access is given from a player's page (Review access) or the review page's Team tab,
 * which searches any account, time trial players first (5A). Staff and admins give any access; reviewers can give and
 * take away updater access but never make reviewers (3A). Every change is logged with who made it (tt_access_log,
 * time-trials-m6.sql; skipped before it runs), and the person gets a notification and an email saying what they now
 * check (4A). Staff and admins already see everything, so they aren't changed here.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { createNotification } from "@/lib/social/notifications";
import { sendTransactionalEmail } from "@/lib/email/mailersend";
import { accountAvatar, type AccountRow } from "@/lib/discord/faces";
import { SITE_URL } from "@/lib/seo";
import { round3Ready } from "./status";
import { ttReady } from "./store";
import { modeLabel, type Mode } from "./updaters";
import { TT_GAME_ORDER } from "./tracks";
import { ITEMS } from "./categories";

export type Granter = "staff" | "reviewer";

/** Every mode an updater can look after, in the order the window lists them. */
export const ALL_MODES: Mode[] = TT_GAME_ORDER.flatMap((game) => ITEMS.map((i) => ({ game, items: i.id })));
const modeKey = (m: Mode) => `${m.game}|${m.items}`;
const isMode = (m: unknown): m is Mode => !!m && typeof m === "object" && ALL_MODES.some((x) => modeKey(x) === modeKey(m as Mode));

/** Who can give access: staff and admins (anything), time trial reviewers (updaters only), or nobody. */
export async function granterOf(userId: string | null): Promise<Granter | null> {
  if (!userId || !(await ttReady())) return null;
  const db = createServiceClient();
  const [{ data: u }, { data: r }] = await Promise.all([
    db.from("users").select("role").eq("id", userId).maybeSingle(),
    db.from("tt_reviewers").select("user_id").eq("user_id", userId).maybeSingle(),
  ]);
  const role = (u as { role?: string | null } | null)?.role;
  if (role === "staff" || role === "admin") return "staff";
  return r ? "reviewer" : null;
}

export interface TeamPerson {
  userId: string;
  name: string;
  username: string | null;
  avatar: string;
  /** Staff and admins see everything already. */
  staff: boolean;
  reviewer: boolean;
  modes: Mode[];
  /** Times on the boards (search results only). */
  times: number | null;
}

type UserRow = AccountRow & { display_name: string | null; username: string | null; role: string | null; is_public: boolean | null };
const USER_COLS = "id, display_name, username, role, is_public, avatar_source, avatar_seed, avatar_options, discord_avatar, twitch_avatar";

/** Real names here, even for private profiles: only staff and reviewers see this. */
async function peopleFor(ids: string[], times?: Map<string, number>): Promise<TeamPerson[]> {
  if (!ids.length) return [];
  const db = createServiceClient();
  const m4 = await round3Ready();
  const [{ data: users }, { data: revs }, upd] = await Promise.all([
    db.from("users").select(USER_COLS).in("id", ids),
    db.from("tt_reviewers").select("user_id").in("user_id", ids),
    m4 ? db.from("tt_updaters").select("user_id, game, items").in("user_id", ids) : Promise.resolve({ data: [] }),
  ]);
  const reviewers = new Set(((revs ?? []) as { user_id: string }[]).map((r) => r.user_id));
  const modes = new Map<string, Mode[]>();
  for (const r of (upd.data ?? []) as { user_id: string; game: Mode["game"]; items: Mode["items"] }[]) modes.set(r.user_id, [...(modes.get(r.user_id) ?? []), { game: r.game, items: r.items }]);
  const byId = new Map(((users ?? []) as UserRow[]).map((u) => [u.id, u]));
  return ids.filter((id) => byId.has(id)).map((id) => {
    const u = byId.get(id)!;
    const mine = (modes.get(id) ?? []).sort((a, b) => ALL_MODES.findIndex((x) => modeKey(x) === modeKey(a)) - ALL_MODES.findIndex((x) => modeKey(x) === modeKey(b)));
    return { userId: id, name: u.display_name || u.username || "A player", username: u.username, avatar: accountAvatar(u), staff: u.role === "staff" || u.role === "admin", reviewer: reviewers.has(id), modes: mine, times: times ? times.get(id) ?? 0 : null };
  });
}

/** One person's access, for the window. */
export async function accessOf(userId: string): Promise<TeamPerson | null> {
  return (await peopleFor([userId]))[0] ?? null;
}

export interface TeamLogEntry { at: string; who: string; by: string; text: string }

/** Staff and admins, then reviewers, then updaters; and (for staff) the latest changes. */
export async function teamView(granter: Granter): Promise<{ members: TeamPerson[]; log: TeamLogEntry[] | null }> {
  const db = createServiceClient();
  const m4 = await round3Ready();
  const [{ data: staff }, { data: revs }, upd] = await Promise.all([
    db.from("users").select("id").in("role", ["staff", "admin"]).limit(200),
    db.from("tt_reviewers").select("user_id").limit(1000),
    m4 ? db.from("tt_updaters").select("user_id").limit(1000) : Promise.resolve({ data: [] }),
  ]);
  const ids = [...new Set([
    ...((staff ?? []) as { id: string }[]).map((r) => r.id),
    ...((revs ?? []) as { user_id: string }[]).map((r) => r.user_id),
    ...((upd.data ?? []) as { user_id: string }[]).map((r) => r.user_id),
  ])];
  const rank = (p: TeamPerson) => (p.staff ? 0 : p.reviewer ? 1 : 2);
  const members = (await peopleFor(ids)).sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
  return { members, log: granter === "staff" ? await recentChanges() : null };
}

const CHANGE_TEXT: Record<string, (m: Mode | null) => string> = {
  reviewer_added: () => "made a reviewer",
  reviewer_removed: () => "no longer a reviewer",
  updater_added: (m) => `updater for ${m ? modeLabel(m) : "a mode"}`,
  updater_removed: (m) => `no longer updater for ${m ? modeLabel(m) : "a mode"}`,
};

async function recentChanges(limit = 15): Promise<TeamLogEntry[] | null> {
  const db = createServiceClient();
  const { data, error } = await db.from("tt_access_log").select("user_id, by_user, change, game, items, created_at").order("created_at", { ascending: false }).limit(limit);
  if (error) return null; // time-trials-m6.sql not run yet
  const rows = (data ?? []) as { user_id: string; by_user: string | null; change: string; game: Mode["game"] | null; items: Mode["items"] | null; created_at: string }[];
  const ids = [...new Set(rows.flatMap((r) => [r.user_id, r.by_user].filter((x): x is string => !!x)))];
  const { data: users } = ids.length ? await db.from("users").select("id, display_name, username").in("id", ids) : { data: [] };
  const name = new Map(((users ?? []) as { id: string; display_name: string | null; username: string | null }[]).map((u) => [u.id, u.display_name || u.username || "A player"]));
  return rows.map((r) => ({
    at: r.created_at,
    who: name.get(r.user_id) ?? "A player",
    by: r.by_user ? name.get(r.by_user) ?? "Someone" : "Someone",
    text: (CHANGE_TEXT[r.change] ?? (() => r.change))(r.game && r.items ? { game: r.game, items: r.items } : null),
  }));
}

/**
 * Any account by name, @username or linked Discord name, time trial players first, with how many times they've added
 * (5A). Reviewers searching don't see private profiles that have no times on the boards.
 */
export async function searchPeople(q: string, granter: Granter, limit = 8): Promise<TeamPerson[]> {
  const text = q.trim().replace(/^@/, "").replace(/[%_,()*\\]/g, " ").trim();
  if (text.length < 2 || !(await ttReady())) return [];
  const db = createServiceClient();
  const [u, d] = await Promise.all([
    db.from("users").select("id, username, is_public").or(`display_name.ilike.%${text}%,username.ilike.%${text}%,discord_username.ilike.%${text}%`).limit(20),
    // A Discord name the account is linked to through the bot (the name Discord players see on the boards).
    db.from("gs_identities").select("gs_account_id").eq("platform", "discord").not("gs_account_id", "is", null).ilike("display_name", `%${text}%`).limit(10),
  ]);
  const rows = (u.data ?? []) as { id: string; username: string | null; is_public: boolean | null }[];
  const ids = [...new Set([...rows.map((r) => r.id), ...((d.data ?? []) as { gs_account_id: string }[]).map((r) => r.gs_account_id)])].slice(0, 20);
  if (!ids.length) return [];
  // Head counts per account (a few at a time is fine for a staff search, and avoids reading every time row).
  const counts = await Promise.all(ids.map((id) => db.from("tt_times").select("id", { count: "exact", head: true }).eq("player", `u:${id}`).eq("status", "ok").then((r) => [id, r.count ?? 0] as const)));
  const times = new Map(counts);
  const hidden = new Set(rows.filter((r) => r.is_public === false).map((r) => r.id));
  const exact = text.toLowerCase();
  const people = (await peopleFor(ids, times))
    .filter((p) => granter === "staff" || !hidden.has(p.userId) || (p.times ?? 0) > 0)
    .sort((a, b) => Number(b.username === exact) - Number(a.username === exact) || (b.times ?? 0) - (a.times ?? 0) || a.name.localeCompare(b.name));
  return people.slice(0, limit);
}

export type AccessError = "not_allowed" | "self" | "no_user" | "staff" | "staff_only" | "not_ready";

/** Give or take away access. `want` is the whole picture: reviewer or not, and every mode they update. */
export async function setAccess(target: string, want: { reviewer: boolean; modes: unknown[] }, by: string): Promise<{ ok: true; person: TeamPerson; changed: boolean } | { ok: false; error: AccessError }> {
  const granter = await granterOf(by);
  if (!granter) return { ok: false, error: "not_allowed" };
  if (target === by) return { ok: false, error: "self" };
  const now = await accessOf(target);
  if (!now) return { ok: false, error: "no_user" };
  if (now.staff) return { ok: false, error: "staff" };
  if (granter === "reviewer" && want.reviewer !== now.reviewer) return { ok: false, error: "staff_only" };
  const modes = ALL_MODES.filter((m) => want.modes.some((x) => isMode(x) && modeKey(x) === modeKey(m)));
  const had = new Set(now.modes.map(modeKey));
  const keep = new Set(modes.map(modeKey));
  const added = modes.filter((m) => !had.has(modeKey(m)));
  const removed = now.modes.filter((m) => !keep.has(modeKey(m)));
  if ((added.length || removed.length) && !(await round3Ready())) return { ok: false, error: "not_ready" };

  const db = createServiceClient();
  const log: { user_id: string; by_user: string; change: string; game: string | null; items: string | null }[] = [];
  if (want.reviewer && !now.reviewer) {
    await db.from("tt_reviewers").upsert({ user_id: target, added_by: by }, { onConflict: "user_id" });
    log.push({ user_id: target, by_user: by, change: "reviewer_added", game: null, items: null });
  } else if (!want.reviewer && now.reviewer) {
    await db.from("tt_reviewers").delete().eq("user_id", target);
    log.push({ user_id: target, by_user: by, change: "reviewer_removed", game: null, items: null });
  }
  if (added.length) {
    await db.from("tt_updaters").upsert(added.map((m) => ({ user_id: target, game: m.game, items: m.items, added_by: by })), { onConflict: "user_id,game,items", ignoreDuplicates: true });
    for (const m of added) log.push({ user_id: target, by_user: by, change: "updater_added", game: m.game, items: m.items });
  }
  for (const m of removed) {
    await db.from("tt_updaters").delete().eq("user_id", target).eq("game", m.game).eq("items", m.items);
    log.push({ user_id: target, by_user: by, change: "updater_removed", game: m.game, items: m.items });
  }
  const person = { ...now, reviewer: want.reviewer, modes };
  if (!log.length) return { ok: true, person, changed: false };
  const { error } = await db.from("tt_access_log").insert(log);
  if (error && error.code !== "42P01" && error.code !== "PGRST205") console.warn("[tt team] change not logged:", error.message);
  await tellThem(now, person, by);
  return { ok: true, person, changed: true };
}

const listOf = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/** What someone with this access checks, in one sentence. */
export function accessLine(p: Pick<TeamPerson, "reviewer" | "modes">): string {
  if (p.reviewer) return "You check clips, reports, legacy claims and legacy proof in every game.";
  if (!p.modes.length) return "You no longer check time trial clips or reports.";
  const claims = p.modes.some((m) => m.game === "mk8dx" && m.items === "shrooms");
  return `You check clips and reports for ${listOf(p.modes.map(modeLabel))}${claims ? ", and settle legacy claims" : ""}. Every Monday you get that week's list.`;
}

/** The notification and the email (4A): what changed, what they check now, and the way to the queue. */
async function tellThem(before: TeamPerson, after: TeamPerson, by: string): Promise<void> {
  const db = createServiceClient();
  const [{ data: who }, { data: mail }] = await Promise.all([
    db.from("users").select("display_name, username").eq("id", by).maybeSingle(),
    db.from("user_directory").select("email").eq("id", after.userId).maybeSingle(),
  ]);
  const w = who as { display_name: string | null; username: string | null } | null;
  const byName = w?.display_name || w?.username || "The GameShuffle team";
  const hadAny = before.reviewer || before.modes.length > 0;
  const hasAny = after.reviewer || after.modes.length > 0;
  const title = !hadAny ? "You're on the time trials review team" : !hasAny ? "Your time trials review access ended" : "Your time trials review access changed";
  const line = accessLine(after);
  const link = hasAny ? "/time-trials/review" : "/time-trials";
  await createNotification({ userId: after.userId, type: "system", title, message: `${line} ${hasAny ? "The queue is under Reviews on the time trials page." : "Thanks for the help."}`.slice(0, 300), link }).catch(() => undefined);

  const to = (mail as { email?: string | null } | null)?.email;
  if (!to) return;
  const text = hasAny
    ? [
      `Hi ${after.name},`,
      "",
      `${byName} ${hadAny ? "changed your time trials review access" : "added you to the time trials review team"} on GameShuffle.`,
      "",
      line,
      "",
      "How it works:",
      "- Clips: open each clip. If it shows the run, press Clip checks out and the time shows as Verified. If not, press Doesn't match and say why; the player sees your reason.",
      "- Reports: open the ticket, ask the player for proof if you need it, then keep or remove the time with a reason everyone sees.",
      ...(after.reviewer || after.modes.some((m) => m.game === "mk8dx" && m.items === "shrooms") ? ["- Legacy claims: check that the person's link shows the listed name is theirs, then approve or turn it down."] : []),
      "",
      `The queue: ${SITE_URL}/time-trials/review`,
      "You can also reach it from Reviews on the time trials page or Time trial reviews in your account menu.",
    ].join("\n")
    : [
      `Hi ${after.name},`,
      "",
      `${byName} took away your time trials review access on GameShuffle, so the review queue no longer shows for you.`,
      "",
      "Thanks for the help keeping the boards honest.",
    ].join("\n");
  const sent = await sendTransactionalEmail({ to, toName: after.name, subject: title, text });
  if (!sent.ok) console.warn("[tt team] email not sent:", sent.error);
}
