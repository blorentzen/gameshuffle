import { MarketingFooter } from "@empac/cascadeds";

/**
 * Site footer — CDS `MarketingFooter` (logo + multi-column sections +
 * social row + contact).
 *
 * The newsletter ("Product updates") module is intentionally omitted for
 * now: the opt-in API exists, but the public endpoint isn't abuse-gated
 * (no Turnstile / double opt-in) yet, so we don't surface a raw subscribe
 * field. (Follow-up: add once the capture flow is spam-safe.)
 *
 * `socialLinks` carry the real brand accounts only — never fabricated URLs.
 * Add more as handles are confirmed.
 */

/** Brand glyphs for the social row, rendered as INLINE svg (not <img>) so the
 *  icon inherits the footer link color — including CDS's hover state. An <img>
 *  renders the SVG in isolation, so its `currentColor` can't follow hover.
 *  Paths mirror /public/images/icons/{tiktok,instagram,facebook}.svg. */
const SOCIAL_PATHS = {
  tiktok:
    "M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5.74 20.87a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1.78-.87z",
  instagram:
    "M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919C8.416 2.175 8.796 2.163 12 2.163zm0-2.163C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z",
  facebook:
    "M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z",
  discord:
    "M20.317 4.369a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.1 13.1 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.009c.12.099.246.198.373.292a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.891.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.055c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.331c-1.183 0-2.157-1.086-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.332-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.086-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.332-.946 2.418-2.157 2.418z",
  youtube:
    "M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z",
};

function SocialIcon({ path }: { path: string }) {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} fill="currentColor" aria-hidden="true">
      <path d={path} />
    </svg>
  );
}

const SOCIAL_LINKS = [
  { label: "Discord", href: "https://discord.gg/UwxNjq9kwe", icon: <SocialIcon path={SOCIAL_PATHS.discord} /> },
  { label: "YouTube", href: "https://www.youtube.com/@GameShuffleCo", icon: <SocialIcon path={SOCIAL_PATHS.youtube} /> },
  { label: "TikTok", href: "https://www.tiktok.com/@gameshuffle", icon: <SocialIcon path={SOCIAL_PATHS.tiktok} /> },
  { label: "Instagram", href: "https://www.instagram.com/gameshuffle.co/", icon: <SocialIcon path={SOCIAL_PATHS.instagram} /> },
  { label: "Facebook", href: "https://www.facebook.com/profile.php?id=61592784196480", icon: <SocialIcon path={SOCIAL_PATHS.facebook} /> },
];

const SECTIONS = [
  {
    title: "Apps",
    links: [
      { label: "Mario Kart 8 Deluxe Randomizer", href: "/randomizers/mario-kart-8-deluxe" },
      { label: "Mario Kart World Randomizer", href: "/randomizers/mario-kart-world" },
      { label: "Competitive Hub", href: "/competitive/mario-kart-8-deluxe" },
      { label: "Tournaments", href: "/tournament" },
      { label: "Pokémon TCG", href: "/pokemon-tcg" },
      { label: "TCG Companion", href: "/tcg-companion" },
    ],
  },
  {
    title: "Free Tools",
    links: [
      { label: "Wheel Spinner", href: "/wheel-spinner" },
      { label: "Dice Roller", href: "/dice-roller" },
      { label: "Coin Flip", href: "/coin-flip" },
      { label: "Tier List Maker", href: "/tier-list-maker" },
      { label: "Bingo Card Generator", href: "/bingo-card-generator" },
      { label: "Magic 8-Ball", href: "/magic-8-ball" },
      { label: "All free tools", href: "/tools" },
    ],
  },
  {
    title: "Product",
    links: [
      { label: "GameShuffle Pro", href: "/gs-pro" },
      { label: "Features", href: "/features" },
      { label: "Pricing", href: "/gs-pro#pricing" },
      { label: "Streamer Beta", href: "/beta" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "Find Players", href: "/players" },
      { label: "Idea Board", href: "/ideas" },
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
      logo={
        <span className="site-footer__logo">
          {/* Theme-swapped wordmark: black on the light footer, white when the
              footer flips dark. CSS in account.css keys on the theme signal. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="site-footer__logo-img site-footer__logo--light"
            src="/images/fg/logos/gameshuggle-blk.png"
            alt="GameShuffle"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="site-footer__logo-img site-footer__logo--dark"
            src="/images/fg/logos/gameshuggle-wht.png"
            alt="GameShuffle"
          />
        </span>
      }
      description="Game-night companion tools for Mario Kart and beyond: randomizers, competitive scoring, tournaments, and a token-powered platform layer for streamers."
      sections={SECTIONS}
      socialLinks={SOCIAL_LINKS}
      contactInfo={{ email: "support@gameshuffle.co" }}
      copyright={`© ${year} GameShuffle`}
      bottomLinks={BOTTOM_LINKS}
    />
  );
}
