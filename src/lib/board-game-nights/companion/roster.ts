"use client";

import { useSyncExternalStore } from "react";

/**
 * Shared board-game-night roster — one list of players that cascades across
 * every companion tool (score sheets, counters, deduction grid, turn timer…).
 * Add someone once and every sheet picks them up; no re-adding as you move
 * between tools. Players carry a stable `id` so tools key their scores by id
 * (not array index) and a rename or reorder never scrambles anyone's score.
 *
 * Backed by localStorage and live-synced across every component mounted on the
 * page (via useSyncExternalStore) plus other tabs (via the storage event).
 */

export interface RosterPlayer { id: string; name: string }

const KEY = "gs-bgn-roster";
const EMPTY: RosterPlayer[] = [];

export function newPlayerId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `p-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

let snapshot: RosterPlayer[] | null = null;
const listeners = new Set<() => void>();
let storageBound = false;
// Stays false until the first client subscribe (which only runs after hydration),
// so the first client render returns the same EMPTY the server rendered — no
// hydration mismatch even though localStorage has players.
let clientReady = false;

function read(): RosterPlayer[] {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) {
      return arr.filter((p): p is RosterPlayer => p && typeof p.id === "string" && typeof p.name === "string");
    }
  } catch {
    /* ignore */
  }
  return EMPTY;
}

function getSnapshot(): RosterPlayer[] {
  // Before the client has mounted/subscribed, mirror the server (EMPTY) so
  // hydration matches; localStorage is read once we're client-ready.
  if (!clientReady) return EMPTY;
  if (snapshot === null) snapshot = read();
  return snapshot;
}

function getServerSnapshot(): RosterPlayer[] {
  return EMPTY;
}

function emit() {
  for (const l of listeners) l();
}

function write(next: RosterPlayer[]) {
  snapshot = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  emit();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  // First subscribe runs only on the client, after hydration: now it's safe to
  // surface the persisted roster. React re-reads getSnapshot right after this,
  // sees the change, and re-renders with the stored players.
  if (!clientReady) {
    clientReady = true;
    snapshot = read();
  }
  if (!storageBound && typeof window !== "undefined") {
    storageBound = true;
    window.addEventListener("storage", (e) => {
      if (e.key === KEY) {
        snapshot = read();
        emit();
      }
    });
  }
  return () => { listeners.delete(cb); };
}

export interface RosterApi {
  players: RosterPlayer[];
  add: (name: string) => void;
  /** Accepts a single name or a comma/newline-separated paste; dedupes case-insensitively. */
  addMany: (raw: string) => void;
  rename: (id: string, name: string) => void;
  remove: (id: string) => void;
  clear: () => void;
  /** Replace the whole roster (e.g. loading a saved roster from the account). */
  replace: (players: RosterPlayer[]) => void;
}

export function useRoster(): RosterApi {
  const players = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return {
    players,
    add: (name: string) => {
      const n = name.trim();
      if (n) write([...getSnapshot(), { id: newPlayerId(), name: n }]);
    },
    addMany: (raw: string) => {
      const names = raw.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
      if (names.length === 0) return;
      const cur = getSnapshot();
      const seen = new Set(cur.map((p) => p.name.toLowerCase()));
      const additions: RosterPlayer[] = [];
      for (const n of names) {
        if (!seen.has(n.toLowerCase())) { additions.push({ id: newPlayerId(), name: n }); seen.add(n.toLowerCase()); }
      }
      if (additions.length) write([...cur, ...additions]);
    },
    rename: (id, name) => write(getSnapshot().map((p) => (p.id === id ? { ...p, name } : p))),
    remove: (id) => write(getSnapshot().filter((p) => p.id !== id)),
    clear: () => write([]),
    replace: (players) => write(players.filter((p) => p && typeof p.id === "string" && typeof p.name === "string")),
  };
}
