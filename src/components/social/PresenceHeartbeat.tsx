"use client";

/**
 * Presence heartbeat — while a signed-in user has the app open, periodically
 * stamps last_seen_at so profiles can show an "online" dot. Renders nothing.
 * Mounted once near the app root (AuthProvider tree).
 */

import { useEffect } from "react";
import { useAuth } from "@/components/auth/AuthProvider";

const INTERVAL_MS = 120_000; // 2 min

export function PresenceHeartbeat() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    const ping = () => {
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
