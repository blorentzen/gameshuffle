"use client";

/**
 * Safety net for a stuck page scroll-lock.
 *
 * CDS `Modal` and `Drawer` both lock scroll by setting
 * `document.body.style.overflow = "hidden"` while open and restoring it in an
 * effect cleanup. Because that's a single shared global across every overlay,
 * an interleaving open/close (or an unmount race) can leave the body locked with
 * no overlay actually open — the page then refuses to scroll until a full reload.
 *
 * This guard watches for that stale state and clears it. It only ever clears the
 * lock when NO overlay is genuinely open (no `.empac-modal-overlay` in the DOM —
 * CDS Modals unmount when closed — and no `.empac-drawer--open`), so a
 * legitimately-open modal/drawer is never disturbed.
 */

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const OPEN_OVERLAY_SELECTOR = ".empac-modal-overlay, .empac-drawer--open";

function clearStaleLock() {
  if (typeof document === "undefined") return;
  const body = document.body;
  const html = document.documentElement;
  const locked = body.style.overflow === "hidden" || html.style.overflow === "hidden";
  if (!locked) return;
  // A real overlay is open — leave the lock in place.
  if (document.querySelector(OPEN_OVERLAY_SELECTOR)) return;
  if (body.style.overflow === "hidden") body.style.overflow = "";
  if (html.style.overflow === "hidden") html.style.overflow = "";
}

export function ScrollLockGuard() {
  const pathname = usePathname();

  // Re-check on every route/tab change (a modal from the previous view is gone).
  useEffect(() => {
    clearStaleLock();
  }, [pathname]);

  // Re-check whenever the DOM or body style mutates — catches an overlay closing
  // in place. The callback early-returns unless the body is actually locked, so
  // it's cheap even though it observes the whole subtree.
  useEffect(() => {
    const observer = new MutationObserver(() => clearStaleLock());
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["style"],
      childList: true,
      subtree: true,
    });
    return () => observer.disconnect();
  }, []);

  return null;
}
