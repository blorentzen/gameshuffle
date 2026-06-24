import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";

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
  type: string;
  title: string;
  message?: string | null;
  actorUserId?: string | null;
  link?: string | null;
  data?: Record<string, unknown> | null;
}): Promise<void> {
  // Never notify yourself.
  if (!args.userId || args.userId === args.actorUserId) return;
  const admin = createServiceClient();
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
      title: r.title,
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
