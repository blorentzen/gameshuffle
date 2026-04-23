import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

// Base CSP directives (excluding frame-ancestors — set per-route)
const baseCspDirectives = [
  "default-src 'self'",
  // Scripts: self, inline (Next.js needs it), eval (Next.js dev), plus third-party services
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com https://plausible.io https://www.googletagmanager.com https://www.google-analytics.com https://*.sentry.io",
  // Styles: self + inline (CDS uses inline styles)
  "style-src 'self' 'unsafe-inline'",
  // Images: self, data URIs, Discord/Twitch avatars, Supabase
  "img-src 'self' data: blob: https://cdn.empac.co https://cdn.discordapp.com https://static-cdn.jtvnw.net https://*.supabase.co",
  // Fonts: self
  "font-src 'self'",
  // Connect: API calls to Supabase, analytics, Sentry, Turnstile
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://plausible.io https://www.google-analytics.com https://*.sentry.io https://challenges.cloudflare.com https://discord.com",
  // Frames: JotForm contact form, Turnstile widget
  "frame-src https://form.jotform.com https://challenges.cloudflare.com",
  // Workers: self + blob (Sentry uses blob workers)
  "worker-src 'self' blob:",
  // Object/base: none
  "object-src 'none'",
  "base-uri 'self'",
  // Form actions
  "form-action 'self'",
];

// Global CSP — standard pages only (matches X-Frame-Options: SAMEORIGIN)
const globalCsp = [...baseCspDirectives, "frame-ancestors 'self'"].join("; ");

// Overlay CSP — allow embedding anywhere (OBS browser source)
const overlayCsp = [...baseCspDirectives, "frame-ancestors *"].join("; ");

// Discord Activity CSP — allow embedding inside Discord's iframe
const activityCsp = [
  ...baseCspDirectives,
  "frame-ancestors https://discord.com https://*.discord.com",
].join("; ");

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.empac.co",
        pathname: "/gameshuffle/**",
      },
    ],
  },
  async headers() {
    return [
      // ─── Discord API routes ───────────────────────────────────────────
      // Only Discord's servers should be calling these
      {
        source: "/api/discord/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "https://discord.com" },
          { key: "Access-Control-Allow-Methods", value: "POST, OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type, X-Signature-Ed25519, X-Signature-Timestamp" },
        ],
      },

      // ─── Twitch API routes ────────────────────────────────────────────
      // Server-to-server POST — CORS not strictly required but set explicitly
      {
        source: "/api/twitch/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "https://eventsub.twitch.tv" },
          { key: "Access-Control-Allow-Methods", value: "POST, OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type, Twitch-Eventsub-Message-Signature, Twitch-Eventsub-Message-Timestamp" },
        ],
      },

      // ─── OG image route ───────────────────────────────────────────────
      // Public — must be open for social platforms to fetch preview images
      {
        source: "/api/og",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=3600" },
        ],
      },

      // ─── All other API routes ─────────────────────────────────────────
      // Only gameshuffle.co frontend should call these
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "https://gameshuffle.co" },
          { key: "Access-Control-Allow-Methods", value: "GET, POST, PUT, DELETE, OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type, Authorization" },
          { key: "Access-Control-Allow-Credentials", value: "true" },
        ],
      },

      // ─── Stream overlay ───────────────────────────────────────────────
      // Loaded as OBS browser source — must be embeddable in iframes
      // Overrides the global X-Frame-Options and CSP for this route
      {
        source: "/stream/overlay/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "X-Frame-Options", value: "ALLOWALL" },
          { key: "Content-Security-Policy", value: overlayCsp },
        ],
      },

      // ─── Twitch broadcaster overlay ────────────────────────────────────
      // Same constraints as the stream overlay above — OBS browser source
      // for the per-streamer randomizer combo card.
      {
        source: "/overlay/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "X-Frame-Options", value: "ALLOWALL" },
          { key: "Content-Security-Policy", value: overlayCsp },
        ],
      },

      // ─── Discord Activity route ───────────────────────────────────────
      // Runs inside Discord's iframe — must allow Discord as frame ancestor
      {
        source: "/discord/activity/:path*",
        headers: [
          { key: "X-Frame-Options", value: "ALLOWALL" },
          { key: "Content-Security-Policy", value: activityCsp },
        ],
      },

      // ─── Global security headers ──────────────────────────────────────
      // Applied to all routes — tighten defaults across the board
      {
        source: "/:path*",
        headers: [
          // Prevent MIME type sniffing
          { key: "X-Content-Type-Options", value: "nosniff" },

          // Prevent clickjacking on standard pages
          // NOTE: overridden above for overlay and activity routes
          { key: "X-Frame-Options", value: "SAMEORIGIN" },

          // Control referrer information sent to external sites
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },

          // Disable browser features GameShuffle doesn't use
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },

          // Force HTTPS — 1 year, include subdomains
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },

          // DNS prefetching — on for performance
          { key: "X-DNS-Prefetch-Control", value: "on" },

          // Content Security Policy (overridden for overlay/activity routes above)
          { key: "Content-Security-Policy", value: globalCsp },
        ],
      },
    ];
  },
  async redirects() {
    return [
      // Preserve SEO equity from old URLs
      {
        source: "/mario-kart-8-deluxe-randomizer",
        destination: "/randomizers/mario-kart-8-deluxe",
        permanent: true,
      },
      {
        source: "/mario-kart-8-deluxe-randomizer/",
        destination: "/randomizers/mario-kart-8-deluxe",
        permanent: true,
      },
      // Catch the short slug too
      {
        source: "/randomizers/mario-kart-8",
        destination: "/randomizers/mario-kart-8-deluxe",
        permanent: true,
      },
      {
        source: "/mario-kart-world-randomizer",
        destination: "/randomizers/mario-kart-world",
        permanent: true,
      },
      {
        source: "/mario-kart-world-randomizer/",
        destination: "/randomizers/mario-kart-world",
        permanent: true,
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: "empac-design",

  project: "gameshuffle",

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  tunnelRoute: "/monitoring",

  webpack: {
    // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
    // See the following for more information:
    // https://docs.sentry.io/product/crons/
    // https://vercel.com/docs/cron-jobs
    automaticVercelMonitors: true,

    // Tree-shaking options for reducing bundle size
    treeshake: {
      // Automatically tree-shake Sentry logger statements to reduce bundle size
      removeDebugLogging: true,
    },
  },
});
