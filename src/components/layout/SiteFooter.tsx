import { Footer } from "@empac/cascadeds";

const LEGAL_LINKS = [
  { label: "Help Center", href: "/help" },
  { label: "Terms of Service", href: "/terms" },
  { label: "Privacy Policy", href: "/privacy" },
  { label: "Cookie Policy", href: "/cookie-policy" },
  // Special hash route — CookieConsent watches for it and pops the prefs modal.
  { label: "Cookie Preferences", href: "#cookie-preferences" },
  { label: "Accessibility", href: "/accessibility" },
  { label: "Data Request", href: "/data-request" },
  { label: "Support", href: "mailto:support@gameshuffle.co" },
  { label: "Contact Us", href: "/contact-us" },
];

const EMPAC_CREDIT = [{ label: "Built by Empac", href: "https://empac.co/" }];

export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <Footer
      variant="simple"
      className="site-footer"
      sections={[{ title: "", links: LEGAL_LINKS }]}
      copyright={`© ${year} GameShuffle`}
      bottomLinks={EMPAC_CREDIT}
    />
  );
}
