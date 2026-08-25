"use client";

/**
 * Bottom-right Messenger (Facebook-style). CDS ChatPanel is the persistent
 * floating container; CDS Chat (panel variant) renders the conversation list +
 * active thread inside it. Floats on every viewport — on mobile the panel
 * becomes a near-full bottom card (CDS + our .messenger-aside styles), matching
 * the desktop floating behavior instead of deep-linking to /comms.
 *
 * Mounted in the app-shell chrome branch (see ConditionalChrome), so it
 * persists across route navigation and never renders on OBS/overlay routes.
 * Data comes from useMessaging (same source as the Comms Center messages tab).
 */

import { useEffect, useState } from "react";
import { ChatPanel, Chat, Button } from "@empac/cascadeds";
import { IconPencilPlus } from "@tabler/icons-react";
import { useMessaging } from "@/lib/social/useMessaging";
import { useMessenger } from "./MessengerProvider";
import { NewConversationModal } from "./NewConversationModal";

export function Messenger() {
  const { open, requestedId, closeMessenger, clearRequested } = useMessenger();
  const {
    user,
    chatConversations,
    chatMessages,
    activeId,
    setActiveId,
    send,
    unreadTotal,
    reload,
    typingIndicator,
    onTyping,
  } = useMessaging();
  const [pickerOpen, setPickerOpen] = useState(false);

  // Start (or resurface) a DM with the picked user, then open it in the panel.
  async function startConversation(toUserId: string) {
    const res = await fetch("/api/messages/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toUserId }),
    });
    const data = (await res.json().catch(() => null)) as { id?: string } | null;
    if (res.ok && data?.id) {
      await reload();
      setActiveId(data.id);
    }
    setPickerOpen(false);
  }

  // Honor a conversation requested from elsewhere (a Message button, a list
  // deep-link), then clear it so re-opening the panel doesn't re-trigger.
  useEffect(() => {
    if (requestedId) {
      setActiveId(requestedId);
      clearRequested();
    }
  }, [requestedId, setActiveId, clearRequested]);

  if (!user) return null;

  return (
    <>
      <ChatPanel
        isOpen={open}
        onClose={closeMessenger}
        title="Messages"
        position="bottom-right"
        unreadCount={unreadTotal}
        className="messenger-aside dark"
      >
        {/* Always-visible compose entry — CDS Chat's own "new" affordance is a
            subtle pencil that's hidden entirely on the empty state (exactly
            when you need it), so we surface an explicit button in the panel. */}
        <div className="messenger__toolbar">
          <Button
            variant="secondary"
            size="small"
            iconBefore={IconPencilPlus}
            onClick={() => setPickerOpen(true)}
          >
            New message
          </Button>
        </div>
        <Chat
          variant="panel"
          showConversationList
          conversations={chatConversations}
          activeConversationId={activeId}
          messages={chatMessages}
          currentUser={{ id: user.id, name: "You" }}
          typingIndicator={typingIndicator}
          onTyping={onTyping}
          onConversationSelect={setActiveId}
          onSendMessage={(cid, content) => void send(cid, content)}
          onNewConversation={() => setPickerOpen(true)}
          onBack={() => setActiveId(null)}
          inputPlaceholder="Write a message…"
          emptyState={
            <p className="messenger__empty">
              No conversations yet. Hit “New message” to start one.
            </p>
          }
        />
      </ChatPanel>
      <NewConversationModal
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={(id) => void startConversation(id)}
      />
    </>
  );
}
