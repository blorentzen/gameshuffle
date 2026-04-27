import type { Metadata } from "next";
import Script from "next/script";
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
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
