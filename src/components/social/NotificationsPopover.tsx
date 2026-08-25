"use client";

/**
 * Notifications bell — opens the CDS Notifications dropdown (a purpose-built
 * overlay: header, list) as a floating popover on every viewport. On mobile it
 * becomes a frosted card below the nav (see the mobile rules in account.css)
 * instead of deep-linking to /comms. Our own white bell button keeps the
 * dark-navbar styling; CDS owns the overlay. Realtime + mark-read come from
 * useNotifications; opening clears the badge (matches the Comms Center alerts
 * behavior). `/comms` stays the deep view.
 */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  // Portal target — mounted client-side only (avoids SSR/hydration mismatch).
  // Deferred via rAF so the setState lands in a callback, not the effect body.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Collapse the panel when the user scrolls down (it rides with the auto-hiding
  // nav), avoiding an awkward floating overlap. Plays a pop-out first so it
  // tucks away instead of vanishing. State updates run in callbacks.
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  useEffect(() => {
    // Desktop-only: the popover rides with the auto-hiding nav, so it tucks away
    // on scroll-down. On mobile it's a standalone sheet — let it stay open.
    if (!open || !isDesktop) return;
    closingRef.current = false;
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      if (y > last + 4 && !closingRef.current) {
        closingRef.current = true;
        setClosing(true);
        window.setTimeout(() => {
          closeNotifications();
          setClosing(false);
        }, 180);
      }
      last = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [open, isDesktop, closeNotifications]);

  if (!user) return null;

  const ariaLabel = unread > 0 ? `Notifications, ${unread} unread` : "Notifications";

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
      {/* Portaled to <body> so the fixed panel isn't trapped by the nav's
          backdrop-filter containing block (which made it ride up + clip when
          the nav auto-hides on scroll). */}
      {mounted &&
        createPortal(
          <div className={`dark${closing ? " is-closing" : ""}`}>
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
          </div>,
          document.body,
        )}
    </>
  );
}
