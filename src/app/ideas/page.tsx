import Link from "next/link";
import { Container, Button, Card, Chip, Badge } from "@empac/cascadeds";
import { createClient } from "@/lib/supabase/server";
import { listPublicIdeas, getVotingCycle } from "@/lib/ideas/store";
import { IdeaVoteButton } from "@/components/ideas/IdeaVoteButton";
import { UserIdentity } from "@/components/profile/UserIdentity";
import {
  IDEA_CATEGORIES,
  IDEA_CATEGORY_LABELS,
  type IdeaCategory,
} from "@/lib/ideas/constants";
import type { Idea } from "@/lib/ideas/types";

export const metadata = {
  title: "Idea Board",
  description:
    "Vote on game ideas, randomizer concepts, and feature requests for GameShuffle — and see what's planned and shipped.",
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
  searchParams: Promise<{ category?: string; sort?: string }>;
}) {
  const sp = await searchParams;
  const category = (IDEA_CATEGORIES as readonly string[]).includes(sp.category ?? "")
    ? (sp.category as IdeaCategory)
    : null;
  const sort = sp.sort === "new" ? "new" : "top";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const viewerId = user?.id ?? null;

  const [ideas, planned, shipped, votingCycle] = await Promise.all([
    listPublicIdeas({ viewerId, category, status: "public", sort }),
    listPublicIdeas({ viewerId, status: "planned", sort: "top", limit: 50 }),
    listPublicIdeas({ viewerId, status: "shipped", sort: "top", limit: 50 }),
    getVotingCycle(),
  ]);

  const chipHref = (c: IdeaCategory | null) => {
    const p = new URLSearchParams();
    if (c) p.set("category", c);
    if (sort === "new") p.set("sort", sort);
    const q = p.toString();
    return q ? `/ideas?${q}` : "/ideas";
  };
  const sortHref = (s: "top" | "new") => {
    const p = new URLSearchParams();
    if (category) p.set("category", category);
    if (s === "new") p.set("sort", s);
    const q = p.toString();
    return q ? `/ideas?${q}` : "/ideas";
  };

  return (
    <Container className="ideas-page">
      <div className="ideas-page__head">
        <h1 className="ideas-page__title">Idea Board</h1>
        <Link href="/ideas/submit">
          <Button variant="primary" size="small">Submit an idea</Button>
        </Link>
      </div>
      <p className="ideas-page__lead">
        Vote on game ideas, randomizer concepts, and features. Top ideas enter batched review — and
        every reviewed idea gets a public verdict.
      </p>

      {votingCycle && (
        <div className="ideas-banner">
          <strong>{votingCycle.name}</strong> is open for voting — the top {votingCycle.slots} enter
          review{votingCycle.closesAt ? ` (closes ${new Date(votingCycle.closesAt).toLocaleDateString()})` : ""}.
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

      {ideas.length === 0 ? (
        <p className="ideas-page__lead">No ideas here yet — be the first to submit one.</p>
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
