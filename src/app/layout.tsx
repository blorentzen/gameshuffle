import type { Metadata } from "next";
import Script from "next/script";
import "@empac/cascadeds/styles.css";
import "./globals.css";
import "../styles/randomizer.css";
import "../styles/competitive.css";
import { SiteNavbar } from "@/components/layout/SiteNavbar";
import { EmpacBanner } from "@/components/layout/EmpacBanner";
import { AuthProvider } from "@/components/auth/AuthProvider";

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
          <EmpacBanner />
        </AuthProvider>

        {/* Google Analytics */}
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-WBXS3D8GBL"
          strategy="afterInteractive"
        />
        <Script id="ga-init" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-WBXS3D8GBL');
          `}
        </Script>

        {/* Plausible Analytics */}
        <Script
          defer
          data-domain="gameshuffle.co"
          src="https://plausible.io/js/script.tagged-events.outbound-links.js"
          strategy="afterInteractive"
        />
      </body>
    </html>
  );
}
