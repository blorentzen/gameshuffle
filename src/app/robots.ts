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
  // Private and utility routes: no SEO value.
  const disallow = [
    "/account",
    "/account/",
    "/admin",
    "/admin/",
    "/stream",
    "/stream/",
    "/stream-card",
    "/stream-card/",
    "/social/",
    // The MMR card's private OBS links.
    "/mmr/",
    // Speedrun overlays, private by link.
    "/run/",
    // War overlays (GameShuffle Competitive), private by link.
    "/war/",
    "/war-overlay/",
    "/tournament/create",
    "/tournament/*/manage",
    "/login",
    "/signup",
    // Redirects into sign-up or Discord's bot install.
    "/discord/add",
    "/api/",
    // Lounge player pages come in ?tab=, ?season= and ?game= variants of the same page (its canonical
    // drops them); crawling each variant multiplied the bot traffic. Compare and find pages are noindex.
    "/lounge/*?",
    "/lounge/compare/",
    "/lounge/find",
  ];
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow },
      // Amazon's and Petal's crawlers loaded ~5,200 lounge player pages a day, plus two preview
      // images each (load audit, 2026-11-01), mostly pages that are noindex anyway. They keep the
      // rest of the site. A crawler follows only its own group, so it repeats the shared rules.
      { userAgent: ["Amazonbot", "PetalBot"], allow: "/", disallow: [...disallow, "/lounge/"] },
    ],
    sitemap: "https://www.gameshuffle.co/sitemap.xml",
  };
}
