import { MarketingFooter } from "@empac/cascadeds";

/**
 * Site footer — CDS `MarketingFooter` (multi-column sections + contact).
 *
 * The newsletter ("Product updates") module is intentionally omitted —
 * we don't have a proper email-capture setup yet, so we don't surface a
 * subscribe field. (Follow-up: re-add once the capture flow is ready.)
 *
 * `socialLinks` is intentionally omitted until real brand handles are
 * supplied — we don't ship fabricated social URLs. (Follow-up: wire
 * Twitch / Discord / X / YouTube once handles are confirmed.)
 */

const SECTIONS = [
  {
    title: "Apps",
    links: [
      { label: "Mario Kart 8 Deluxe Randomizer", href: "/randomizers/mario-kart-8-deluxe" },
      { label: "Mario Kart World Randomizer", href: "/randomizers/mario-kart-world" },
      { label: "Competitive Hub", href: "/competitive/mario-kart-8-deluxe" },
      { label: "Tournaments", href: "/tournament" },
      { label: "TCG Companion", href: "/tcg-companion" },
    ],
  },
  {
    title: "Free Tools",
    links: [
      { label: "Wheel Spinner", href: "/wheel-spinner" },
      { label: "All free tools", href: "/tools" },
    ],
  },
  {
    title: "Product",
    links: [
      { label: "GameShuffle Pro", href: "/gs-pro" },
      { label: "Features", href: "/features" },
      { label: "Pricing", href: "/gs-pro#pricing" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "Help Center", href: "/help" },
      { label: "Contact Us", href: "/contact-us" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Terms of Service", href: "/terms" },
      { label: "Privacy Policy", href: "/privacy" },
      { label: "Cookie Policy", href: "/cookie-policy" },
      { label: "Accessibility", href: "/accessibility" },
      { label: "Data Request", href: "/data-request" },
    ],
  },
];

// Special hash route — CookieConsent watches for it and pops the prefs modal.
const BOTTOM_LINKS = [
  { label: "Cookie Preferences", href: "#cookie-preferences" },
  { label: "Built by Empac", href: "https://empac.co/" },
];

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <MarketingFooter
      variant="light"
      className="site-footer"
      description="Game-night companion tools for Mario Kart and beyond — randomizers, competitive scoring, tournaments, and a token-powered platform layer for streamers."
      sections={SECTIONS}
      contactInfo={{ email: "support@gameshuffle.co" }}
      copyright={`© ${year} GameShuffle`}
      bottomLinks={BOTTOM_LINKS}
    />
  );
}
