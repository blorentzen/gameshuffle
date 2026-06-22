import type { Metadata } from "next";
import Script from "next/script";
import { cookies, headers } from "next/headers";
import "@empac/cascadeds/styles.css";
import "./globals.css";
import "../styles/randomizer.css";
import "../styles/competitive.css";
import "../styles/companion.css";
import { ConditionalChrome } from "@/components/layout/ConditionalChrome";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { Analytics } from "@vercel/analytics/next";
import { ImpersonationBanner } from "@/components/staff/ImpersonationBanner";
import { ImpersonationControlMount } from "@/components/staff/ImpersonationControlMount";
import { ImpersonationProviderMount } from "@/components/staff/ImpersonationProviderMount";
import { RouteThemeSync } from "@/components/theme/RouteThemeSync";
import { isAppRoute } from "@/lib/theme/app-routes";
import { SITE_URL } from "@/lib/seo";

/** Cookie name for the user's manual theme preference. Read at SSR
 *  so the `<html data-theme>` attribute is correct on first paint —
 *  no FOUC. Settable values: 'light' or 'dark'. Absent cookie ==
 *  follow the OS via `prefers-color-scheme`. */
const THEME_COOKIE = "gs-theme";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "GameShuffle",
    template: "%s | GameShuffle",
  },
  description:
    "Whether it's randomizing the way you play video games or creating wacky combos from numerous board and card games, we got you covered to bring the fun back to game nights.",
  icons: {
    icon: "/images/browser/gameshuffle-browser-icon.png",
  },
  openGraph: {
    siteName: "GameShuffle",
    locale: "en_US",
    type: "website",
    images: ["/images/opengraph/gameshuffle-main-og.jpg"],
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Decide whether this request is a themable app surface or a
  // marketing page. Marketing pages always render light; the user's
  // saved cookie + OS preference only apply to app pages. The
  // pathname comes from the `x-pathname` header that the middleware
  // writes — see `src/middleware.ts`.
  const headerStore = await headers();
  const pathname = headerStore.get("x-pathname") ?? "/";
  const themable = isAppRoute(pathname);

  // Server-read the theme cookie so `data-theme` is set at first paint.
  // Only honor known values ('light' / 'dark') AND only on app routes;
  // marketing pages ignore the cookie entirely so visitors see a
  // consistent brand regardless of personal preference.
  const cookieStore = await cookies();
  const themeCookie = cookieStore.get(THEME_COOKIE)?.value;
  const cookieTheme =
    themeCookie === "light" || themeCookie === "dark"
      ? themeCookie
      : undefined;

  // Resolution:
  //   • Marketing → always "light" (force, ignore cookie + OS).
  //   • App + cookie present → cookie value.
  //   • App + no cookie → undefined ⇒ follow OS via the
  //     prefers-color-scheme media query in globals.css.
  const dataTheme: "light" | "dark" | undefined = themable
    ? cookieTheme
    : "light";

  // CDS's component CSS keys on `html.dark` (~388 rules), so we must
  // also render the class server-side when the user has explicitly
  // chosen dark. For app routes in "match system" mode (cookie absent),
  // we can't know the OS pref server-side, so a tiny pre-paint script
  // handles it below. Marketing never needs the dark class.
  const htmlClassName = dataTheme === "dark" ? "dark" : undefined;
  const isFollowingSystem = themable && cookieTheme === undefined;

  return (
    <html lang="en" data-theme={dataTheme} className={htmlClassName}>
      <head>
        {/* Pre-paint theme sync for "match system" users. Runs before
            paint and adds `dark` class if the OS prefers dark — CDS
            component styles depend on the class being present. Only
            emitted when the user has no explicit cookie choice; the
            forced-light/dark cases are already handled via SSR. */}
        {isFollowingSystem && (
          <script
            dangerouslySetInnerHTML={{
              __html:
                "try{if(window.matchMedia('(prefers-color-scheme: dark)').matches){document.documentElement.classList.add('dark')}}catch(e){}",
            }}
          />
        )}
      </head>
      <body>
        {/* Client-only theme sync — re-applies <html data-theme> + dark
            class on every client navigation. React doesn't reconcile
            <html> attribute changes after hydration, so the SSR branch
            above only covers the initial load; this covers route
            transitions. Mirrors the same isAppRoute() decision tree. */}
        <RouteThemeSync />
        {/* Staff impersonation banner — server-rendered, only emits for staff
            with active impersonation cookies. No flash of un-bannered content. */}
        <ImpersonationBanner />
        {/* Server-seeded impersonation context. Wraps AuthProvider so chrome
            (UserMenu, etc.) can read the impersonation state alongside the
            real Supabase user via useImpersonation(). */}
        <ImpersonationProviderMount>
          <AuthProvider>
            <ConditionalChrome>{children}</ConditionalChrome>
          </AuthProvider>
        </ImpersonationProviderMount>
        {/* Floating staff control — only emits for staff users. */}
        <ImpersonationControlMount />

        {/* Plausible Analytics (cookieless — no consent needed) */}
        <Script
          defer
          data-domain="gameshuffle.co"
          src="https://plausible.io/js/script.tagged-events.outbound-links.js"
          strategy="afterInteractive"
        />

        {/* Vercel Analytics */}
        <Analytics />
      </body>
    </html>
  );
}
