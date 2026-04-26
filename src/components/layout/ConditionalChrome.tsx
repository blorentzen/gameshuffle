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
import { PolicyUpdateBanner } from "./PolicyUpdateBanner";

const CHROME_FREE_PATTERNS: RegExp[] = [
  /^\/overlay(\/|$)/,
  /^\/stream(\/|$)/,
  /^\/stream-card(\/|$)/,
];

export function ConditionalChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "";
  const hideChrome = CHROME_FREE_PATTERNS.some((p) => p.test(pathname));

  if (hideChrome) return <>{children}</>;

  return (
    <>
      <PolicyUpdateBanner />
      <SiteNavbar />
      {children}
      <SiteFooter />
      <CookieConsent />
    </>
  );
}
