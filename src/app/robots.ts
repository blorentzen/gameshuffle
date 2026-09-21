import type { MetadataRoute } from "next";
import { isProduction } from "@/lib/env";

/**
 * Environment-aware robots.txt (replaces the former static public/robots.txt).
 *
 * Production keeps the existing rules. Every other deployment (the stable dev
 * domain, ephemeral previews) is disallowed entirely so a non-prod copy of the
 * site can never be crawled or outrank the real one. Pairs with the per-page
 * `robots: { index: false }` set in the root metadata outside production.
 */
export default function robots(): MetadataRoute.Robots {
  if (!isProduction) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Private and utility routes — no SEO value
      disallow: [
        "/account",
        "/account/",
        "/stream",
        "/stream/",
        "/stream-card",
        "/stream-card/",
        "/tournament/create",
        "/tournament/*/manage",
        "/login",
        "/signup",
        "/api/",
      ],
    },
    sitemap: "https://www.gameshuffle.co/sitemap.xml",
  };
}
