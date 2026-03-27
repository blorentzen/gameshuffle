import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

// Content Security Policy (report-only mode — monitor before enforcing)
const cspDirectives = [
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
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://plausible.io https://www.google-analytics.com https://*.sentry.io https://challenges.cloudflare.com",
  // Frames: JotForm contact form, Turnstile widget
  "frame-src https://form.jotform.com https://challenges.cloudflare.com",
  // Workers: self + blob (Sentry uses blob workers)
  "worker-src 'self' blob:",
  // Object/base: none
  "object-src 'none'",
  "base-uri 'self'",
  // Form actions
  "form-action 'self'",
  // Frame ancestors (matches X-Frame-Options SAMEORIGIN)
  "frame-ancestors 'self'",
].join("; ");

// Security headers
const securityHeaders = [
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Content-Security-Policy', value: cspDirectives },
]

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
      {
        source: "/(.*)",
        headers: securityHeaders,
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
