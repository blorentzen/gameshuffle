"use client";

/**
 * Shared DM state/logic for both the /messages page and the floating
 * navbar panel: loads the inbox, the active thread, sends, and subscribes
 * to realtime inserts on the open conversation. Returns CDS-Chat-ready data.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ChatConversationData,
  ChatMessageData,
  ChatMessageStatus,
  ChatTypingIndicator,
} from "@empac/cascadeds";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useAuth } from "@/components/auth/AuthProvider";
import { createClient } from "@/lib/supabase/client";

const TYPING_CLEAR_MS = 3000;
const TYPING_THROTTLE_MS = 1500;

interface ApiMember {
  id: string;
  name: string;
  username: string | null;
  avatar: string | null;
  isOnline: boolean;
}
interface ApiConv {
  id: string;
  kind: string;
  title: string | null;
  members: ApiMember[];
  lastMessage: { content: string; timestamp: string; senderId: string } | null;
  unreadCount: number;
}
interface ApiMsg {
  id: string;
  senderId: string;
  body: string;
  createdAt: string;
}

export function useMessaging() {
  const { user } = useAuth();
  const [convs, setConvs] = useState<ApiConv[]>([]);
  const [activeId, setActiveIdState] = useState<string | null>(null);
  const [messages, setMessages] = useState<ApiMsg[]>([]);
  // Earliest last_read_at among the other members → drives "Seen" on own msgs.
  const [readUpTo, setReadUpTo] = useState<string | null>(null);
  // Live signals for the ACTIVE conversation (scoped to its channel).
  const [typingIds, setTypingIds] = useState<string[]>([]);
  const [presentIds, setPresentIds] = useState<string[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const typingTimers = useRef<Map<string, number>>(new Map());
  const lastTypingSent = useRef(0);

  const loadConvs = useCallback(async () => {
    const res = await fetch("/api/messages", { cache: "no-store" });
    if (res.ok) setConvs(((await res.json()).conversations as ApiConv[]) ?? []);
  }, []);

  const loadMessages = useCallback(async (id: string) => {
    const res = await fetch(`/api/messages/${id}`, { cache: "no-store" });
    if (res.ok) {
      const b = (await res.json()) as { messages?: ApiMsg[]; readUpTo?: string | null };
      setMessages(b.messages ?? []);
      setReadUpTo(b.readUpTo ?? null);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadConvs();
  }, [user, loadConvs]);

  useEffect(() => {
    if (!activeId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadMessages(activeId);
  }, [activeId, loadMessages]);

  useEffect(() => {
    if (!activeId || !user) return;
    const supabase = createClient();
    const uid = user.id;
    const channel = supabase.channel(`chat:${activeId}`, {
      config: { presence: { key: uid }, broadcast: { self: false } },
    });
    channelRef.current = channel;
    const timers = typingTimers.current;

    const broadcastRead = () =>
      void channel.send({ type: "broadcast", event: "read", payload: { userId: uid } });

    channel
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${activeId}` },
        () => {
          // A new message arrived while I'm viewing → reload (marks it read) and
          // tell the sender I've seen it.
          void loadMessages(activeId).then(broadcastRead);
          void loadConvs();
        },
      )
      // Someone else opened/read the thread → refresh so my sent msgs show "Seen".
      .on("broadcast", { event: "read" }, () => void loadMessages(activeId))
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        const who = (payload as { userId?: string })?.userId;
        if (!who || who === uid) return;
        setTypingIds((ids) => (ids.includes(who) ? ids : [...ids, who]));
        const prev = timers.get(who);
        if (prev) window.clearTimeout(prev);
        timers.set(
          who,
          window.setTimeout(() => {
            setTypingIds((ids) => ids.filter((x) => x !== who));
            timers.delete(who);
          }, TYPING_CLEAR_MS),
        );
      })
      .on("presence", { event: "sync" }, () => {
        setPresentIds(Object.keys(channel.presenceState()).filter((k) => k !== uid));
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          void channel.track({ online: true });
          broadcastRead();
        }
      });

    return () => {
      channelRef.current = null;
      setTypingIds([]);
      setPresentIds([]);
      timers.forEach((t) => window.clearTimeout(t));
      timers.clear();
      void supabase.removeChannel(channel);
    };
  }, [activeId, user, loadMessages, loadConvs]);

  const setActiveId = useCallback((id: string | null) => setActiveIdState(id), []);

  /** Broadcast that the current user is typing (throttled). */
  const notifyTyping = useCallback(() => {
    const now = Date.now();
    if (now - lastTypingSent.current < TYPING_THROTTLE_MS) return;
    lastTypingSent.current = now;
    const ch = channelRef.current;
    if (ch && user) void ch.send({ type: "broadcast", event: "typing", payload: { userId: user.id } });
  }, [user]);

  const send = useCallback(
    async (conversationId: string, content: string) => {
      const res = await fetch(`/api/messages/${conversationId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: content }),
      });
      if (res.ok) {
        void loadMessages(conversationId);
        void loadConvs();
      }
    },
    [loadConvs, loadMessages],
  );

  const active = convs.find((c) => c.id === activeId) ?? null;

  const chatConversations: ChatConversationData[] = useMemo(
    () =>
      convs.map((c) => {
        const isGroup = c.kind !== "dm";
        const primary = c.members[0];
        // Live presence overrides the coarse last_seen dot for the ACTIVE
        // conversation (that's the channel we're tracking).
        const statusFor = (m: ApiMember): "online" | "offline" =>
          (c.id === activeId && presentIds.includes(m.id)) || m.isOnline ? "online" : "offline";
        return {
          id: c.id,
          type: isGroup ? "group" : "direct",
          name: isGroup ? c.title || c.members.map((m) => m.name).join(", ") || "Conversation" : undefined,
          participant: primary
            ? { id: primary.id, name: primary.name, avatar: primary.avatar ?? undefined, status: statusFor(primary) }
            : { id: c.id, name: c.title || "Conversation" },
          participants: isGroup
            ? c.members.map((m) => ({
                id: m.id,
                name: m.name,
                avatar: m.avatar ?? undefined,
                status: statusFor(m),
              }))
            : undefined,
          lastMessage: c.lastMessage
            ? { content: c.lastMessage.content, timestamp: c.lastMessage.timestamp, senderId: c.lastMessage.senderId }
            : undefined,
          unreadCount: c.unreadCount,
        };
      }),
    [convs, activeId, presentIds],
  );

  const chatMessages: ChatMessageData[] = useMemo(
    () =>
      messages.map((m) => {
        if (m.senderId === user?.id) {
          // "Seen" once every other member has read past this message.
          const status: ChatMessageStatus = readUpTo && m.createdAt <= readUpTo ? "read" : "delivered";
          return { id: m.id, content: m.body, timestamp: m.createdAt, isOwn: true, status, sender: { id: user.id, name: "You" } };
        }
        const member = active?.members.find((mem) => mem.id === m.senderId);
        return {
          id: m.id,
          content: m.body,
          timestamp: m.createdAt,
          isOwn: false,
          sender: { id: m.senderId, name: member?.name ?? "User", avatar: member?.avatar ?? undefined },
        };
      }),
    [messages, user, active, readUpTo],
  );

  // Other members currently typing in the active conversation.
  const typingIndicator: ChatTypingIndicator | undefined = useMemo(() => {
    if (!typingIds.length || !active) return undefined;
    const participants = active.members
      .filter((m) => typingIds.includes(m.id))
      .map((m) => ({ id: m.id, name: m.name, avatar: m.avatar ?? undefined }));
    return participants.length ? { participants } : undefined;
  }, [typingIds, active]);

  const onTyping = useCallback(
    (_conversationId: string, isTyping: boolean) => {
      if (isTyping) notifyTyping();
    },
    [notifyTyping],
  );

  const unreadTotal = useMemo(() => convs.reduce((n, c) => n + (c.unreadCount || 0), 0), [convs]);

  return {
    user,
    chatConversations,
    chatMessages,
    activeId,
    setActiveId,
    send,
    unreadTotal,
    reload: loadConvs,
    typingIndicator,
    onTyping,
  };
}
