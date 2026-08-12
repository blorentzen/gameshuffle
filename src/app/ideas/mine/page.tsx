import { redirect } from "next/navigation";
import Link from "next/link";
import { Container, Button, Card, Badge } from "@empac/cascadeds";
import { createClient } from "@/lib/supabase/server";
import { listMyIdeas } from "@/lib/ideas/store";
import { IDEA_CATEGORY_LABELS } from "@/lib/ideas/constants";
import { STATUS_LABEL, statusBadgeVariant } from "@/lib/ideas/display";

export const metadata = {
  title: "My ideas",
  robots: { index: false, follow: false }, // author-private surface (Phase 0 D6)
};

export default async function MyIdeasPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/ideas/mine");

  const ideas = await listMyIdeas(user.id);

  return (
    <Container className="ideas-page">
      <div className="ideas-page__head">
        <h1 className="ideas-page__title">My ideas</h1>
        <Link href="/ideas/submit">
          <Button variant="primary" size="small">Submit an idea</Button>
        </Link>
      </div>

      {ideas.length === 0 ? (
        <p className="ideas-page__lead">
          You haven&apos;t submitted any ideas yet. <Link href="/ideas/submit">Share one →</Link>
        </p>
      ) : (
        <ul className="ideas-list">
          {ideas.map((idea) => (
            <li key={idea.id}>
              <Card variant="outlined" padding="medium" className="idea-card">
                <div className="idea-card__top">
                  <Badge variant={statusBadgeVariant(idea.status)} size="small">
                    {STATUS_LABEL[idea.status]}
                  </Badge>
                  <Badge variant="default" size="small">{IDEA_CATEGORY_LABELS[idea.category]}</Badge>
                  {idea.status === "public" && (
                    <span className="idea-card__votes">{idea.voteCount} votes</span>
                  )}
                </div>

                <h2 className="idea-card__title">
                  {idea.status === "submitted" || idea.status === "rejected" ? (
                    idea.title
                  ) : (
                    <Link href={`/ideas/${idea.id}`}>{idea.title}</Link>
                  )}
                </h2>
                <p className="idea-card__body">{idea.body}</p>

                {idea.status === "rejected" && idea.moderationNote && (
                  <p className="idea-card__note idea-card__note--reject">
                    <strong>Not accepted:</strong> {idea.moderationNote}
                  </p>
                )}
                {idea.verdict === "declined" && idea.verdictNote && (
                  <p className="idea-card__note idea-card__note--decline">
                    <strong>Verdict:</strong> {idea.verdictNote}
                  </p>
                )}
                {idea.status === "shipped" && (
                  <p className="idea-card__note idea-card__note--ship">
                    Shipped 🎉{idea.shippedRef ? <>, <Link href={idea.shippedRef}>see it</Link></> : null}
                  </p>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </Container>
  );
}
