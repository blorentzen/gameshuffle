import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { isBlocked } from "@/lib/moderation/blocks";
import { createNotification } from "@/lib/social/notifications";

/**
 * Conversations are membership-based (conversation_members) and typed by
 * `kind`: 'dm' (1:1, canonicalized on user_lo/user_hi), or scoped kinds
 * ('crew', 'tcg', …) deduped on (kind, scope_id). DMs are block-aware; the
 * UI (useMessaging) renders DM vs group from `kind` + `members`.
 */

const ONLINE_MS = 5 * 60 * 1000;
const MAX_BODY = 4000;

function pair(a: string, b: string): [string, string] {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  return x < y ? [x, y] : [y, x];
}

export interface MemberProfile {
  id: string;
  name: string;
  username: string | null;
  avatar: string | null;
  isOnline: boolean;
}

export interface InboxConversation {
  id: string;
  kind: string;
  title: string | null;
  /** Members other than the caller (the "who" of the conversation). */
  members: MemberProfile[];
  lastMessage: { content: string; timestamp: string; senderId: string } | null;
  unreadCount: number;
}

export interface DirectMessage {
  id: string;
  senderId: string;
  body: string;
  createdAt: string;
}

async function isMember(conversationId: string, userId: string): Promise<boolean> {
  const admin = createServiceClient();
  const { data } = await admin
    .from("conversation_members")
    .select("user_id")
    .eq("conversation_id", conversationId)
    .eq("user_id", userId)
    .maybeSingle();
  return !!data;
}

async function profilesById(ids: string[]): Promise<Map<string, MemberProfile>> {
  const map = new Map<string, MemberProfile>();
  if (!ids.length) return map;
  const admin = createServiceClient();
  const { data } = await admin
    .from("users")
    .select("id, display_name, username, discord_avatar, twitch_avatar, last_seen_at")
    .in("id", ids);
  for (const u of (data ?? []) as Array<Record<string, string | null> & { id: string }>) {
    const lastSeen = u.last_seen_at;
    map.set(u.id, {
      id: u.id,
      name: u.display_name || u.username || "User",
      username: (u.username as string | null) ?? null,
      avatar: u.discord_avatar || u.twitch_avatar || null,
      isOnline: !!lastSeen && Date.now() - new Date(lastSeen).getTime() < ONLINE_MS,
    });
  }
  return map;
}

/** Get-or-create a 1:1 DM (block-aware). */
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
    .eq("kind", "dm")
    .eq("user_lo", lo)
    .eq("user_hi", hi)
    .maybeSingle();
  if (existing) return { ok: true, id: existing.id as string };
  const { data: created } = await admin
    .from("conversations")
    .insert({ kind: "dm", user_lo: lo, user_hi: hi })
    .select("id")
    .single();
  const id = created?.id as string | undefined;
  if (id) {
    await admin.from("conversation_members").insert([
      { conversation_id: id, user_id: lo },
      { conversation_id: id, user_id: hi },
    ]);
  }
  return { ok: true, id };
}

/**
 * Get-or-create a scoped group conversation (crew, app, etc.). Deduped on
 * (kind, scope_id); members are upserted. Foundation for crew battles +
 * TCG-companion chat — not yet surfaced in the DM UI.
 */
export async function getOrCreateScopedConversation(args: {
  kind: string;
  scopeId: string;
  title?: string | null;
  memberIds: string[];
}): Promise<{ ok: boolean; id?: string; reason?: string }> {
  if (args.kind === "dm" || !args.scopeId) return { ok: false, reason: "invalid" };
  const admin = createServiceClient();
  const { data: existing } = await admin
    .from("conversations")
    .select("id")
    .eq("kind", args.kind)
    .eq("scope_id", args.scopeId)
    .maybeSingle();
  let id = existing?.id as string | undefined;
  if (!id) {
    const { data: created } = await admin
      .from("conversations")
      .insert({ kind: args.kind, scope_id: args.scopeId, title: args.title ?? null })
      .select("id")
      .single();
    id = created?.id as string | undefined;
  }
  if (id && args.memberIds.length) {
    await admin
      .from("conversation_members")
      .upsert(
        args.memberIds.map((uid) => ({ conversation_id: id as string, user_id: uid })),
        { onConflict: "conversation_id,user_id" },
      );
  }
  return id ? { ok: true, id } : { ok: false, reason: "failed" };
}

