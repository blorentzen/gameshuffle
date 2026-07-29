/**
 * Client-safe Battle Box types. Kept separate from the loader (`./index.ts`,
 * which is `server-only` because it touches the filesystem) so client
 * components can import the shape without pulling `server-only` into the
 * client bundle — mirrors the deck lib split (`@/lib/decks/types`).
 *
 * A Battle Box is a thin wrapper over TWO existing deck `.mdx` files (the
 * beginner "matched pair"). It owns the "buy the box / learn together" story;
 * the two deck pages do the per-keyword SEO work. See
 * `specs/tcg-setup/gameshuffle-battle-box-claude-code-spec.md`.
 */

export interface BattleBoxFrontmatter {
  // Identity & routing
  title: string;
  slug: string;
  type: "battle-box";
  // The paired decks — each references a deck `.mdx` slug.
  deck_a: string;
  deck_b: string;
  /** Short identity label shown on each deck's card (e.g. "Hit fast").
   *  Falls back to a generic label when absent. */
  deck_a_role: string;
  deck_b_role: string;
  // Hook data
  cost_estimate: string;
  // SEO
  meta_description: string;
  target_keyword: string;
  secondary_keywords: string[];
  og_image: string;
  canonical: string;
  // Lifecycle (decay management)
  last_verified: string;
  review_by: string;
}

export interface BattleBox {
  frontmatter: BattleBoxFrontmatter;
  /** GFM-markdown body (frontmatter stripped). */
  body: string;
}
