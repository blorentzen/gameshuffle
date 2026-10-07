import type { MetadataRoute } from "next";
import { publishedGuidesAsync } from "@/lib/guides/store";
import { GUIDES_PUBLIC, MK64_PUBLIC, PERFECT_DARK_PUBLIC, OVERWATCH_PUBLIC, MARVEL_RIVALS_PUBLIC } from "@/lib/games-visibility";
import { createPublicClient } from "@/lib/supabase/public";
import { listCompetitiveGames } from "@/lib/competitive/config";
import { HELP_ARTICLES } from "@/lib/help/manifest";
import { COMPANION_TOOLS } from "@/lib/game-nights/companion/tools";
import { MARKETING_APP_PATHS } from "@/data/marketing-apps";
import { SITE_URL } from "@/lib/seo";
import { getDeckSlugs } from "@/lib/decks";
import { getBattleBoxSlugs } from "@/lib/battle-boxes";
import { TCG_HUB_LIVE } from "@/data/tcg-hub";
import { TIER_TEMPLATES } from "@/data/tier-templates";
import { BINGO_TEMPLATES } from "@/data/bingo-templates";
import { TRUTH_OR_DARE_SETS } from "@/data/truth-or-dare";
import { publicDestinations } from "@/lib/nav/pillars";
import { N64_PARTY_PUBLIC, FRLG_PUBLIC, GOLDENEYE_PUBLIC, KIRBY_PUBLIC, STADIUM_PUBLIC, SMASH_PUBLIC, SPLATOON_PUBLIC } from "@/lib/games-visibility";
import LASTMOD from "@/data/sitemap-lastmod.json";

export const revalidate = 3600; // regenerate every hour

/**
 * Public pages deliberately left out: /beta (a sign-up gate), /features (a
 * redirect). Profiles, quote pools and tournament instances are left out too,
 * as thin or short-lived pages; those pages carry their own robots rules.
 */
const UNLISTED = new Set(["/beta", "/features"]);
/** Tool pages marked noindex (prototypes), kept out of the tool list below. */
const NOINDEX_TOOLS = new Set(["shuffle-dice"]);

/**
 * When a page's content last changed, from src/data/sitemap-lastmod.json
 * (git history, refreshed by `npm run sitemap:lastmod`). Unknown paths get no
 * lastmod rather than a made-up one.
 */
