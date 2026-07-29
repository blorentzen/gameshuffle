import "server-only";

/**
 * Deck content pipeline (Pokémon TCG deck pages, `specs/tcg-setup`).
 *
 * Deck guides live as `content/decks/[slug].mdx` — YAML frontmatter (the
 * single source of truth for listing / filtering / featured selection /
 * SEO) plus a GFM-markdown body. `gray-matter` parses the frontmatter; the
 * body is rendered by react-markdown + remark-gfm in the detail route.
 *
 * The frontmatter field names map 1:1 to a future Supabase table, so keep
 * this schema flat + migration-clean (per the spec).
 *
 * NOTE ON RENDERING: we intentionally do NOT use @next/mdx. In Next 16 +
 * Turbopack that toolchain is heavier (build-config change + dev restart +
 * more deps) for content that is structured GFM markdown with no inline
 * JSX. The `.mdx` extension + frontmatter schema are preserved so the
 * authoring model + future migration match the spec exactly.
 */

import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import {
  DECK_TIERS,
  type Deck,
  type DeckFrontmatter,
  type DeckTier,
} from "./types";

// Re-export the client-safe types/constants so server callers can keep
// importing everything from "@/lib/decks".
export {
  DECK_TIERS,
  DECK_TIER_LABEL,
  DECK_TIER_BADGE_VARIANT,
  orderedTierBadges,
  hasProvableWinRate,
  type Deck,
  type DeckFrontmatter,
  type DeckTier,
  type DeckBadgeVariant,
} from "./types";

const DECKS_DIR = path.join(process.cwd(), "content", "decks");

function normalizeFrontmatter(
  data: Record<string, unknown>,
  slug: string,
): DeckFrontmatter {
  const str = (v: unknown, fallback = ""): string =>
    typeof v === "string" ? v : fallback;

  // Multi-value tiers. Accept a `tiers` array; validate against the enum.
  const rawTiers = Array.isArray(data.tiers)
    ? (data.tiers as unknown[]).map((t) => String(t) as DeckTier)
    : [];
  const tiers = rawTiers.filter((t) => DECK_TIERS.includes(t));
  const safeTiers: DeckTier[] = tiers.length > 0 ? tiers : ["competitive"];

  // `featured_tier` must be one of the deck's own tiers, else not-featured.
  const rawFeaturedTier = str(data.featured_tier) as DeckTier;
  const featuredTier: DeckTier | null =
    DECK_TIERS.includes(rawFeaturedTier) && safeTiers.includes(rawFeaturedTier)
      ? rawFeaturedTier
      : null;
  // `featured: true` with no valid featured_tier is meaningless — treat as
  // not-featured (per spec: warn + ignore).
  const featured = data.featured === true && featuredTier !== null;
  if (data.featured === true && featuredTier === null) {
    console.warn(
      `[decks] "${slug}" is featured:true but featured_tier is missing/invalid — ignoring featured flag.`,
    );
  }

  const winRate =
    data.win_rate === null || data.win_rate === undefined || data.win_rate === ""
      ? null
      : String(data.win_rate);
  const winRateSource =
    typeof data.win_rate_source === "string" && data.win_rate_source
      ? data.win_rate_source
      : null;

  return {
    title: str(data.title),
    slug: str(data.slug, slug),
    archetype: str(data.archetype),
    tiers: safeTiers,
    featured_tier: featuredTier,
    featured,
    format: str(data.format),
    deck_type: str(data.deck_type),
    battle_box_partner:
      typeof data.battle_box_partner === "string" && data.battle_box_partner
        ? data.battle_box_partner
        : null,
    // win_rate is nullable on purpose (family/meme decks lack meta data).
    win_rate: winRate,
    win_rate_source: winRateSource,
    cost_estimate: str(data.cost_estimate),
    difficulty: str(data.difficulty),
    meta_description: str(data.meta_description),
    target_keyword: str(data.target_keyword),
    secondary_keywords: Array.isArray(data.secondary_keywords)
      ? (data.secondary_keywords as unknown[]).map(String)
      : [],
    og_image: str(data.og_image),
    canonical: str(data.canonical),
    last_verified: str(data.last_verified),
    review_by: str(data.review_by),
  };
}

function readDeckFile(slug: string): Deck | null {
  const file = path.join(DECKS_DIR, `${slug}.mdx`);
  if (!fs.existsSync(file)) return null;
  const { data, content } = matter(fs.readFileSync(file, "utf8"));
  return { frontmatter: normalizeFrontmatter(data, slug), body: content.trim() };
}

/** Every deck slug (drives generateStaticParams + sitemap). */
export function getDeckSlugs(): string[] {
  if (!fs.existsSync(DECKS_DIR)) return [];
  return fs
    .readdirSync(DECKS_DIR)
    .filter((f) => f.endsWith(".mdx"))
    .map((f) => f.replace(/\.mdx$/, ""));
}

export function getAllDecks(): Deck[] {
  return getDeckSlugs()
    .map(readDeckFile)
    .filter((d): d is Deck => d !== null);
}

export function getDeckBySlug(slug: string): Deck | null {
  return readDeckFile(slug);
}

/**
 * One featured deck per tier for the hub (multi-tier taxonomy):
 *   - candidates = decks with `featured: true` AND `featured_tier === T`
 *     (a multi-tier deck can only fill the ONE slot it designated);
 *   - if none, fall back to any deck whose `tiers` INCLUDES T;
 *   - tiebreak: most recent `last_verified`, then alphabetical by slug;
 *   - tiers with zero member decks are omitted entirely.
 * Deterministic — never throws on two-flagged or zero-flagged tiers.
 */
export function getFeaturedByTier(): Partial<Record<DeckTier, Deck>> {
  const all = getAllDecks();
  const out: Partial<Record<DeckTier, Deck>> = {};
  const byRecency = (a: Deck, b: Deck) => {
    const byDate =
      Date.parse(b.frontmatter.last_verified || "") -
      Date.parse(a.frontmatter.last_verified || "");
    return byDate !== 0
      ? byDate
      : a.frontmatter.slug.localeCompare(b.frontmatter.slug);
  };
  for (const tier of DECK_TIERS) {
    const inTier = all.filter((d) => d.frontmatter.tiers.includes(tier));
    if (inTier.length === 0) continue;
    const flagged = inTier.filter(
      (d) => d.frontmatter.featured && d.frontmatter.featured_tier === tier,
    );
    const pool = flagged.length > 0 ? flagged : inTier;
    pool.sort(byRecency);
    out[tier] = pool[0];
  }
  return out;
}
