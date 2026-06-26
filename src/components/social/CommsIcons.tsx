"use client";

/**
 * Navbar bell + messages icons (top-right). Quick access into the Comms Center
 * at the right tab, each carrying its own unread badge. Signed-in only — the
 * Comms Center is auth-gated. On mobile these sit next to the hamburger.
 */

import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { useCommsUnread } from "@/lib/social/useCommsUnread";

const BellIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

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
  const { notifications, messages } = useCommsUnread();

  if (!user) return null;

  return (
    <>
      <Link
        href="/comms?tab=alerts"
        className="comms-icon"
        aria-label={notifications > 0 ? `Notifications, ${notifications} unread` : "Notifications"}
      >
        <BellIcon />
        <Badge count={notifications} />
      </Link>
      <Link
        href="/comms?tab=messages"
        className="comms-icon"
        aria-label={messages > 0 ? `Messages, ${messages} unread` : "Messages"}
      >
        <ChatIcon />
        <Badge count={messages} />
      </Link>
    </>
  );
}
