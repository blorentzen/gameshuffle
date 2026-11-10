"use client";

/**
 * The thin bar along the top while the next page loads (tap feedback picks, 2026-11-09, all as recommended: blue to
 * violet, the site's colors). Every page is built fresh on each visit, so a tap used to change nothing until the whole
 * next page arrived; this answers the tap. It starts on a click of a link to another page on this site and shows only
 * if the page takes longer than SHOW_AFTER_MS, so quick pages show nothing. It ends when the address changes (Next
 * pushes it as the new page commits), or after GIVE_UP_MS if the click never led anywhere. Pages with an outline
 * (loading.tsx) change at once, so the bar ends at once there too. A link can opt out with data-no-progress.
 */

import { useCallback, useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import "@/styles/nav-progress.css";

const SHOW_AFTER_MS = 120;
const GIVE_UP_MS = 12_000;

export function NavProgress() {
  const pathname = usePathname();
  const search = useSearchParams();
  const bar = useRef<HTMLDivElement>(null);
  const timers = useRef<number[]>([]);
  const running = useRef(false);

  const clear = () => { for (const t of timers.current) window.clearTimeout(t); timers.current = []; };

  const finish = useCallback(() => {
    if (!running.current) return;
    running.current = false;
    clear();
    const el = bar.current;
    if (!el) return;
    if (el.dataset.state !== "on") { el.dataset.state = "off"; return; }
    el.dataset.state = "done";
    timers.current.push(window.setTimeout(() => { if (!running.current) el.dataset.state = "off"; }, 450));
  }, []);

  const start = useCallback(() => {
    clear();
    running.current = true;
    const el = bar.current;
    if (!el) return;
    el.dataset.state = "off";
    timers.current.push(window.setTimeout(() => { if (running.current) el.dataset.state = "on"; }, SHOW_AFTER_MS));
    timers.current.push(window.setTimeout(finish, GIVE_UP_MS));
  }, [finish]);

  // The new page is here.
  useEffect(() => { finish(); }, [pathname, search, finish]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download") || "noProgress" in a.dataset) return;
      let url: URL;
      try { url = new URL(a.href, window.location.href); } catch { return; }
      if (url.origin !== window.location.origin) return;
      // The same page (or only its #section): nothing loads.
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      start();
    };
    // Next sets the new address as the page commits; back and forward land the same way.
    const { pushState, replaceState } = window.history;
    window.history.pushState = function (...args: Parameters<History["pushState"]>) { pushState.apply(this, args); finish(); };
    window.history.replaceState = function (...args: Parameters<History["replaceState"]>) { replaceState.apply(this, args); finish(); };
    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", finish);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", finish);
      window.history.pushState = pushState;
      window.history.replaceState = replaceState;
    };
  }, [start, finish]);

  return <div ref={bar} className="nav-progress" data-state="off" aria-hidden="true" />;
}
