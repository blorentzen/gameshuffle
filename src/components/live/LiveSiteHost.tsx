"use client";

/**
 * The site's host for the live page's game cards (LiveHost): plain fetch, and
 * the Twitch sign-in window when a card needs a signed-in viewer.
 */

import { useMemo, useState, type ReactNode } from "react";
import { AuthPromptModal } from "./AuthPromptModal";
import { LiveHostContext, siteApi, type LiveHostValue } from "./LiveHost";

export function LiveSiteHost({ streamerSlug, children }: { streamerSlug: string; children: ReactNode }) {
  const [ask, setAsk] = useState<string | null>(null);
  const value = useMemo<LiveHostValue>(() => ({ api: siteApi, signIn: (label) => setAsk(label) }), []);
  return (
    <LiveHostContext.Provider value={value}>
      {children}
      <AuthPromptModal isOpen={ask !== null} onClose={() => setAsk(null)} streamerSlug={streamerSlug} actionLabel={ask ?? "play along"} />
    </LiveHostContext.Provider>
  );
}