export async function listConversations(userId: string): Promise<InboxConversation[]> {
  const admin = createServiceClient();
  const { data: myMemberships } = await admin
    .from("conversation_members")
    .select("conversation_id, last_read_at")
    .eq("user_id", userId);
  const memberships = (myMemberships ?? []) as { conversation_id: string; last_read_at: string | null }[];
  if (!memberships.length) return [];
  const lastReadByConv = new Map(memberships.map((m) => [m.conversation_id, m.last_read_at]));

  const { data: convs } = await admin
    .from("conversations")
    .select("id, kind, title, last_message_at")
    .in("id", memberships.map((m) => m.conversation_id))
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(100);
  const convList = (convs ?? []) as { id: string; kind: string; title: string | null }[];
  if (!convList.length) return [];

  // Other members of each conversation.
  const { data: allMembers } = await admin
    .from("conversation_members")
    .select("conversation_id, user_id")
    .in("conversation_id", convList.map((c) => c.id));
  const othersByConv = new Map<string, string[]>();
  for (const m of (allMembers ?? []) as { conversation_id: string; user_id: string }[]) {
    if (m.user_id === userId) continue;
    const arr = othersByConv.get(m.conversation_id) ?? [];
    arr.push(m.user_id);
    othersByConv.set(m.conversation_id, arr);
  }
  const profiles = await profilesById([...new Set([...othersByConv.values()].flat())]);

  const result: InboxConversation[] = [];
  for (const c of convList) {
    const lastRead = lastReadByConv.get(c.id);
    let unreadQuery = admin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", c.id)
      .neq("sender_user_id", userId);
    if (lastRead) unreadQuery = unreadQuery.gt("created_at", lastRead);
    const [{ data: lastMsg }, { count: unread }] = await Promise.all([
      admin
        .from("messages")
        .select("body, created_at, sender_user_id")
        .eq("conversation_id", c.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      unreadQuery,
    ]);
    result.push({
      id: c.id,
      kind: c.kind,
      title: c.title,
      members: (othersByConv.get(c.id) ?? [])
        .map((id) => profiles.get(id))
        .filter((p): p is MemberProfile => !!p),
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

export async function getMessages(
  conversationId: string,
  userId: string,
): Promise<{ ok: boolean; messages?: DirectMessage[] }> {
  if (!(await isMember(conversationId, userId))) return { ok: false };
  const admin = createServiceClient();
  const { data } = await admin
    .from("messages")
    .select("id, sender_user_id, body, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(200);
  // Mark read (per-member) + clear the DM ping for this conversation.
  await admin
    .from("conversation_members")
    .update({ last_read_at: new Date().toISOString() })
    .eq("conversation_id", conversationId)
    .eq("user_id", userId);
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
  if (!(await isMember(conversationId, senderId))) return { ok: false, reason: "forbidden" };

  const admin = createServiceClient();
  const { data: conv } = await admin
    .from("conversations")
    .select("kind")
    .eq("id", conversationId)
    .maybeSingle();
  const { data: membersRows } = await admin
    .from("conversation_members")
    .select("user_id")
    .eq("conversation_id", conversationId);
  const otherIds = ((membersRows ?? []) as { user_id: string }[])
    .map((m) => m.user_id)
    .filter((id) => id !== senderId);

  // DMs are block-aware (the single other member).
  if (conv?.kind === "dm" && otherIds[0] && (await isBlocked(senderId, otherIds[0]))) {
    return { ok: false, reason: "blocked" };
  }

  const { data: msg } = await admin
    .from("messages")
    .insert({ conversation_id: conversationId, sender_user_id: senderId, body: trimmed })
    .select("id, sender_user_id, body, created_at")
    .single();
  await admin
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", conversationId);

  // Deduped DM ping (one unread notification per conversation until read).
  if (conv?.kind === "dm" && otherIds[0]) {
    const link = `/messages?c=${conversationId}`;
    const { data: existingPing } = await admin
      .from("notifications")
      .select("id")
      .eq("user_id", otherIds[0])
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
        userId: otherIds[0],
        type: "message",
        title: `${senderName} sent you a message`,
        actorUserId: senderId,
        link,
        data: { conversationId },
      });
    }
  }

  return {
    ok: true,
    message: msg
      ? { id: msg.id as string, senderId: msg.sender_user_id as string, body: msg.body as string, createdAt: msg.created_at as string }
      : undefined,
  };
}
