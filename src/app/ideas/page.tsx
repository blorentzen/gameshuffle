import Link from "next/link";
import { Container, Button, Card, Chip, Badge } from "@empac/cascadeds";
import { createClient } from "@/lib/supabase/server";
import { listPublicIdeas, getVotingCycle, ideaGames, ideasGameReady } from "@/lib/ideas/store";
import { IdeaVoteButton } from "@/components/ideas/IdeaVoteButton";
import { IdeasGameFilter } from "@/components/ideas/IdeasGameFilter";
import { GameCover } from "@/components/games/GameCover";
import { ArrowLink } from "@/components/ui/ArrowLink";
import { gameEntry } from "@/lib/games/key";
import { spaceFor, spaceOpen, spacePath } from "@/lib/games/spaces";
import { gsDay } from "@/lib/time/gsClock";
import { UserIdentity } from "@/components/profile/UserIdentity";
import {
  IDEA_CATEGORIES,
  IDEA_CATEGORY_LABELS,
  type IdeaCategory,
} from "@/lib/ideas/constants";
import type { Idea } from "@/lib/ideas/types";
import "@/styles/space-ideas.css";

/** An idea's game, linked to its ideas on the board (spaces first wave, 2026-11-09). */
function GameTag({ game }: { game: string }) {
  const entry = gameEntry(game);
  if (!entry) return null;
  return (
    <Link href={`/ideas?game=${encodeURIComponent(entry.slug)}`} className="idea-game-tag">
      <GameCover slug={entry.slug} name={entry.name} />
      {entry.name}
    </Link>
  );
}

export const metadata = {
  openGraph: { siteName: "GameShuffle", type: "website", url: "https://www.gameshuffle.co/ideas" },
  alternates: { canonical: "https://www.gameshuffle.co/ideas" },
  title: "Idea Board",
  description:
    "Vote on game ideas, randomizer concepts, and feature requests for GameShuffle, and see what's planned and shipped.",
};

function IdeaRow({ idea, votable }: { idea: Idea; votable: boolean }) {
  return (
    <li>
      <Card variant="outlined" padding="medium">
        <div className="idea-row">
          <IdeaVoteButton
            ideaId={idea.id}
            voted={!!idea.hasVoted}
            count={idea.voteCount}
            votable={votable}
          />
          <div className="idea-card__main">
            <div className="idea-card__top">
              <Badge variant="default" size="small">{IDEA_CATEGORY_LABELS[idea.category]}</Badge>
              {idea.game && <GameTag game={idea.game} />}
              {idea.author && (
                <span className="idea-card__votes">
                  by <UserIdentity userId={idea.author.id} name={idea.author.name} />
                </span>
              )}
            </div>
            <h3 className="idea-card__title">
              <Link href={`/ideas/${idea.id}`}>{idea.title}</Link>
            </h3>
            <p className="idea-card__body idea-card__body--clamp">{idea.body}</p>
          </div>
        </div>
      </Card>
    </li>
  );
}

