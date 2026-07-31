"use client";

/**
 * Navbar comms icons (top-right). The bell is a quick-peek notifications
 * popover (desktop) / deep-link (mobile) via NotificationsPopover; the chat
 * bubble deep-links to the Comms Center messages tab until the bottom-right
 * Messenger lands. Signed-in only. On mobile these sit next to the hamburger.
 */

import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { useCommsUnread } from "@/lib/social/useCommsUnread";
import { NotificationsPopover } from "@/components/social/NotificationsPopover";
import { useMessenger } from "@/components/social/MessengerProvider";
import { useIsDesktop } from "@/hooks/useMediaQuery";

const ChatIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path
      d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

function Badge({ count }: { count: number }) {
  if (count <= 0) return null;
  return <span className="comms-icon__badge">{count > 99 ? "99+" : count}</span>;
}

export function CommsIcons() {
  const { user } = useAuth();
  const { messages } = useCommsUnread();
  const isDesktop = useIsDesktop();
  const { toggleMessenger } = useMessenger();

  if (!user) return null;

  const label = messages > 0 ? `Messages, ${messages} unread` : "Messages";

  return (
    <>
      <NotificationsPopover />
      {isDesktop ? (
        // Desktop → toggle the bottom-right Messenger panel.
        <button type="button" className="comms-icon" aria-label={label} onClick={toggleMessenger}>
          <ChatIcon />
          <Badge count={messages} />
        </button>
      ) : (
        // Mobile → the full-screen messages view.
        <Link href="/comms?tab=messages" className="comms-icon" aria-label={label}>
          <ChatIcon />
          <Badge count={messages} />
        </Link>
      )}
    </>
  );
}
