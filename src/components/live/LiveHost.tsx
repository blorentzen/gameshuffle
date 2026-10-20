"use client";

/**
 * Where the live page's game cards (poll, bingo, trivia, break, Chat Brain,
 * draft) get their data and how they ask a viewer to sign in. On the site
 * that's plain fetch to the live routes and the Twitch sign-in window
 * (LiveSiteHost). The Twitch extension gives the same cards its own host: the
 * same paths answered from the extension's state, and Twitch's "share your
 * Twitch ID" prompt instead of signing in. Kept free of site-only imports so
 * the extension can bundle the cards.
 */

import { createContext, useContext } from "react";

export interface LiveHostValue {
  /** A live route's JSON body (GET, or POST with `init`); null when it couldn't be reached. */
  api: (path: string, init?: RequestInit) => Promise<any | null>; // eslint-disable-line @typescript-eslint/no-explicit-any
  /** Ask the viewer to sign in (or share their Twitch id) to do `actionLabel` ("play along"). */
  signIn: (actionLabel: string) => void;
}

const siteApi: LiveHostValue["api"] = (path, init) =>
  fetch(path, { cache: "no-store", ...init }).then((r) => r.json()).catch(() => null);

export const LiveHostContext = createContext<LiveHostValue>({ api: siteApi, signIn: () => {} });

export const useLiveHost = () => useContext(LiveHostContext);

export { siteApi };
