"use client";

/**
 * Safety net for a stuck page scroll-lock.
 *
 * CDS `Modal` and `Drawer` both lock scroll by setting
 * `document.body.style.overflow = "hidden"` while open and restoring it in an
 * effect cleanup. It's a single shared global with no reference counting, so an
 * interleaving open/close (or an unmount race) can leave the body locked with no
 * overlay visible — the page then refuses to scroll until a full reload (most
 * obvious on long account tabs like Integrations / Stream Tools).
 *
 * This guard clears the lock whenever no overlay is ACTUALLY on screen. It
 * checks visibility (on-screen, non-zero box) rather than mere DOM presence, so
 * a leaked-but-invisible overlay (or a drawer translated off-canvas) doesn't
 * keep the page hostage — while a genuinely open, visible modal/drawer keeps its
 * lock. Runs on route change, on DOM/style mutations, and on a short interval as
 * a guaranteed backstop.
 */

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const OVERLAY_SELECTOR = ".empac-modal-overlay, .empac-drawer-overlay--visible, .empac-drawer--open";

function anyOverlayVisible(): boolean {
  if (typeof document === "undefined") return false;
  const els = Array.from(document.querySelectorAll<HTMLElement>(OVERLAY_SELECTOR));
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  return els.some((el) => {
    const r = el.getBoundingClientRect();
    // On screen with a real box — a truly open, visible overlay.
    return r.width > 4 && r.height > 4 && r.right > 0 && r.left < vw && r.bottom > 0 && r.top < vh;
  });
}

function clearStaleLock() {
  if (typeof document === "undefined") return;
  const body = document.body;
  const html = document.documentElement;
  if (body.style.overflow !== "hidden" && html.style.overflow !== "hidden") return;
  if (anyOverlayVisible()) return; // a real overlay is showing — keep the lock
  if (body.style.overflow === "hidden") body.style.overflow = "";
  if (html.style.overflow === "hidden") html.style.overflow = "";
}

export function ScrollLockGuard() {
  const pathname = usePathname();

  // Re-check on every route/tab change (a modal from the previous view is gone).
  useEffect(() => {
    clearStaleLock();
  }, [pathname]);

  useEffect(() => {
    // Instant response when the DOM / body style mutates (overlay closes in place).
    const observer = new MutationObserver(() => clearStaleLock());
    observer.observe(document.body, { attributes: true, attributeFilter: ["style"], childList: true, subtree: true });
    // Guaranteed backstop — restores scroll within a fraction of a second even if
    // a mutation/timing edge case slips past the observer.
    const interval = window.setInterval(clearStaleLock, 400);
    return () => {
      observer.disconnect();
      window.clearInterval(interval);
    };
  }, []);

  return null;
}
