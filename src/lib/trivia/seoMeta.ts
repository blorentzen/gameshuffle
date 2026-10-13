import type { Metadata } from "next";
import { shareMeta } from "@/lib/og/meta";

/** The trivia section's share picture (the folder's opengraph image). A page that
 *  sets its own openGraph replaces the inherited one, so each page restates it. */
export const TRIVIA_IMAGE = "/trivia/opengraph-image.jpg";

export function triviaMetadata(input: { title: string; description: string; path: string; article?: boolean; noindex?: boolean }): Metadata {
  const base = shareMeta({ title: input.title, description: input.description, path: input.path });
  return {
    title: input.title,
    description: input.description,
    ...base,
    openGraph: { ...base.openGraph, type: input.article ? "article" : "website", images: [{ url: TRIVIA_IMAGE, width: 1200, height: 630, alt: "GameShuffle trivia nights" }] },
    twitter: { ...base.twitter, images: [TRIVIA_IMAGE] },
    ...(input.noindex ? { robots: { index: false, follow: true } } : {}),
  };
}
