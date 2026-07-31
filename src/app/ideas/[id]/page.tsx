import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { Container, Badge } from "@empac/cascadeds";
import { createClient } from "@/lib/supabase/server";
import { getIdea } from "@/lib/ideas/store";
import { IdeaVoteButton } from "@/components/ideas/IdeaVoteButton";
import { IdeaReportButton } from "@/components/ideas/IdeaReportButton";
import { IDEA_CATEGORY_LABELS, type IdeaStatus } from "@/lib/ideas/constants";
import { STATUS_LABEL, statusBadgeVariant } from "@/lib/ideas/display";

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
  return {
    title: idea.title,
    description: idea.body.slice(0, 155),
    robots: indexable ? undefined : { index: false, follow: false },
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

  return (
    <Container className="ideas-page">
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
          </div>
          <h1 className="ideas-page__title">{idea.title}</h1>
          {idea.author && (
            <p className="idea-detail__author">
              by{" "}
              {idea.author.username ? (
                <Link href={`/u/${idea.author.username}`}>{idea.author.name}</Link>
              ) : (
                idea.author.name
              )}
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
        <div className="idea-card__note idea-card__note--decline">On the roadmap — planned.</div>
      )}
      {idea.status === "shipped" && (
        <div className="idea-card__note idea-card__note--ship">
          Shipped 🎉{idea.shippedRef ? <> — <Link href={idea.shippedRef}>see it</Link></> : null}
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
