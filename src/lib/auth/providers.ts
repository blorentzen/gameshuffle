"use client";

import { useSyncExternalStore } from "react";
import type { OAuthProvider } from "@/lib/auth/oauth";

/**
 * The social sign-in buttons, in order (Britton's picks, 2026-10-18,
 * https://claude.ai/artifact/MgHT7WBbCAPiDwcwrRF4b3): Discord and Twitch always,
 * Facebook once its switch is on (Platform ▸ Switches ▸ Sign in with Facebook,
 * read through /api/auth/providers). Login and sign-up use the same list so
 * they can't drift apart. X is left out: its API charges per sign-in.
 */

export interface SignInProvider { id: OAuthProvider; label: string; icon: string }

const ALWAYS: SignInProvider[] = [
  { id: "discord", label: "Discord", icon: "/images/icons/discord.svg" },
  { id: "twitch", label: "Twitch", icon: "/images/icons/twitch.svg" },
];
const FACEBOOK: SignInProvider = { id: "facebook", label: "Facebook", icon: "/images/icons/facebook.svg" };

// One fetch per page load, shared by every button list on the page.
let state: SignInProvider[] = ALWAYS;
let started = false;
const listeners = new Set<() => void>();

function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  void fetch("/api/auth/providers")
    .then((r) => (r.ok ? r.json() : null))
    .then((d: { facebook?: boolean } | null) => {
      if (!d?.facebook) return;
      state = [...ALWAYS, FACEBOOK];
      listeners.forEach((l) => l());
    })
    .catch(() => { /* Discord and Twitch still show */ });
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  start();
  return () => { listeners.delete(cb); };
}

/** The sign-in buttons to show. Starts with Discord and Twitch; Facebook joins once the switch is known to be on. */
export function useSignInProviders(): SignInProvider[] {
  return useSyncExternalStore(subscribe, () => state, () => ALWAYS);
}

/** "Discord, Twitch or Facebook" for consent lines. */
export function providerList(list: SignInProvider[]): string {
  const names = list.map((p) => p.label);
  return names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`;
}
