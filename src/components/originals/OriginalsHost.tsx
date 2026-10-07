"use client";

/**
 * Where the Originals (the Daily, the Weekly, the Chat Brain card) are
 * running. On the site they call our API with the visitor's cookies and link
 * with Next's <Link>. Inside the Discord Activity there are no cookies and the
 * page must never navigate (a reload breaks the Discord connection), so the
 * Activity wraps them in an <OriginalsHostProvider> that sends each call to its
 * /api/activity/* twin with the Activity's session, and opens links on
 * gameshuffle.co through Discord.
 */

import Link from "next/link";
import { createContext, useContext, type ReactNode } from "react";
import { SITE_URL } from "@/lib/seo";

export interface OriginalsHost {
  /** fetch for our own API routes, by their site path (e.g. "/api/daily"). */
  api: (path: string, init?: RequestInit) => Promise<Response>;
  /** Set inside the Discord Activity. */
  activity: null | {
    /** Opens a gameshuffle.co page outside Discord. */
    openSite: (path: string) => void;
    /** Shares text to a Discord channel or DM, with a link back into the Activity. */
    share?: (message: string) => Promise<boolean>;
    /** Switches the Activity to another game's tab (Chat Brain has its own there). */
    showTab?: (tab: "daily" | "weekly" | "brain") => void;
    /** Starts signing up (in the browser) and watches for the new account; sign-in links use it. */
    signUp?: () => void;
  };
}

const SITE_HOST: OriginalsHost = { api: (path, init) => fetch(path, init), activity: null };
const HostContext = createContext<OriginalsHost>(SITE_HOST);

export function OriginalsHostProvider({ host, children }: { host: OriginalsHost; children: ReactNode }) {
  return <HostContext.Provider value={host}>{children}</HostContext.Provider>;
}

export function useOriginalsHost(): OriginalsHost {
  return useContext(HostContext);
}

const CDN_ART = "https://cdn.empac.co/gameshuffle/images/";

/**
 * An image URL that loads where the Originals are running. Discord's proxy
 * blocks every host but ours, so inside the Activity art on our CDN goes
 * through /images/cdn (a rewrite in next.config.ts); on the site it's unchanged.
 */
export function useArtSrc(): (src: string) => string {
  const { activity } = useOriginalsHost();
  return activity ? (src) => (src.startsWith(CDN_ART) ? `/images/cdn/${src.slice(CDN_ART.length)}` : src) : (src) => src;
}

/** A link to a site page: Next's <Link> on the site, a Discord-opened link inside the Activity. */
export function OriginalsLink({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  const { activity } = useOriginalsHost();
  if (!activity) return <Link href={href} className={className}>{children}</Link>;
  // Inside Discord, a sign-in link means "get an account": the join flow, which the Activity then notices.
  const signIn = /^\/(login|signup)\b/.test(href) && activity.signUp;
  return (
    <a href={`${SITE_URL}${signIn ? "/discord/join" : href}`} className={className} onClick={(e) => { e.preventDefault(); if (signIn) activity.signUp?.(); else activity.openSite(href); }}>
      {children}
    </a>
  );
}
