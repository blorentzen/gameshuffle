"use client";

/**
 * Presence heartbeat — while a signed-in user has the app open, periodically
 * stamps last_seen_at so profiles can show an "online" dot. Renders nothing.
 * Mounted once near the app root (AuthProvider tree).
 */

import { useEffect } from "react";
import { useAuth } from "@/components/auth/AuthProvider";

const INTERVAL_MS = 120_000; // 2 min
/** A full page load or a return to the tab pings only if the last ping is older than this ("online" lasts 5 minutes). */
const MIN_GAP_MS = 60_000;
const LAST_KEY = "gs-heartbeat-at";

export function PresenceHeartbeat() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    // Hidden tabs don't ping (they used to, every 2 minutes), and pings share one clock across page
    // loads in this tab, so moving around the site doesn't send one per page.
    const ping = () => {
      if (document.visibilityState !== "visible") return;
      let last = 0;
      try { last = Number(sessionStorage.getItem(LAST_KEY) ?? 0); } catch { /* blocked */ }
      if (Date.now() - last < MIN_GAP_MS) return;
      try { sessionStorage.setItem(LAST_KEY, String(Date.now())); } catch { /* blocked */ }
      fetch("/api/account/heartbeat", { method: "POST", keepalive: true }).catch(() => {});
    };
    ping();
    const id = setInterval(ping, INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") ping();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [user]);

  return null;
}
