import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { isBlocked } from "@/lib/moderation/blocks";
import { createNotification } from "@/lib/social/notifications";

const ONLINE_MS = 5 * 60 * 1000;
const MAX_BODY = 4000;

function pair(a: string, b: string): [string, string] {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  return x < y ? [x, y] : [y, x];
}

export interface InboxConversation {
  id: string;
  other: {
    id: string;
    name: string;
    username: string | null;
    avatar: string | null;
    isOnline: boolean;
  };
  lastMessage: { content: string; timestamp: string; senderId: string } | null;
  unreadCount: number;
}

export interface DirectMessage {
  id: string;
  senderId: string;
  body: string;
  createdAt: string;
}

export async function getOrCreateConversation(
  userId: string,
  otherId: string,
): Promise<{ ok: boolean; id?: string; reason?: string }> {
  if (!otherId || userId === otherId) return { ok: false, reason: "invalid" };
  if (await isBlocked(userId, otherId)) return { ok: false, reason: "blocked" };
  const [lo, hi] = pair(userId, otherId);
  const admin = createServiceClient();
  const { data: existing } = await admin
    .from("conversations")
    .select("id")
    .eq("user_lo", lo)
    .eq("user_hi", hi)
    .maybeSingle();
  if (existing) return { ok: true, id: existing.id as string };
  const { data: created } = await admin
    .from("conversations")
    .insert({ user_lo: lo, user_hi: hi })
    .select("id")
    .single();
  return { ok: true, id: created?.id as string };
}

interface ConvRow {
  id: string;
  user_lo: string;
  user_hi: string;
  last_message_at: string | null;
}

export async function listConversations(userId: string): Promise<InboxConversation[]> {
  const admin = createServiceClient();
  const { data: convs } = await admin
    .from("conversations")
    .select("id, user_lo, user_hi, last_message_at")
    .or(`user_lo.eq.${userId},user_hi.eq.${userId}`)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(100);
  const list = (convs ?? []) as ConvRow[];
  if (!list.length) return [];

  const otherIds = list.map((c) => (c.user_lo === userId ? c.user_hi : c.user_lo));
  const { data: users } = await admin
    .from("users")
    .select("id, display_name, username, discord_avatar, twitch_avatar, last_seen_at")
    .in("id", otherIds);
  const byId = new Map(
    ((users ?? []) as Array<Record<string, string | null> & { id: string }>).map((u) => [u.id, u]),
  );

  const result: InboxConversation[] = [];
  for (const c of list) {
    const otherId = c.user_lo === userId ? c.user_hi : c.user_lo;
    const u = byId.get(otherId);
    const [{ data: lastMsg }, { count: unread }] = await Promise.all([
      admin
        .from("messages")
        .select("body, created_at, sender_user_id")
        .eq("conversation_id", c.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("conversation_id", c.id)
        .neq("sender_user_id", userId)
        .is("read_at", null),
    ]);
    const lastSeen = u?.last_seen_at ?? null;
    result.push({
      id: c.id,
      other: {
        id: otherId,
        name: u?.display_name || u?.username || "User",
        username: (u?.username as string | null) ?? null,
        avatar: u?.discord_avatar || u?.twitch_avatar || null,
        isOnline: !!lastSeen && Date.now() - new Date(lastSeen).getTime() < ONLINE_MS,
      },
      lastMessage: lastMsg
        ? {
            content: lastMsg.body as string,
            timestamp: lastMsg.created_at as string,
            senderId: lastMsg.sender_user_id as string,
          }
        : null,
      unreadCount: unread ?? 0,
    });
  }
  return result;
}

async function conversationMembers(
  conversationId: string,
): Promise<{ lo: string; hi: string } | null> {
  const admin = createServiceClient();
  const { data } = await admin
    .from("conversations")
    .select("user_lo, user_hi")
    .eq("id", conversationId)
    .maybeSingle();
  return data ? { lo: data.user_lo as string, hi: data.user_hi as string } : null;
}

export async function getMessages(
  conversationId: string,
  userId: string,
): Promise<{ ok: boolean; messages?: DirectMessage[] }> {
  const members = await conversationMembers(conversationId);
  if (!members || (members.lo !== userId && members.hi !== userId)) return { ok: false };
  const admin = createServiceClient();
  const { data } = await admin
    .from("messages")
    .select("id, sender_user_id, body, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(200);
  // Mark the other party's messages read.
  await admin
    .from("messages")
    .update({ read_at: new Date().toISOString() })
    .eq("conversation_id", conversationId)
    .neq("sender_user_id", userId)
    .is("read_at", null);
  // Clear the DM ping for this conversation.
  await admin
    .from("notifications")
    .update({ read: true })
    .eq("user_id", userId)
    .eq("type", "message")
    .eq("read", false)
    .eq("link", `/messages?c=${conversationId}`);
  const messages = ((data ?? []) as Array<{ id: string; sender_user_id: string; body: string; created_at: string }>).map(
    (m) => ({ id: m.id, senderId: m.sender_user_id, body: m.body, createdAt: m.created_at }),
  );
  return { ok: true, messages };
}

export async function sendMessage(
  conversationId: string,
  senderId: string,
  body: string,
): Promise<{ ok: boolean; reason?: string; message?: DirectMessage }> {
  const trimmed = body.trim().slice(0, MAX_BODY);
  if (!trimmed) return { ok: false, reason: "empty" };
  const members = await conversationMembers(conversationId);
  if (!members || (members.lo !== senderId && members.hi !== senderId)) {
    return { ok: false, reason: "forbidden" };
  }
  const otherId = members.lo === senderId ? members.hi : members.lo;
  if (await isBlocked(senderId, otherId)) return { ok: false, reason: "blocked" };

  const admin = createServiceClient();
  const { data: msg } = await admin
    .from("messages")
    .insert({ conversation_id: conversationId, sender_user_id: senderId, body: trimmed })
    .select("id, sender_user_id, body, created_at")
    .single();
  await admin
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", conversationId);

  // Deduped DM ping — one unread notification per conversation until read.
  const link = `/messages?c=${conversationId}`;
  const { data: existingPing } = await admin
    .from("notifications")
    .select("id")
    .eq("user_id", otherId)
    .eq("type", "message")
    .eq("read", false)
    .eq("link", link)
    .maybeSingle();
  if (!existingPing) {
    const { data: s } = await admin
      .from("users")
      .select("display_name, username")
      .eq("id", senderId)
      .maybeSingle();
    const senderName =
      (s?.display_name as string | null) || (s?.username as string | null) || "Someone";
    await createNotification({
      userId: otherId,
      type: "message",
      title: `${senderName} sent you a message`,
      actorUserId: senderId,
      link,
      data: { conversationId },
    });
  }

  return {
    ok: true,
    message: msg
      ? { id: msg.id as string, senderId: msg.sender_user_id as string, body: msg.body as string, createdAt: msg.created_at as string }
      : undefined,
  };
}
