"use client";

/**
 * Comms Center (/comms) — unifies notifications (Alerts, incl. game/crew
 * invites with Accept/Decline) and direct/crew messages (Messages) under one
 * page, reached from the user menu. Shares useNotifications + useMessaging.
 */

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { NotificationList, Chat, Tabs, Button } from "@empac/cascadeds";
import { IconPencilPlus } from "@tabler/icons-react";
import { useNotifications } from "@/lib/social/useNotifications";
import { useMessaging } from "@/lib/social/useMessaging";
import { NewConversationModal } from "./NewConversationModal";

type Tab = "alerts" | "messages";

export function CommsCenter() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pickerOpen, setPickerOpen] = useState(false);
  // URL is the source of truth, so the navbar bell/messages icons (which just
  // change ?tab=) switch tabs even when we're already on /comms — a useState
  // initializer would only read the param once, on mount.
  const tab: Tab = searchParams.get("tab") === "messages" ? "messages" : "alerts";
  const conversationParam = searchParams.get("c");

  const notifs = useNotifications();
  const msgs = useMessaging();

  // Open the conversation named by ?c= (re-runs if it changes). Only
  // conversationParam should retrigger this — not msgs identity.
  useEffect(() => {
    if (conversationParam) msgs.setActiveId(conversationParam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationParam]);

  // Mark alerts read while viewing the Alerts tab.
  useEffect(() => {
    if (tab === "alerts" && notifs.unread > 0) notifs.markAllRead();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, notifs.unread]);

  if (!notifs.user) return null;

  function switchTab(t: Tab) {
    router.replace(`/comms?tab=${t}`);
  }
  function selectConv(id: string) {
    msgs.setActiveId(id);
    router.replace(`/comms?tab=messages&c=${id}`);
  }
  // Start (or resurface) a DM with the picked user, then open it — same flow as
  // the bottom-right Messenger panel.
  async function startConversation(toUserId: string) {
    const res = await fetch("/api/messages/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toUserId }),
    });
    const data = (await res.json().catch(() => null)) as { id?: string } | null;
    if (res.ok && data?.id) {
      await msgs.reload();
      selectConv(data.id);
    }
    setPickerOpen(false);
  }

  const tabs = [
    {
      id: "alerts",
      label: "Alerts",
      badge: notifs.unread > 0 ? notifs.unread : undefined,
      content: (
        <NotificationList
          notifications={notifs.items}
          onNotificationClick={(n) => {
            if (n.href) router.push(n.href);
          }}
          emptyMessage="No notifications yet."
        />
      ),
    },
    {
      id: "messages",
      label: "Messages",
      badge: msgs.unreadTotal > 0 ? msgs.unreadTotal : undefined,
      content: (
        <div className="comms-center__messages">
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
            variant="embedded"
            conversations={msgs.chatConversations}
            activeConversationId={msgs.activeId}
            messages={msgs.chatMessages}
            currentUser={{ id: notifs.user.id, name: "You" }}
            typingIndicator={msgs.typingIndicator}
            onTyping={msgs.onTyping}
            onConversationSelect={selectConv}
            onSendMessage={(cid, content) => void msgs.send(cid, content)}
            onNewConversation={() => setPickerOpen(true)}
            inputPlaceholder="Write a message…"
            emptyState={
              <p style={{ padding: "2rem", textAlign: "center", color: "var(--text-secondary)" }}>
                No conversations yet. Hit “New message” to start one.
              </p>
            }
          />
        </div>
      ),
    },
  ];

  return (
    <div className="comms-center">
      <header className="comms-center__head">
        <h1 className="comms-center__title">Comms Center</h1>
      </header>
      <Tabs
        className="comms-center__tabs"
        tabs={tabs}
        activeTab={tab}
        onChange={(id) => switchTab(id as Tab)}
        variant="underline"
      />
      <NewConversationModal
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={(id) => void startConversation(id)}
      />
    </div>
  );
}
