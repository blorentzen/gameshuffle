import type { Metadata } from "next";
import Script from "next/script";
import { cookies } from "next/headers";
import "@empac/cascadeds/styles.css";
import "./globals.css";
import "../styles/randomizer.css";
import "../styles/competitive.css";
import { ConditionalChrome } from "@/components/layout/ConditionalChrome";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { Analytics } from "@vercel/analytics/next";
import { ImpersonationBanner } from "@/components/staff/ImpersonationBanner";
import { ImpersonationControlMount } from "@/components/staff/ImpersonationControlMount";
import { ImpersonationProviderMount } from "@/components/staff/ImpersonationProviderMount";

/** Cookie name for the user's manual theme preference. Read at SSR
 *  so the `<html data-theme>` attribute is correct on first paint —
 *  no FOUC. Settable values: 'light' or 'dark'. Absent cookie ==
 *  follow the OS via `prefers-color-scheme`. */
const THEME_COOKIE = "gs-theme";

export const metadata: Metadata = {
  metadataBase: new URL("https://gameshuffle.co"),
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
  // Server-read the theme cookie so `data-theme` is set at first paint.
  // Only honor known values ('light' / 'dark'); absent or unknown
  // values leave the attribute off so the OS preference takes over via
  // the @media (prefers-color-scheme: dark) block in globals.css.
  const cookieStore = await cookies();
  const themeCookie = cookieStore.get(THEME_COOKIE)?.value;
  const dataTheme =
    themeCookie === "light" || themeCookie === "dark"
      ? themeCookie
      : undefined;
  // CDS's component CSS keys on `html.dark` (~388 rules), so we must
  // also render the class server-side when the user has explicitly
  // chosen dark. For "match system" (cookie absent), we can't know the
  // OS pref server-side, so a tiny pre-paint script handles it below.
  const htmlClassName = dataTheme === "dark" ? "dark" : undefined;
  const isFollowingSystem = dataTheme === undefined;

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
