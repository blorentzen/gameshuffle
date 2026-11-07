"use client";

/**
 * Remembers whose link brought a visitor here (bring-along picks 2026-11-05, 3A): their profile, their live page or an
 * event they run. Kept in this browser for 7 days, the first one wins (like invite codes); after sign-up the welcome
 * page offers to follow them. Signed-in visitors don't need it, so it only writes for visitors.
 */

import { useEffect } from "react";
import { useAuth } from "@/components/auth/AuthProvider";

export const CAME_FROM_KEY = "gs-came-from";
const KEEP_MS = 7 * 86_400_000;

export function readCameFrom(): string | null {
  try {
    const raw = JSON.parse(localStorage.getItem(CAME_FROM_KEY) ?? "null") as { u?: string; at?: number } | null;
    return raw?.u && raw.at && Date.now() - raw.at < KEEP_MS ? raw.u : null;
  } catch { return null; }
}

export function CameFrom({ userId }: { userId: string | null | undefined }) {
  const { user, loading } = useAuth();
  useEffect(() => {
    if (loading || user || !userId) return;
    if (readCameFrom()) return;
    try { localStorage.setItem(CAME_FROM_KEY, JSON.stringify({ u: userId, at: Date.now() })); } catch { /* private mode */ }
  }, [userId, user, loading]);
  return null;
}
