"use client";

/**
 * Navbar comms icons (top-right). The bell opens the floating notifications
 * popover (NotificationsPopover); the chat bubble toggles the floating
 * Messenger panel. Both float in place on every viewport now — mobile no longer
 * deep-links away to /comms (CDS adapts the overlays to a mobile sheet/card).
 * Signed-in only. On mobile these sit next to the hamburger.
 */

import { useAuth } from "@/components/auth/AuthProvider";
import { useCommsUnread } from "@/lib/social/useCommsUnread";
import { NotificationsPopover } from "@/components/social/NotificationsPopover";
import { useMessenger } from "@/components/social/MessengerProvider";

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
  const { toggleMessenger } = useMessenger();

  if (!user) return null;

  const label = messages > 0 ? `Messages, ${messages} unread` : "Messages";

  return (
    <>
      <NotificationsPopover />
      {/* Toggle the floating Messenger panel (bottom-right card; a near-full
          bottom card on mobile) on every viewport. */}
      <button type="button" className="comms-icon" aria-label={label} onClick={toggleMessenger}>
        <ChatIcon />
        <Badge count={messages} />
      </button>
    </>
  );
}
