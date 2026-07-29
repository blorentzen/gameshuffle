import "server-only";

/**
 * Battle Box content pipeline (Pokémon TCG beginner "matched pairs",
 * `specs/tcg-setup/gameshuffle-battle-box-claude-code-spec.md`).
 *
 * Battle Boxes live as `content/battle-boxes/[slug].mdx` — YAML frontmatter
 * (single source of truth for routing / pairing / SEO) plus a GFM-markdown
 * body (the "what this box teaches / play your first game" narrative). Same
 * authoring model + renderer as the deck pages (`@/lib/decks`): `gray-matter`
 * for frontmatter, react-markdown + remark-gfm for the body.
 */

import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import type { BattleBox, BattleBoxFrontmatter } from "./types";

export type { BattleBox, BattleBoxFrontmatter } from "./types";

const BOXES_DIR = path.join(process.cwd(), "content", "battle-boxes");

function normalizeFrontmatter(
  data: Record<string, unknown>,
  slug: string,
): BattleBoxFrontmatter {
  const str = (v: unknown, fallback = ""): string =>
    typeof v === "string" ? v : fallback;
  return {
    title: str(data.title),
    slug: str(data.slug, slug),
    type: "battle-box",
    deck_a: str(data.deck_a),
    deck_b: str(data.deck_b),
    deck_a_role: str(data.deck_a_role),
    deck_b_role: str(data.deck_b_role),
    cost_estimate: str(data.cost_estimate),
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

function readBoxFile(slug: string): BattleBox | null {
  const file = path.join(BOXES_DIR, `${slug}.mdx`);
  if (!fs.existsSync(file)) return null;
  const { data, content } = matter(fs.readFileSync(file, "utf8"));
  return { frontmatter: normalizeFrontmatter(data, slug), body: content.trim() };
}

/** Every battle-box slug (drives generateStaticParams + sitemap). */
export function getBattleBoxSlugs(): string[] {
  if (!fs.existsSync(BOXES_DIR)) return [];
  return fs
    .readdirSync(BOXES_DIR)
    .filter((f) => f.endsWith(".mdx"))
    .map((f) => f.replace(/\.mdx$/, ""));
}

export function getAllBattleBoxes(): BattleBox[] {
  return getBattleBoxSlugs()
    .map(readBoxFile)
    .filter((b): b is BattleBox => b !== null);
}

export function getBattleBoxBySlug(slug: string): BattleBox | null {
  return readBoxFile(slug);
}

/**
 * The Battle Box a given deck belongs to (if any) — matches either
 * `deck_a` or `deck_b` against the deck's slug. Lets a deck detail page
 * render a "part of the [Battle Box] →" link without the deck frontmatter
 * having to name the wrapper.
 */
export function getBattleBoxForDeck(deckSlug: string): BattleBox | null {
  return (
    getAllBattleBoxes().find(
      (b) =>
        b.frontmatter.deck_a === deckSlug || b.frontmatter.deck_b === deckSlug,
    ) ?? null
  );
}
