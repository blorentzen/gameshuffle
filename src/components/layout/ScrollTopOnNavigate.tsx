"use client";

/**
 * Brings the page to the top after a tap on a link to another page (Britton, 2026-11-11: switching pages from Home
 * left people wherever they'd scrolled to). This Next.js only scrolls to the top when the new page would otherwise be
 * off screen, and keeps the position whenever any of it is visible, so long pages kept the old scroll. Links within the
 * same page (`?tab=` tabs, filters), links with a #hash, new tabs and the back and forward buttons are left alone.
 */

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

export function ScrollTopOnNavigate() {
  const pathname = usePathname();
  const pending = useRef<string | null>(null);

  // Before the router sees the click (capture phase): remember where a plain left click on a link is going.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      let url: URL;
      try { url = new URL(a.href, window.location.href); } catch { return; }
      if (url.origin !== window.location.origin || url.hash || url.pathname === window.location.pathname) return;
      pending.current = url.pathname;
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  useEffect(() => {
    if (pending.current === pathname) window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    pending.current = null;
  }, [pathname]);

  return null;
}
