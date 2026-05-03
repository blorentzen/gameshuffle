"use client";

/**
 * Anonymous-viewer identity stored in browser sessionStorage. Persists
 * across page reloads in the same tab; resets when the tab closes — a
 * lightweight defense against trivial multi-vote spam without requiring
 * Twitch login.
 *
 * Per the multi-game refinements spec: streamer can recommend Twitch
 * login for persistence across rounds, but anonymous voting stays
 * available so we don't kneecap drive-by viewers.
 */

import { useState } from "react";

const STORAGE_KEY = "gs:picks-bans:anon-id";
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function generateUuid(): string {
  // Prefer crypto.randomUUID when available; fall back to a tiny
  // hand-rolled v4 generator for older browsers (e.g. Twitch's mobile
  // in-app browser).
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const hex = "0123456789abcdef";
  const out: string[] = [];
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) {
      out.push("-");
    } else if (i === 14) {
      out.push("4");
    } else if (i === 19) {
      out.push(hex[Math.floor(Math.random() * 4) + 8]);
    } else {
      out.push(hex[Math.floor(Math.random() * 16)]);
    }
  }
  return out.join("");
}

function resolveAnonId(): string | null {
  if (typeof window === "undefined") return null;
  let stored: string | null = null;
  try {
    stored = window.sessionStorage.getItem(STORAGE_KEY);
  } catch {
    // sessionStorage may be unavailable (private mode, embedded
    // browser). Mint a transient in-memory UUID instead — viewer can
    // still vote, just won't persist across reloads.
  }
  if (stored && UUID_RE.test(stored)) return stored;
  const fresh = generateUuid();
  try {
    window.sessionStorage.setItem(STORAGE_KEY, fresh);
  } catch {
    // Best-effort persist; ignore quota / disabled errors.
  }
  return fresh;
}

export function useAnonViewerId(): string | null {
  // Lazy initializer reads + mints synchronously. SSR returns null
  // (no `window`); the client init runs again during hydration and
  // returns the stored or freshly-minted UUID — no effect, no
  // cascading render. The id is used only for API call identity, not
  // rendered as text, so SSR-vs-client divergence is invisible.
  const [id] = useState<string | null>(() => resolveAnonId());
  return id;
}
