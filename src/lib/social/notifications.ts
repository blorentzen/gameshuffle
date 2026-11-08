import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import type { GsNotificationType } from "@/lib/social/notificationTypes";
import { groupOf, readNotifPrefs } from "@/lib/social/notificationGroups";
import { fanOut } from "@/lib/social/notifyChannels";

export interface NotifActor {
  name: string;
  username: string | null;
  avatar: string | null;
}

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  message: string | null;
  link: string | null;
  read: boolean;
  createdAt: string;
  actor: NotifActor | null;
  data: Record<string, unknown> | null;
}

export async function createNotification(args: {
  userId: string;
  type: GsNotificationType;
  title: string;
  message?: string | null;
  actorUserId?: string | null;
  link?: string | null;
  data?: Record<string, unknown> | null;
  /** The caller emails this person itself (organizer messages), so the Email column adds no second email. */
  skipEmail?: boolean;
}): Promise<void> {
  // Never notify yourself.
  if (!args.userId || args.userId === args.actorUserId) return;
  const admin = createServiceClient();
  // "commented on your post": the person goes in front, on site and in the email and Discord copies (2026-11-08).
  if (args.actorUserId && needsName(args.title)) args = { ...args, title: `${await actorName(args.actorUserId)} ${args.title}` };
  // Settings ▸ Notifications: each group reaches someone On site, by Email and on Discord, each on its own switch.
  // Account and moderation notices have no group, so they always go through on site. A read error (or the column
  // not there yet) means the defaults.
  const group = groupOf(args.type);
  if (group) {
    const { data } = await admin.from("users").select("notification_prefs").eq("id", args.userId).maybeSingle();
    const prefs = readNotifPrefs((data as { notification_prefs?: unknown } | null)?.notification_prefs);
    fanOut({ userId: args.userId, type: args.type, title: args.title, message: args.message, link: args.link, skipEmail: args.skipEmail }, prefs);
    if (prefs.muted.includes(group)) return;
  }
  await admin.from("notifications").insert({
    user_id: args.userId,
    type: args.type,
    title: args.title,
    message: args.message ?? null,
    actor_user_id: args.actorUserId ?? null,
    link: args.link ?? null,
    data: args.data ?? null,
  });
}

/** A title written as an action ("commented on your post", "mentioned you in a comment") needs the person's name. */
function needsName(title: string): boolean {
  return /^[a-z]/.test(title);
}

async function actorName(userId: string): Promise<string> {
  const { data } = await createServiceClient().from("users").select("display_name, username").eq("id", userId).maybeSingle();
  const r = data as { display_name: string | null; username: string | null } | null;
  return r?.display_name || r?.username || "Someone";
}

export async function unreadCount(userId: string): Promise<number> {
  const admin = createServiceClient();
  const { count } = await admin
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("read", false);
  return count ?? 0;
}

interface NotifRow {
  id: string;
  type: string;
  title: string;
  message: string | null;
  link: string | null;
  read: boolean;
  created_at: string;
  actor_user_id: string | null;
  data: Record<string, unknown> | null;
}

export async function listNotifications(userId: string, limit = 30): Promise<AppNotification[]> {
  const admin = createServiceClient();
  const { data } = await admin
    .from("notifications")
    .select("id, type, title, message, link, read, created_at, actor_user_id, data")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  const rows = (data ?? []) as NotifRow[];

  const actorIds = [...new Set(rows.map((r) => r.actor_user_id).filter((x): x is string => !!x))];
  const actors = new Map<
    string,
    { display_name: string | null; username: string | null; discord_avatar: string | null; twitch_avatar: string | null }
  >();
  if (actorIds.length) {
    const { data: users } = await admin
      .from("users")
      .select("id, display_name, username, discord_avatar, twitch_avatar")
      .in("id", actorIds);
    for (const u of (users ?? []) as Array<{ id: string } & Record<string, string | null>>) {
      actors.set(u.id, {
        display_name: u.display_name,
        username: u.username,
        discord_avatar: u.discord_avatar,
        twitch_avatar: u.twitch_avatar,
      });
    }
  }

  return rows.map((r) => {
    const a = r.actor_user_id ? actors.get(r.actor_user_id) : null;
    return {
      id: r.id,
      type: r.type,
      // Alerts saved before names went into the title (2026-11-08) get theirs here.
      title: a && needsName(r.title) ? `${a.display_name || a.username || "Someone"} ${r.title}` : r.title,
      message: r.message,
      link: r.link,
      read: r.read,
      createdAt: r.created_at,
      actor: a
        ? {
            name: a.display_name || a.username || "Someone",
            username: a.username,
            avatar: a.discord_avatar || a.twitch_avatar || null,
          }
        : null,
      data: r.data,
    };
  });
}

export async function markAllRead(userId: string): Promise<void> {
  const admin = createServiceClient();
  await admin
    .from("notifications")
    .update({ read: true })
    .eq("user_id", userId)
    .eq("read", false);
}

export async function markRead(userId: string, id: string): Promise<void> {
  const admin = createServiceClient();
  await admin.from("notifications").update({ read: true }).eq("user_id", userId).eq("id", id);
}
