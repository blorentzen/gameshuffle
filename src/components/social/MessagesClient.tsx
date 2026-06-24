"use client";

/**
 * Full-page direct messages (/messages) — the CDS Chat (embedded) driven by
 * the shared useMessaging hook, plus ?c= URL sync. The floating navbar panel
 * (MessagesPanel) shares the same hook.
 */

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Chat } from "@empac/cascadeds";
import { useMessaging } from "@/lib/social/useMessaging";

export function MessagesClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, chatConversations, chatMessages, activeId, setActiveId, send } = useMessaging();

  // Seed the open conversation from ?c= on mount.
  useEffect(() => {
    const c = searchParams.get("c");
    // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/set-state-in-effect
    if (c) setActiveId(c);
  }, []);

  if (!user) return null;

  function selectConv(id: string) {
    setActiveId(id);
    router.replace(`/messages?c=${id}`);
  }

  return (
    <Chat
      variant="embedded"
      conversations={chatConversations}
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
