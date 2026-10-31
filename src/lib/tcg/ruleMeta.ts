import type { Metadata } from "next";
import { shareMeta } from "@/lib/og/meta";
import { ruleUrl, type RulePage } from "@/data/tcg-rules";

/** The rules section's share picture (the folder's opengraph image). A page that
 *  sets its own openGraph replaces the inherited one, so each page restates it. */
const RULES_IMAGE = "/pokemon-tcg/rules/opengraph-image.jpg";

export function ruleMetadata(page: RulePage): Metadata {
  const base = shareMeta({ title: page.title, description: page.description, path: ruleUrl(page.slug) });
  return {
    title: page.title,
    description: page.description,
    ...base,
    openGraph: { ...base.openGraph, type: "article", images: [{ url: RULES_IMAGE, width: 1200, height: 630, alt: "GameShuffle Pokémon TCG rules guide" }] },
    twitter: { ...base.twitter, images: [RULES_IMAGE] },
  };
}
