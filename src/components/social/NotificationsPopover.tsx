"use client";

/**
 * Notifications bell — desktop opens the CDS Notifications dropdown (a
 * purpose-built overlay: header, list, mobile-safe); mobile deep-links to the
 * full Comms Center. Our own white bell button keeps the dark-navbar styling;
 * CDS owns the overlay. Realtime + mark-read come from useNotifications; opening
 * clears the badge (matches the Comms Center alerts behavior). `/comms` stays
 * the deep view.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Notifications } from "@empac/cascadeds";
import { useNotifications } from "@/lib/social/useNotifications";
import { useMessenger } from "@/components/social/MessengerProvider";
import { useIsDesktop } from "@/hooks/useMediaQuery";

const RECENT_CAP = 8;

const BellIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

function Badge({ count }: { count: number }) {
  if (count <= 0) return null;
  // Spec 2 §4.3: cap the display at 9+.
  return <span className="comms-icon__badge">{count > 9 ? "9+" : count}</span>;
}

export function NotificationsPopover() {
  const { user, items, unread, markAllRead } = useNotifications();
  const isDesktop = useIsDesktop();
  const router = useRouter();
  // Shared coordinator state — opening notifications closes the messenger.
  const { notificationsOpen: open, toggleNotifications, closeNotifications } = useMessenger();

  if (!user) return null;

  const ariaLabel = unread > 0 ? `Notifications, ${unread} unread` : "Notifications";

  // Mobile → full Comms Center (the CDS dropdown goes full-screen on mobile,
  // but we prefer the dedicated page for touch consistency with the chat bubble).
  if (!isDesktop) {
    return (
      <Link href="/comms?tab=alerts" className="comms-icon" aria-label={ariaLabel}>
        <BellIcon />
        <Badge count={unread} />
      </Link>
    );
  }

  const toggle = () => {
    // Peeking (opening) clears the badge — matches the Comms Center behavior.
    if (!open && unread > 0) markAllRead();
    toggleNotifications();
  };

  return (
    <>
      <button
        type="button"
        className="comms-icon"
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={toggle}
      >
        <BellIcon />
        <Badge count={unread} />
      </button>
      <Notifications
        isOpen={open}
        onClose={closeNotifications}
        notifications={items.slice(0, RECENT_CAP)}
        title="Notifications"
        position="top-right"
        emptyMessage="You're all caught up."
        onNotificationClick={(n) => {
          if (n.href) router.push(n.href);
          closeNotifications();
        }}
      />
    </>
  );
}
