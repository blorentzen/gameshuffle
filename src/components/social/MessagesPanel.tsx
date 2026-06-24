"use client";

/**
 * Floating messages panel — a chat-bubble icon in the navbar (with unread
 * badge) that toggles a corner ChatPanel (CDS) holding the full inbox +
 * thread. Shares the useMessaging hook with the /messages page. Renders
 * nothing for signed-out users.
 */

import { useState } from "react";
import { Chat, ChatPanel } from "@empac/cascadeds";
import { useMessaging } from "@/lib/social/useMessaging";

const ChatIcon = () => (
  <svg
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
  </svg>
);

export function MessagesPanel() {
  const [open, setOpen] = useState(false);
  const { user, chatConversations, chatMessages, activeId, setActiveId, send, unreadTotal } =
    useMessaging();

  if (!user) return null;

  return (
    <>
      <button
        type="button"
        className="messages-trigger"
        aria-label={`Messages${unreadTotal > 0 ? ` (${unreadTotal} unread)` : ""}`}
        onClick={() => setOpen((o) => !o)}
      >
        <ChatIcon />
        {unreadTotal > 0 && (
          <span className="messages-trigger__badge">{unreadTotal > 99 ? "99+" : unreadTotal}</span>
        )}
      </button>

      <ChatPanel
        isOpen={open}
        onClose={() => setOpen(false)}
        title="Messages"
        position="bottom-right"
        unreadCount={unreadTotal}
      >
        <Chat
          variant="panel"
          conversations={chatConversations}
          activeConversationId={activeId}
          messages={chatMessages}
          currentUser={{ id: user.id, name: "You" }}
          onConversationSelect={setActiveId}
          onSendMessage={(cid, content) => void send(cid, content)}
          onBack={() => setActiveId(null)}
          inputPlaceholder="Write a message…"
          emptyState={
            <p style={{ padding: "1.5rem", textAlign: "center", color: "var(--text-secondary)" }}>
              No conversations yet. Visit a profile and hit Message.
            </p>
          }
        />
      </ChatPanel>
    </>
  );
}
