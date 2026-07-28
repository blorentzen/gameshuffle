/**
 * Client-safe deck types + constants. Kept separate from the loader
 * (`./index.ts`, which is `server-only` because it touches the filesystem)
 * so client components — e.g. the hub's tier filter — can import the tier
 * labels/enums without pulling `server-only` into the client bundle.
 */

/** Multi-value tier taxonomy. A deck can belong to more than one tier. */
export type DeckTier = "competitive" | "family-friends" | "meme" | "themed";

/** Tier order for the hub filter tabs + iteration over featured slots. */
export const DECK_TIERS: DeckTier[] = [
  "competitive",
  "family-friends",
  "meme",
  "themed",
];

export const DECK_TIER_LABEL: Record<DeckTier, string> = {
  competitive: "Competitive",
  "family-friends": "Family & Friends",
  meme: "Meme",
  themed: "Themed",
};

/** CDS Badge variant per tier (visually distinct, no Tailwind). */
export type DeckBadgeVariant =
  | "default"
  | "success"
  | "warning"
  | "error"
  | "info"
  | "outline";
export const DECK_TIER_BADGE_VARIANT: Record<DeckTier, DeckBadgeVariant> = {
  competitive: "success",
  themed: "info",
  meme: "warning",
  "family-friends": "outline",
};

/** Stable badge render order, independent of a deck's `tiers` array order. */
const DECK_BADGE_ORDER: DeckTier[] = [
  "competitive",
  "themed",
  "meme",
  "family-friends",
];

/** A deck's tiers as ordered, labelled, variant-tagged badges. */
export function orderedTierBadges(
  tiers: DeckTier[],
): { tier: DeckTier; label: string; variant: DeckBadgeVariant }[] {
  return DECK_BADGE_ORDER.filter((t) => tiers.includes(t)).map((tier) => ({
    tier,
    label: DECK_TIER_LABEL[tier],
    variant: DECK_TIER_BADGE_VARIANT[tier],
  }));
}

export interface DeckFrontmatter {
  // Identity & routing
  title: string;
  slug: string;
  archetype: string;
  // Taxonomy (multi-value)
  tiers: DeckTier[];
  /** The ONE tier whose featured slot this deck may fill. Must be in `tiers`. */
  featured_tier: DeckTier | null;
  featured: boolean;
  format: string;
  deck_type: string;
  /** Slug of the deck this one is paired with in a Battle Box (family tier).
   *  Null/absent for non-paired decks. */
  battle_box_partner: string | null;
  // Hook data
  win_rate: string | null;
  /** Citation (URL or tournament reference) proving `win_rate`. Without it,
   *  NO win-rate badge renders — every displayed win rate must be provable. */
  win_rate_source: string | null;
  cost_estimate: string;
  difficulty: string;
  // SEO
  meta_description: string;
  target_keyword: string;
  secondary_keywords: string[];
  og_image: string;
  canonical: string;
  // Lifecycle
  last_verified: string;
  review_by: string;
}

export interface Deck {
  frontmatter: DeckFrontmatter;
  /** GFM-markdown body (frontmatter stripped). */
  body: string;
}

/** Whether a deck's win rate is provable and should render a badge/line. */
export function hasProvableWinRate(fm: DeckFrontmatter): boolean {
  return Boolean(fm.win_rate && fm.win_rate_source);
}