export default async function IdeasPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; sort?: string; game?: string }>;
}) {
  const sp = await searchParams;
  const category = (IDEA_CATEGORIES as readonly string[]).includes(sp.category ?? "")
    ? (sp.category as IdeaCategory)
    : null;
  const sort = sp.sort === "new" ? "new" : "top";
  // A game (spaces first wave): its ideas only, with the way to its space. Any way the game is named, kept as its key.
  const gameFilter = sp.game && (await ideasGameReady().catch(() => false)) ? gameEntry(sp.game) : null;
  const games = gameFilter ? [gameFilter.slug] : null;
  const gameSpace = gameFilter ? spaceFor(gameFilter.slug) : null;
  const spaceHref = gameSpace && spaceOpen(gameSpace, gsDay()) ? spacePath(gameSpace) : null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const viewerId = user?.id ?? null;

  const [ideas, planned, shipped, votingCycle, withIdeas] = await Promise.all([
    listPublicIdeas({ viewerId, category, status: "public", sort, games }),
    listPublicIdeas({ viewerId, status: "planned", sort: "top", limit: 50, games }),
    listPublicIdeas({ viewerId, status: "shipped", sort: "top", limit: 50, games }),
    getVotingCycle(),
    ideaGames().catch(() => []),
  ]);
  // The filter lists games with ideas; a game opened from its space shows even before its first idea.
  const gameOptions = withIdeas.map((g) => ({ key: g.game, name: gameEntry(g.game)?.name ?? g.game, count: g.count }));
  if (gameFilter && !gameOptions.some((g) => g.key === gameFilter.slug)) gameOptions.unshift({ key: gameFilter.slug, name: gameFilter.name, count: 0 });

  const chipHref = (c: IdeaCategory | null) => {
    const p = new URLSearchParams();
    if (c) p.set("category", c);
    if (sort === "new") p.set("sort", sort);
    if (gameFilter) p.set("game", gameFilter.slug);
    const q = p.toString();
    return q ? `/ideas?${q}` : "/ideas";
  };
  const sortHref = (s: "top" | "new") => {
    const p = new URLSearchParams();
    if (category) p.set("category", category);
    if (s === "new") p.set("sort", s);
    if (gameFilter) p.set("game", gameFilter.slug);
    const q = p.toString();
    return q ? `/ideas?${q}` : "/ideas";
  };

  return (
    <Container as="main" className="ideas-page">
      <div className="ideas-page__head">
        <h1 className="ideas-page__title">Idea Board</h1>
        <Link href={gameFilter ? `/ideas/submit?game=${encodeURIComponent(gameFilter.slug)}&category=randomizer` : "/ideas/submit"}>
          <Button variant="primary" size="small">Submit an idea</Button>
        </Link>
      </div>
      <p className="ideas-page__lead">
        Vote on game ideas, randomizer concepts, and features. Top ideas enter batched review, and
        every reviewed idea gets a public verdict.
      </p>

      {votingCycle && (
        <div className="ideas-banner">
          <strong>{votingCycle.name}</strong> is open for voting. The top {votingCycle.slots} enter
          review{votingCycle.closesAt ? ` (closes ${new Date(votingCycle.closesAt).toLocaleDateString()})` : ""}.
        </div>
      )}

      {gameOptions.length > 0 && (
        <div className="ideas-game-filter">
          <IdeasGameFilter
            games={gameOptions}
            value={gameFilter?.slug ?? ""}
            query={Object.fromEntries([...(category ? [["category", category]] : []), ...(sort === "new" ? [["sort", "new"]] : [])])}
          />
          {gameFilter && (
            <span className="ideas-game-filter__game">
              <GameCover slug={gameFilter.slug} name={gameFilter.name} />
              {spaceHref ? <ArrowLink href={`${spaceHref}?tab=ideas`}>The {gameSpace!.name} space</ArrowLink> : <span>Ideas for {gameFilter.name}</span>}
            </span>
          )}
        </div>
      )}

      <div className="ideas-filters">
        <Link href={chipHref(null)} className="ideas-chip-link">
          <Chip label="All" variant={!category ? "primary" : "default"} />
        </Link>
        {IDEA_CATEGORIES.map((c) => (
          <Link key={c} href={chipHref(c)} className="ideas-chip-link">
            <Chip label={IDEA_CATEGORY_LABELS[c]} variant={category === c ? "primary" : "default"} />
          </Link>
        ))}
        <span className="ideas-filters__sort">
          <Link href={sortHref("top")} className="ideas-chip-link">
            <Chip label="Top" variant={sort === "top" ? "primary" : "default"} />
          </Link>
          <Link href={sortHref("new")} className="ideas-chip-link">
            <Chip label="New" variant={sort === "new" ? "primary" : "default"} />
          </Link>
        </span>
      </div>

      {/* The list's own heading (the rows are h3s, like Planned and Built below). */}
      <h2 className="sr-only">{gameFilter ? `Ideas for ${gameFilter.name} taking votes` : "Ideas taking votes"}</h2>
      {ideas.length === 0 ? (
        <p className="ideas-page__lead">No ideas here yet. Be the first to submit one.</p>
      ) : (
        <ul className="ideas-list">
          {ideas.map((i) => (
            <IdeaRow key={i.id} idea={i} votable />
          ))}
        </ul>
      )}

      {planned.length > 0 && (
        <section className="ideas-review__section">
          <h2 className="ideas-review__h2">Planned</h2>
          <ul className="ideas-list">
            {planned.map((i) => (
              <IdeaRow key={i.id} idea={i} votable={false} />
            ))}
          </ul>
        </section>
      )}

      {shipped.length > 0 && (
        <section className="ideas-review__section">
          <h2 className="ideas-review__h2">Shipped</h2>
          <ul className="ideas-list">
            {shipped.map((i) => (
              <IdeaRow key={i.id} idea={i} votable={false} />
            ))}
          </ul>
        </section>
      )}
    </Container>
  );
}
