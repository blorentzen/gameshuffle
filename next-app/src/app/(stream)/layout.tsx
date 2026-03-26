import type { Metadata } from "next";
import Script from "next/script";
import "@empac/cascadeds/styles.css";
import "../globals.css";
import "../../styles/randomizer.css";
import "../../styles/stream.css";

export const metadata: Metadata = {
  title: "GameShuffle Stream",
};

export default function StreamLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="stream-layout">
        {children}

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