function lm(path: string): Date | undefined {
  const d = (LASTMOD as Record<string, string>)[path];
  return d ? new Date(`${d}T00:00:00Z`) : undefined;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Competitive hubs are per game now; list whichever games have a config.
  const COMPETITIVE_GAME_SLUGS = await listCompetitiveGames(createPublicClient() as never)
    .then((games) => games.map((g) => g.gameSlug))
    .catch(() => ["mario-kart-8-deluxe"]);
  const baseUrl = SITE_URL;

  // --- Static routes ---
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: lm("/"),
      changeFrequency: "weekly",
      priority: 1.0,
    },
    {
      url: `${baseUrl}/apps`,
      lastModified: lm("/apps"),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/for-streamers`,
      lastModified: lm("/for-streamers"),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/for-streamers/current`,
      lastModified: lm("/for-streamers/current"),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/for-streamers/aspiring`,
      lastModified: lm("/for-streamers/aspiring"),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/discord`,
      lastModified: lm("/discord"),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/for-organizers`,
      lastModified: lm("/for-organizers"),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/gs-circuit`,
      lastModified: lm("/gs-circuit"),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/tools`,
      lastModified: lm("/tools"),
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${baseUrl}/daily`,
      lastModified: lm("/daily"),
      changeFrequency: "daily",
      priority: 0.7,
    },
    {
      url: `${baseUrl}/weekly`,
      lastModified: lm("/weekly"),
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${baseUrl}/wheel-spinner`,
      lastModified: lm("/wheel-spinner"),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/dice-roller`,
      lastModified: lm("/dice-roller"),
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${baseUrl}/coin-flip`,
      lastModified: lm("/coin-flip"),
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${baseUrl}/name-picker`,
      lastModified: lm("/name-picker"),
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${baseUrl}/stream-timer`,
      lastModified: lm("/stream-timer"),
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${baseUrl}/tier-list-maker`,
      lastModified: lm("/tier-list-maker"),
      changeFrequency: "monthly",
      priority: 0.7,
    },
    ...TIER_TEMPLATES.map((t) => ({
      url: `${baseUrl}/tier-list-maker/${t.slug}`,
      lastModified: lm("/tier-list-maker/[template]"),
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
    {
      url: `${baseUrl}/bingo-card-generator`,
      lastModified: lm("/bingo-card-generator"),
      changeFrequency: "monthly",
      priority: 0.7,
    },
    ...BINGO_TEMPLATES.map((t) => ({
      url: `${baseUrl}/bingo-card-generator/${t.slug}`,
      lastModified: lm("/bingo-card-generator/[template]"),
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
    {
      url: `${baseUrl}/magic-8-ball`,
      lastModified: lm("/magic-8-ball"),
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${baseUrl}/yes-no`,
      lastModified: lm("/yes-no"),
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${baseUrl}/truth-or-dare`,
      lastModified: lm("/truth-or-dare"),
      changeFrequency: "monthly",
      priority: 0.7,
    },
    ...TRUTH_OR_DARE_SETS.map((s) => ({
      url: `${baseUrl}/truth-or-dare/${s.slug}`,
      lastModified: lm("/truth-or-dare/[set]"),
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
    {
      url: `${baseUrl}/randomizers`,
      lastModified: lm("/randomizers"),
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/randomizers/mario-kart-8-deluxe`,
      lastModified: lm("/randomizers/mario-kart-8-deluxe"),
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/randomizers/mario-kart-world`,
      lastModified: lm("/randomizers/mario-kart-world"),
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/randomizers/super-mario-party-jamboree`,
      lastModified: lm("/randomizers/super-mario-party-jamboree"),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/randomizers/mario-party-superstars`,
      lastModified: lm("/randomizers/mario-party-superstars"),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    ...(SMASH_PUBLIC ? [{
      url: `${baseUrl}/randomizers/super-smash-bros-ultimate`,
      lastModified: lm("/randomizers/super-smash-bros-ultimate"),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    }] : []),
    ...(SPLATOON_PUBLIC ? [{
      url: `${baseUrl}/randomizers/splatoon-3`,
      lastModified: lm("/randomizers/splatoon-3"),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    }] : []),
    ...(STADIUM_PUBLIC ? [{
      url: `${baseUrl}/randomizers/pokemon-stadium`,
      lastModified: lm("/randomizers/pokemon-stadium"),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    }] : []),
    ...(N64_PARTY_PUBLIC ? [{
      url: `${baseUrl}/randomizers/mario-party`,
      lastModified: lm("/randomizers/mario-party"),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    }] : []),
    ...(N64_PARTY_PUBLIC ? [{
      url: `${baseUrl}/randomizers/mario-party-2`,
      lastModified: lm("/randomizers/mario-party-2"),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    }] : []),
    ...(N64_PARTY_PUBLIC ? [{
      url: `${baseUrl}/randomizers/mario-party-3`,
      lastModified: lm("/randomizers/mario-party-3"),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    }] : []),
    ...(FRLG_PUBLIC ? [{
      url: `${baseUrl}/randomizers/pokemon-firered-leafgreen`,
      lastModified: lm("/randomizers/pokemon-firered-leafgreen"),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    }] : []),
    ...(MK64_PUBLIC ? [{
      url: `${baseUrl}/randomizers/mario-kart-64`,
      lastModified: lm("/randomizers/mario-kart-64"),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    }] : []),
    ...(PERFECT_DARK_PUBLIC ? [{
      url: `${baseUrl}/randomizers/perfect-dark`,
      lastModified: lm("/randomizers/perfect-dark"),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    }] : []),
    ...(OVERWATCH_PUBLIC ? [{
      url: `${baseUrl}/randomizers/overwatch`,
      lastModified: lm("/randomizers/overwatch"),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    }] : []),
    ...(MARVEL_RIVALS_PUBLIC ? [{
      url: `${baseUrl}/randomizers/marvel-rivals`,
      lastModified: lm("/randomizers/marvel-rivals"),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    }] : []),
    ...(GOLDENEYE_PUBLIC ? [{
      url: `${baseUrl}/randomizers/goldeneye-007`,
      lastModified: lm("/randomizers/goldeneye-007"),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    }] : []),
    ...(KIRBY_PUBLIC ? [{
      url: `${baseUrl}/randomizers/kirby-air-riders`,
      lastModified: lm("/randomizers/kirby-air-riders"),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    }] : []),
    ...COMPETITIVE_GAME_SLUGS.map((slug) => ({
      url: `${baseUrl}/competitive/${slug}`,
      lastModified: lm("/competitive/[game]"),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
    {
      url: `${baseUrl}/tournament`,
      lastModified: lm("/tournament"),
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/gs-pro`,
      lastModified: lm("/gs-pro"),
      changeFrequency: "weekly",
      priority: 0.9,
    },
    // Per-app marketing landing pages (the keyword-targeted SEO surface).
    ...MARKETING_APP_PATHS.filter((path) => SMASH_PUBLIC || !path.includes("smash")).map((path) => ({
      url: `${baseUrl}${path}`,
      lastModified: lm(path),
      changeFrequency: "weekly" as const,
      priority: 0.9,
    })),
    {
      url: `${baseUrl}/contact-us`,
      lastModified: lm("/contact-us"),
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${baseUrl}/terms`,
      lastModified: lm("/terms"),
      changeFrequency: "yearly",
      priority: 0.2,
    },
    {
      url: `${baseUrl}/privacy`,
      lastModified: lm("/privacy"),
      changeFrequency: "yearly",
      priority: 0.2,
    },
    {
      url: `${baseUrl}/sms`,
      lastModified: lm("/sms"),
      changeFrequency: "yearly" as const,
      priority: 0.3,
    },
    {
      url: `${baseUrl}/accessibility`,
      lastModified: lm("/accessibility"),
      changeFrequency: "yearly",
      priority: 0.2,
    },
    {
      url: `${baseUrl}/legal/tcg-attribution`,
      lastModified: lm("/legal/tcg-attribution"),
      changeFrequency: "yearly",
      priority: 0.2,
    },
    {
      url: `${baseUrl}/help`,
      lastModified: lm("/help"),
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${baseUrl}/help/contact`,
      lastModified: lm("/help/contact"),
      changeFrequency: "monthly",
      priority: 0.5,
    },
    // Free game-night tools: the hub plus every registered tool (the tool pages
    // were missing from the sitemap entirely until 2026-09-29).
    { url: `${baseUrl}/game-nights/tools`, lastModified: lm("/game-nights/tools"), changeFrequency: "monthly", priority: 0.6 },
    ...COMPANION_TOOLS.filter((t) => !NOINDEX_TOOLS.has(t.id)).map((t) => ({
      url: `${baseUrl}${t.href}`,
      lastModified: lm(t.href),
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
    ...HELP_ARTICLES.map((a) => ({
      url: `${baseUrl}${a.href}`,
      lastModified: lm("/help"),
      changeFrequency: "monthly" as const,
      priority: 0.5,
    })),
  ];

  // Anything in the IA that the hand-written list above missed. The pillar map
  // is the source of truth for what the site contains, so new destinations get
  // indexed by being added there rather than by remembering to edit two files.
  // Auth-gated entries are excluded by `publicDestinations` — a crawler would
  // only ever see a redirect.
  const known = new Set(staticRoutes.map((r) => String(r.url)));
  for (const href of publicDestinations()) {
    if (UNLISTED.has(href)) continue;
    const url = `${baseUrl}${href === "/" ? "" : href}`;
    if (known.has(url)) continue;
    staticRoutes.push({ url, lastModified: lm(href), changeFrequency: "weekly", priority: 0.6 });
    known.add(url);
  }

  // --- Guides: the SEO cluster. Manifest-driven, and `published` gates it, so
  //     an unfinished guide never appears here or in routing. ---
  for (const g of GUIDES_PUBLIC ? await publishedGuidesAsync() : []) {
    const url = `${baseUrl}/guides/${g.slug}`;
    if (known.has(url)) continue;
    staticRoutes.push({ url, lastModified: g.updatedAt ? new Date(g.updatedAt) : lm("/guides/[slug]"), changeFrequency: "monthly", priority: 0.7 });
    known.add(url);
  }

  // --- Dynamic routes: public championship season pages ---
  let championshipRoutes: MetadataRoute.Sitemap = [];
  try {
    const supabase = createPublicClient();
    const { data: championships } = await supabase
      .from("championships")
      .select("id, updated_at, status")
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(1000);

    if (championships) {
      championshipRoutes = championships.map((c) => ({
        url: `${baseUrl}/tournament/championship/${c.id}`,
        lastModified: new Date(c.updated_at as string),
        changeFrequency: "weekly" as const,
        priority: 0.5,
      }));
    }
  } catch (err) {
    console.error("Sitemap: failed to fetch championships", err);
  }

  // --- Pokémon TCG deck cluster (hub + every deck detail) ---
  // Emitted only once the TCG surface is live — the deck pages funnel to
  // /pokemon-tcg, which is noindex/FPO until TCG_HUB_LIVE flips. Slugs are
  // read from the content directory at build time.
  let deckRoutes: MetadataRoute.Sitemap = [];
  if (TCG_HUB_LIVE) {
    const slugs = getDeckSlugs();
    deckRoutes = [
      {
        url: `${baseUrl}/pokemon-tcg`,
        lastModified: lm("/pokemon-tcg"),
        changeFrequency: "weekly" as const,
        priority: 0.8,
      },
      {
        url: `${baseUrl}/pokemon-tcg/decks`,
        lastModified: lm("/pokemon-tcg/decks"),
        changeFrequency: "weekly" as const,
        priority: 0.6,
      },
      ...slugs.map((slug) => ({
        url: `${baseUrl}/pokemon-tcg/decks/${slug}`,
        lastModified: lm("/pokemon-tcg/decks/[deck]"),
        changeFrequency: "monthly" as const,
        priority: 0.6,
      })),
      ...getBattleBoxSlugs().map((slug) => ({
        url: `${baseUrl}/pokemon-tcg/decks/battle-box/${slug}`,
        lastModified: lm("/pokemon-tcg/decks/battle-box/[slug]"),
        changeFrequency: "monthly" as const,
        priority: 0.6,
      })),
    ];
  }

  // --- Idea Board: the board index + public idea detail pages ---
  // The RLS-scoped client returns only publicly-visible rows (expired/pending
  // ideas are filtered by policy), so no extra guarding needed here (D6).
  let ideaRoutes: MetadataRoute.Sitemap = [];
  try {
    const supabase = createPublicClient();
    const { data: ideas } = await supabase
      .from("gs_ideas")
      .select("id, published_at")
      .order("published_at", { ascending: false })
      .limit(2000);
    ideaRoutes = [
      { url: `${baseUrl}/ideas`, lastModified: lm("/ideas"), changeFrequency: "daily", priority: 0.6 },
      ...((ideas ?? []) as { id: string; published_at: string | null }[]).map((i) => ({
        url: `${baseUrl}/ideas/${i.id}`,
        lastModified: i.published_at ? new Date(i.published_at) : undefined,
        changeFrequency: "weekly" as const,
        priority: 0.4,
      })),
    ];
  } catch (err) {
    console.error("Sitemap: failed to fetch ideas", err);
  }

  return [
    ...staticRoutes,
    ...championshipRoutes,
    ...deckRoutes,
    ...ideaRoutes,
  ];
}
