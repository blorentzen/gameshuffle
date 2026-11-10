import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { Container, Badge } from "@empac/cascadeds";
import { createClient } from "@/lib/supabase/server";
import { getIdea } from "@/lib/ideas/store";
import { IdeaVoteButton } from "@/components/ideas/IdeaVoteButton";
import { IdeaReportButton } from "@/components/ideas/IdeaReportButton";
import { UserIdentity } from "@/components/profile/UserIdentity";
import { IDEA_CATEGORY_LABELS, type IdeaStatus } from "@/lib/ideas/constants";
import { STATUS_LABEL, statusBadgeVariant } from "@/lib/ideas/display";
import { GameCover } from "@/components/games/GameCover";
import { gameEntry } from "@/lib/games/key";
import { spaceFor, spaceOpen, spacePath } from "@/lib/games/spaces";
import { gsDay } from "@/lib/time/gsClock";
import "@/styles/space-ideas.css";

const INDEXABLE: IdeaStatus[] = ["public", "planned", "shipped", "declined"];

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const idea = await getIdea(id, null);
  if (!idea) return { title: "Idea", robots: { index: false, follow: false } };
  const indexable = INDEXABLE.includes(idea.status); // D6
  const url = `https://www.gameshuffle.co/ideas/${id}`;
  return {
    title: idea.title,
    description: idea.body.slice(0, 155),
    robots: indexable ? undefined : { index: false, follow: false },
    alternates: { canonical: url },
    // The folder's opengraph-image.tsx still draws the picture (same segment).
    openGraph: { siteName: "GameShuffle", type: "article", url, title: idea.title, description: idea.body.slice(0, 155) },
  };
}

export default async function IdeaDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const idea = await getIdea(id, user?.id ?? null);
  if (!idea) notFound();
  const isOwn = !!user && user.id === idea.author?.id;
  // The game it's for: its space's Ideas tab when that's open, else the board's ideas for the game.
  const game = idea.game ? gameEntry(idea.game) : null;
  const space = game ? spaceFor(game.slug) : null;
  const gameHref = game ? (space && spaceOpen(space, gsDay()) ? `${spacePath(space)}?tab=ideas` : `/ideas?game=${encodeURIComponent(game.slug)}`) : null;

  return (
    <Container as="main" className="ideas-page">
      <p className="ideas-detail__back">
        <Link href="/ideas">← Idea Board</Link>
      </p>

      <div className="idea-detail__head">
        <IdeaVoteButton
          ideaId={idea.id}
          voted={!!idea.hasVoted}
          count={idea.voteCount}
          votable={idea.status === "public"}
        />
        <div>
          <div className="idea-card__top">
            <Badge variant={statusBadgeVariant(idea.status)} size="small">
              {STATUS_LABEL[idea.status]}
            </Badge>
            <Badge variant="default" size="small">{IDEA_CATEGORY_LABELS[idea.category]}</Badge>
            {game && (
              <Link href={gameHref!} className="idea-game-tag">
                <GameCover slug={game.slug} name={game.name} />
                {game.name}
              </Link>
            )}
          </div>
          <h1 className="ideas-page__title">{idea.title}</h1>
          {idea.author && (
            <p className="idea-detail__author">
              by <UserIdentity userId={idea.author.id} name={idea.author.name} />
            </p>
          )}
        </div>
      </div>

      <p className="idea-card__body">{idea.body}</p>

      {idea.verdict === "declined" && idea.verdictNote && (
        <div className="idea-card__note idea-card__note--decline">
          <strong>Verdict:</strong> {idea.verdictNote}
        </div>
      )}
      {idea.status === "planned" && (
        <div className="idea-card__note idea-card__note--decline">On the roadmap: planned.</div>
      )}
      {idea.status === "shipped" && (
        <div className="idea-card__note idea-card__note--ship">
          Shipped{idea.shippedRef ? <>, <Link href={idea.shippedRef}>see it</Link></> : null}
        </div>
      )}

      {!isOwn && (
        <div className="idea-detail__foot">
          <IdeaReportButton ideaId={idea.id} />
        </div>
      )}
    </Container>
  );
}
