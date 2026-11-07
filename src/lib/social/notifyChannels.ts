import "server-only";

/**
 * Email and Discord for notifications (Settings ▸ Notifications, journeys picks 2026-11-06, 8A). createNotification
 * puts the row on the bell, then `fanOut` sends the same title, line and link by email and as a message from the
 * GameShuffle bot, each only when that column is on for the row's group. Both run after the response (`after`), are
 * capped per person and group (so a busy comment thread is a few emails, not fifty), and never throw.
 *
 * Outside production nothing reaches a real person: email already only logs (mailersend.ts), and Discord messages log
 * too unless ALLOW_NONPROD_DISCORD_DM=true.
 *
 * Types that send their own email (reminders, the lounge report) ask `emailAllowed` before sending it, so the Email
 * column decides those too and they never arrive twice.
 */

import { after } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { getBaseUrl, isProduction } from "@/lib/env";
import { rateLimit } from "@/lib/ratelimit";
import { botTokenFor } from "@/lib/discord/apps";
import { sendNotificationEmail } from "@/lib/email/notification";
import { NOTIFICATION_GROUPS, OWN_EMAIL_TYPES, channelOn, groupOf, readNotifPrefs, type NotifPrefs } from "./notificationGroups";

const EMAILS_PER_HOUR = 6;
const DMS_PER_HOUR = 12;
/** After the bot couldn't reach someone, wait a day before trying again. */
const BLOCKED_RETRY_MS = 24 * 3600_000;

export async function prefsFor(userId: string): Promise<NotifPrefs> {
  const { data } = await createServiceClient().from("users").select("notification_prefs").eq("id", userId).maybeSingle();
  return readNotifPrefs((data as { notification_prefs?: unknown } | null)?.notification_prefs);
}

/** Whether a type with its own email may email this account. Guests (no account) always may: it's their only way. */
export async function emailAllowed(userId: string | null | undefined, type: string): Promise<boolean> {
  if (!userId) return true;
  const group = groupOf(type);
  if (!group) return true;
  return channelOn(await prefsFor(userId), group, "email");
}

/** The same for many accounts at once: the ones whose Email column is on for this type. */
export async function emailAllowedAmong(userIds: string[], type: string): Promise<Set<string>> {
  const group = groupOf(type);
  if (!group || !userIds.length) return new Set(userIds);
  const { data } = await createServiceClient().from("users").select("id, notification_prefs").in("id", userIds);
  const ok = new Set<string>();
  for (const r of (data ?? []) as { id: string; notification_prefs: unknown }[]) {
    if (channelOn(readNotifPrefs(r.notification_prefs), group, "email")) ok.add(r.id);
  }
  return ok;
}

/** Run after the response when there is one (route handlers, server actions), else straight away (scripts). */
function later(fn: () => Promise<void>) {
  const run = () => fn().catch((e) => console.error("[notify] delivery failed:", e));
  try { after(run); } catch { void run(); }
}

export interface FanOutArgs {
  userId: string;
  type: string;
  title: string;
  message?: string | null;
  link?: string | null;
  /** The caller sends its own email (organizer messages). */
  skipEmail?: boolean;
}

export function fanOut(args: FanOutArgs, prefs: NotifPrefs) {
  const group = groupOf(args.type);
  if (!group) return;
  const email = !args.skipEmail && !OWN_EMAIL_TYPES.has(args.type) && channelOn(prefs, group, "email");
  const blocked = prefs.discordBlockedAt && Date.now() - Date.parse(prefs.discordBlockedAt) < BLOCKED_RETRY_MS;
  const discord = channelOn(prefs, group, "discord") && !blocked;
  if (!email && !discord) return;
  const label = NOTIFICATION_GROUPS.find((g) => g.id === group)?.label ?? "this kind of news";
  later(async () => {
    const base = getBaseUrl();
    const url = args.link ? (args.link.startsWith("http") ? args.link : `${base}${args.link}`) : null;
    if (email && (await rateLimit(`notif:e:${args.userId}:${group}`, { max: EMAILS_PER_HOUR, windowMs: 3600_000 })).ok) {
      const { data } = await createServiceClient().from("user_directory").select("email, display_name").eq("id", args.userId).maybeSingle();
      const row = data as { email: string | null; display_name: string | null } | null;
      if (row?.email) {
        await sendNotificationEmail({ to: row.email, toName: row.display_name, title: args.title, message: args.message, url, groupLabel: label.toLowerCase(), settingsUrl: `${base}/settings/notifications` });
      }
    }
    if (discord && (await rateLimit(`notif:d:${args.userId}:${group}`, { max: DMS_PER_HOUR, windowMs: 3600_000 })).ok) {
      await sendDiscordDm(args.userId, { title: args.title, message: args.message ?? null, url });
    }
  });
}

async function discordRest<T>(token: string, path: string, body: unknown): Promise<{ ok: true; data: T } | { ok: false; status: number }> {
  const res = await fetch(`https://discord.com/api/v10${path}`, {
    method: "POST",
    headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => null);
  if (!res) return { ok: false, status: 0 };
  if (!res.ok) return { ok: false, status: res.status };
  return { ok: true, data: (await res.json().catch(() => ({}))) as T };
}

/** A message from the GameShuffle bot. Discord only lets it through when the person shares a server with the bot and
 *  allows messages from server members; when it can't, the account is marked so Settings can say so. */
async function sendDiscordDm(userId: string, n: { title: string; message: string | null; url: string | null }) {
  const svc = createServiceClient();
  const { data } = await svc.from("users").select("discord_id, notification_prefs").eq("id", userId).maybeSingle();
  const row = data as { discord_id: string | null; notification_prefs: unknown } | null;
  if (!row?.discord_id) return;
  const body = {
    embeds: [{ title: n.title.slice(0, 250), description: n.message?.slice(0, 1000) ?? undefined, url: n.url ?? undefined, color: 0x3b5bdb }],
    components: n.url ? [{ type: 1, components: [{ type: 2, style: 5, label: "Open on GameShuffle", url: n.url }] }] : [],
    allowed_mentions: { parse: [] },
  };
  if (!isProduction && process.env.ALLOW_NONPROD_DISCORD_DM !== "true") {
    console.log("[notify:non-prod] would message on Discord:", { userId, title: n.title });
    return;
  }
  const token = botTokenFor("main");
  if (!token) return;
  const dm = await discordRest<{ id: string }>(token, "/users/@me/channels", { recipient_id: row.discord_id });
  const sent = dm.ok ? await discordRest(token, `/channels/${dm.data.id}/messages`, body) : dm;
  if (!sent.ok && (sent.status === 403 || sent.status === 400)) {
    const prefs = (row.notification_prefs && typeof row.notification_prefs === "object" ? row.notification_prefs : {}) as Record<string, unknown>;
    await svc.from("users").update({ notification_prefs: { ...prefs, discordBlockedAt: new Date().toISOString() } }).eq("id", userId);
  }
}
