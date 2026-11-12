"use client";

/**
 * Hides the global site chrome (nav, footer, cookie banner) on routes
 * that get loaded as OBS browser sources. Without this, the (stream)
 * group's pages render INSIDE the root layout — Next.js route groups
 * don't break out of layout inheritance — and viewers see GameShuffle's
 * navbar overlaid on the streamer's gameplay capture.
 *
 * Add a regex here when shipping a new chrome-free route.
 */

import { usePathname } from "next/navigation";
import { SiteNavbar } from "./SiteNavbar";
import { SiteFooter } from "./SiteFooter";
import { CookieConsent } from "./CookieConsent";
import { AppBar } from "./AppBar";
import { PolicyUpdateBanner } from "./PolicyUpdateBanner";
import { MessengerProvider } from "@/components/social/MessengerProvider";
import { Messenger } from "@/components/social/Messenger";
import { PresenceProvider } from "@/components/social/PresenceProvider";
import type { Interest } from "@/lib/interests/rules";
import { RecentPlaces } from "./RecentPlaces";
import { MESSAGING_ON } from "@/lib/social/messagingOn";

const CHROME_FREE_PATTERNS: RegExp[] = [
  /^\/overlay(\/|$)/,
  /^\/stream(\/|$)/,
  /^\/stream-card(\/|$)/,
  /^\/stream-timer\/overlay(\/|$)/,
  /^\/game-nights\/[^/]+\/display(\/|$)/,
  /^\/tournament\/[^/]+\/display(\/|$)/,
  /^\/tournament\/[^/]+\/station(\/|$)/, // a time trial station's runner page (in person)
  /^\/party\/[^/]+\/tv(\/|$)/,
  /^\/trivia\/tv\/[^/]+/,
  /^\/social(\/|$)/, // hidden 9:16 stages filmed for social videos
  /^\/mmr\/[^/]+/, // the MMR card's OBS link
  /^\/run\/[^/]+/, // a runner's speedrun overlay (OBS link)
  /^\/races\/[^/]+\/obs$/, // a speedrun race's restream link (OBS)
  /^\/speedrun\/remote(\/|$)/, // the speedrun phone remote (a full-screen timer)
  /^\/war\/[^/]+/, // a channel's war overlay (GameShuffle Competitive)
];

export function ConditionalChrome({ children, shop = false, speedrun = false, previewInterests = null }: { children: React.ReactNode; shop?: boolean; speedrun?: boolean; previewInterests?: Interest[] | null }) {
  const pathname = usePathname() || "";
  const hideChrome = CHROME_FREE_PATTERNS.some((p) => p.test(pathname));

  if (hideChrome) return <>{children}</>;

  return (
    <PresenceProvider>
      <MessengerProvider>
        <PolicyUpdateBanner />
        <SiteNavbar shop={shop} speedrun={speedrun} previewInterests={previewInterests} />
        <RecentPlaces />
        {children}
        <SiteFooter shop={shop} speedrun={speedrun} />
        <CookieConsent />
        {/* Members on phones: Home, Games, Create, Inbox, You (journeys picks 2026-11-06). */}
        <AppBar />
        {/* Bottom-right Messenger — inside the chrome branch so it's absent on
            OBS/overlay routes (excluded at the layout level, per Spec 2 §2.3). */}
        {MESSAGING_ON && <Messenger />}
      </MessengerProvider>
    </PresenceProvider>
  );
}
