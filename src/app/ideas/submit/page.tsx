import type { Metadata } from "next";
import { ideasGameReady } from "@/lib/ideas/store";
import { IDEA_CATEGORIES, IDEA_LIMITS, type IdeaCategory } from "@/lib/ideas/constants";
import { GAME_CATALOG } from "@/data/game-catalog";
import { gameEntry } from "@/lib/games/key";
import { spaceFor, spaceOpen, spacePath } from "@/lib/games/spaces";
import { gsDay } from "@/lib/time/gsClock";
import { IdeaSubmitForm } from "./IdeaSubmitForm";
import "@/styles/space-ideas.css";

export const metadata: Metadata = {
  title: "Submit an idea",
  robots: { index: false, follow: true },
};

/**
 * The Idea Board's form. Links can preselect: `?category=randomizer` (/discord's "Suggest it"), and from a game space
 * `?game=<catalog key>` plus a starter idea's `?title=`.
 */
export default async function SubmitIdeaPage({ searchParams }: { searchParams: Promise<{ category?: string; game?: string; title?: string }> }) {
  const sp = await searchParams;
  const category: IdeaCategory = (IDEA_CATEGORIES as readonly string[]).includes(sp.category ?? "") ? (sp.category as IdeaCategory) : "game_idea";
  const entry = sp.game ? gameEntry(sp.game) : null;
  const space = entry ? spaceFor(entry.slug) : null;
  const gameReady = await ideasGameReady().catch(() => false);
  const names = [...new Set(GAME_CATALOG.map((g) => g.name))].sort((a, b) => a.localeCompare(b));
  const back = new URLSearchParams();
  if (sp.category) back.set("category", sp.category);
  if (entry) back.set("game", entry.slug);
  if (sp.title) back.set("title", sp.title);
  const self = `/ideas/submit${back.toString() ? `?${back.toString()}` : ""}`;

  return (
    <IdeaSubmitForm
      initialGame={entry ? { key: entry.slug, name: entry.name } : null}
      initialTitle={(sp.title ?? "").slice(0, IDEA_LIMITS.titleMax)}
      initialCategory={category}
      gameReady={gameReady}
      gameNames={names}
      space={space && spaceOpen(space, gsDay()) ? { href: spacePath(space), name: space.name } : null}
      loginHref={`/login?redirect=${encodeURIComponent(self)}`}
    />
  );
}
