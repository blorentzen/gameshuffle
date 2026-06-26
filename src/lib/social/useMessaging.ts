"use client";

/**
 * Shared DM state/logic for both the /messages page and the floating
 * navbar panel: loads the inbox, the active thread, sends, and subscribes
 * to realtime inserts on the open conversation. Returns CDS-Chat-ready data.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ChatConversationData, ChatMessageData } from "@empac/cascadeds";
import { useAuth } from "@/components/auth/AuthProvider";
import { createClient } from "@/lib/supabase/client";

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

  const loadConvs = useCallback(async () => {
    const res = await fetch("/api/messages", { cache: "no-store" });
    if (res.ok) setConvs(((await res.json()).conversations as ApiConv[]) ?? []);
  }, []);

  const loadMessages = useCallback(async (id: string) => {
    const res = await fetch(`/api/messages/${id}`, { cache: "no-store" });
    if (res.ok) setMessages(((await res.json()).messages as ApiMsg[]) ?? []);
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
    const channel = supabase
      .channel(`messages:${activeId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${activeId}` },
        () => {
          void loadMessages(activeId);
          void loadConvs();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [activeId, user, loadMessages, loadConvs]);

  const setActiveId = useCallback((id: string | null) => setActiveIdState(id), []);

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
        return {
          id: c.id,
          type: isGroup ? "group" : "direct",
          name: isGroup ? c.title || c.members.map((m) => m.name).join(", ") || "Conversation" : undefined,
          participant: primary
            ? {
                id: primary.id,
                name: primary.name,
                avatar: primary.avatar ?? undefined,
                status: primary.isOnline ? "online" : "offline",
              }
            : { id: c.id, name: c.title || "Conversation" },
          participants: isGroup
            ? c.members.map((m) => ({
                id: m.id,
                name: m.name,
                avatar: m.avatar ?? undefined,
                status: m.isOnline ? ("online" as const) : ("offline" as const),
              }))
            : undefined,
          lastMessage: c.lastMessage
            ? { content: c.lastMessage.content, timestamp: c.lastMessage.timestamp, senderId: c.lastMessage.senderId }
            : undefined,
          unreadCount: c.unreadCount,
        };
      }),
    [convs],
  );

  const chatMessages: ChatMessageData[] = useMemo(
    () =>
      messages.map((m) => {
        if (m.senderId === user?.id) {
          return { id: m.id, content: m.body, timestamp: m.createdAt, isOwn: true, sender: { id: user.id, name: "You" } };
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
    [messages, user, active],
  );

  const unreadTotal = useMemo(() => convs.reduce((n, c) => n + (c.unreadCount || 0), 0), [convs]);

  return { user, chatConversations, chatMessages, activeId, setActiveId, send, unreadTotal };
}
