"use client";

/**
 * Direct messages surface (/messages) — CDS Chat (inbox + thread). Loads the
 * conversation list, the active thread, and subscribes to realtime inserts on
 * the open conversation. Block enforcement lives server-side.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Chat, type ChatConversationData, type ChatMessageData } from "@empac/cascadeds";
import { useAuth } from "@/components/auth/AuthProvider";
import { createClient } from "@/lib/supabase/client";

interface ApiConv {
  id: string;
  other: { id: string; name: string; username: string | null; avatar: string | null; isOnline: boolean };
  lastMessage: { content: string; timestamp: string; senderId: string } | null;
  unreadCount: number;
}
interface ApiMsg {
  id: string;
  senderId: string;
  body: string;
  createdAt: string;
}

export function MessagesClient() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [convs, setConvs] = useState<ApiConv[]>([]);
  const [activeId, setActiveId] = useState<string | null>(searchParams.get("c"));
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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadConvs();
  }, [loadConvs]);

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

  function selectConv(id: string) {
    setActiveId(id);
    router.replace(`/messages?c=${id}`);
  }

  async function send(conversationId: string, content: string) {
    const res = await fetch(`/api/messages/${conversationId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: content }),
    });
    if (res.ok) {
      void loadMessages(conversationId);
      void loadConvs();
    }
  }

  if (!user) return null;

  const active = convs.find((c) => c.id === activeId) ?? null;

  const chatConvs: ChatConversationData[] = convs.map((c) => ({
    id: c.id,
    participant: {
      id: c.other.id,
      name: c.other.name,
      avatar: c.other.avatar ?? undefined,
      status: c.other.isOnline ? "online" : "offline",
    },
    lastMessage: c.lastMessage
      ? { content: c.lastMessage.content, timestamp: c.lastMessage.timestamp, senderId: c.lastMessage.senderId }
      : undefined,
    unreadCount: c.unreadCount,
  }));

  const chatMessages: ChatMessageData[] = messages.map((m) => ({
    id: m.id,
    content: m.body,
    timestamp: m.createdAt,
    isOwn: m.senderId === user.id,
    sender:
      m.senderId === user.id
        ? { id: user.id, name: "You" }
        : { id: active?.other.id ?? m.senderId, name: active?.other.name ?? "User", avatar: active?.other.avatar ?? undefined },
  }));

  return (
    <Chat
      variant="embedded"
      conversations={chatConvs}
      activeConversationId={activeId}
      messages={chatMessages}
      currentUser={{ id: user.id, name: "You" }}
      onConversationSelect={selectConv}
      onSendMessage={(cid, content) => void send(cid, content)}
      inputPlaceholder="Write a message…"
      emptyState={
        <p style={{ padding: "2rem", textAlign: "center", color: "var(--text-secondary)" }}>
          No conversations yet. Visit someone&rsquo;s profile and hit Message.
        </p>
      }
    />
  );
}
