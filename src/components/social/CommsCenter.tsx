"use client";

/**
 * Comms Center (/comms) — unifies notifications (Alerts, incl. game/crew
 * invites with Accept/Decline) and direct/crew messages (Messages) under one
 * page, reached from the user menu. Shares useNotifications + useMessaging.
 */

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { NotificationList, Chat } from "@empac/cascadeds";
import { useNotifications } from "@/lib/social/useNotifications";
import { useMessaging } from "@/lib/social/useMessaging";

type Tab = "alerts" | "messages";

export function CommsCenter() {
  const router = useRouter();
  const searchParams = useSearchParams();
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

  return (
    <div className="comms-center">
      <header className="comms-center__head">
        <h1 className="comms-center__title">Comms Center</h1>
        <div className="comms-center__tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "alerts"}
            className={`comms-tab${tab === "alerts" ? " comms-tab--active" : ""}`}
            onClick={() => switchTab("alerts")}
          >
            Alerts
            {notifs.unread > 0 && <span className="comms-tab__badge">{notifs.unread}</span>}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "messages"}
            className={`comms-tab${tab === "messages" ? " comms-tab--active" : ""}`}
            onClick={() => switchTab("messages")}
          >
            Messages
            {msgs.unreadTotal > 0 && <span className="comms-tab__badge">{msgs.unreadTotal}</span>}
          </button>
        </div>
      </header>

      <div className="comms-center__body">
        {tab === "alerts" ? (
          <NotificationList
            notifications={notifs.items}
            onNotificationClick={(n) => {
              if (n.href) router.push(n.href);
            }}
            emptyMessage="No notifications yet."
          />
        ) : (
          <Chat
            variant="embedded"
            conversations={msgs.chatConversations}
            activeConversationId={msgs.activeId}
            messages={msgs.chatMessages}
            currentUser={{ id: notifs.user.id, name: "You" }}
            onConversationSelect={selectConv}
            onSendMessage={(cid, content) => void msgs.send(cid, content)}
            inputPlaceholder="Write a message…"
            emptyState={
              <p style={{ padding: "2rem", textAlign: "center", color: "var(--text-secondary)" }}>
                No conversations yet. Visit a profile and hit Message.
              </p>
            }
          />
        )}
      </div>
    </div>
  );
}
