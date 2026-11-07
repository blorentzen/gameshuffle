"use client";

/**
 * "Pick up where you left off" (personalization picks 2026-11-05, 2A): remembers the last few pages someone opened, in
 * this browser only (localStorage `gs-recent-places`; nothing is sent). Mounted with the site chrome; the signed-in
 * homepage reads it (`useRecentPlaces`). Account, sign-in and home pages aren't places.
 */

import { useEffect, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";

export interface Place { path: string; title: string; at: number }

const KEY = "gs-recent-places";
const MAX = 10;
const SKIP = /^\/($|home$|games$|account|login|signup|auth|api|social|welcome|comms|messages|staff|overlay|stream|r\/|support\/thanks|shop\/thanks|unsubscribe|data-request)/;

function read(): Place[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]") as Place[];
    return Array.isArray(v) ? v.filter((p) => p && typeof p.path === "string" && typeof p.title === "string") : [];
  } catch {
    return [];
  }
}

const listeners = new Set<() => void>();
let cache: string | null = null;
const snapshot = () => {
  try { cache = localStorage.getItem(KEY) ?? "[]"; } catch { cache = "[]"; }
  return cache;
};

/** Records each page opened (the title once Next has set it). */
export function RecentPlaces() {
  const pathname = usePathname();
  useEffect(() => {
    if (!pathname || SKIP.test(pathname)) return;
    const t = window.setTimeout(() => {
      const title = document.title.replace(/\s*\|\s*GameShuffle\s*$/, "").trim();
      if (!title || /^GameShuffle/.test(title)) return;
      const next = [{ path: pathname, title, at: Date.now() }, ...read().filter((p) => p.path !== pathname)].slice(0, MAX);
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* private mode */ }
      listeners.forEach((l) => l());
    }, 900);
    return () => window.clearTimeout(t);
  }, [pathname]);
  return null;
}

/** The last `n` places, newest first ([] on the server and before hydration). */
export function useRecentPlaces(n = 3): Place[] {
  const raw = useSyncExternalStore(
    (cb) => { listeners.add(cb); window.addEventListener("storage", cb); return () => { listeners.delete(cb); window.removeEventListener("storage", cb); }; },
    snapshot,
    () => "[]",
  );
  try {
    return (JSON.parse(raw) as Place[]).slice(0, n);
  } catch {
    return [];
  }
}
