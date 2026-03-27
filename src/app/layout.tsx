import type { Metadata } from "next";
import Script from "next/script";
import "@empac/cascadeds/styles.css";
import "./globals.css";
import "../styles/randomizer.css";
import "../styles/competitive.css";
import { SiteNavbar } from "@/components/layout/SiteNavbar";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { CookieConsent } from "@/components/layout/CookieConsent";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { Analytics } from "@vercel/analytics/next";

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
        <AuthProvider>
          <SiteNavbar />
          {children}
          <SiteFooter />
        </AuthProvider>

        {/* Plausible Analytics (cookieless — no consent needed) */}
        <Script
          defer
          data-domain="gameshuffle.co"
          src="https://plausible.io/js/script.tagged-events.outbound-links.js"
          strategy="afterInteractive"
        />

        {/* GA loaded conditionally by CookieConsent */}
        <CookieConsent />

        {/* Vercel Analytics */}
        <Analytics />
      </body>
    </html>
  );
}
