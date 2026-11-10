/**
 * A game space's Ideas tab (spaces first wave, 2026-11-09, ideas space mockup approved): what we should build for this
 * game, asked of its players. "We're asking" leads with the question, one line and three starter ideas (each opens
 * the Idea Board's form with the game and its title set; the header's "Suggest an idea" is the blank form), then the
 * game's ideas with votes and where each stands in
 * plain words. Ideas are Idea Board ideas tagged with the game, so they're voted, reviewed and answered in one place;
 * an idea shows here once staff have reviewed it. The viewer's own ideas still waiting for review show to them only.
 * Server component.
 */

import Link from "next/link";
import { Badge, Chip } from "@empac/cascadeds";
import { IconBulb } from "@tabler/icons-react";
import { IconTile } from "@/components/ui/IconTile";
import { ArrowLink } from "@/components/ui/ArrowLink";
import { GhostRows } from "@/components/ui/Ghost";
import { IdeaVoteButton } from "@/components/ideas/IdeaVoteButton";
import { ideaFormHref, type GameSpace } from "@/lib/games/spaces";
import type { SpaceIdeasData } from "@/lib/games/spaceData";
import type { Idea } from "@/lib/ideas/types";
import { PLAN_WORDS, statusBadgeVariant } from "@/lib/ideas/display";
import "@/styles/space-ideas.css";

function IdeaLine({ idea, waiting = false }: { idea: Idea; waiting?: boolean }) {
  return (
    <li className={`space-idea${waiting ? " space-idea--waiting" : ""}`}>
      {!waiting && <IdeaVoteButton ideaId={idea.id} voted={!!idea.hasVoted} count={idea.voteCount} votable={idea.status === "public"} />}
      <div className="space-idea__main">
        <Link href={`/ideas/${idea.id}`} className="space-idea__title">{idea.title}</Link>
        <p className="space-idea__body">{idea.body}</p>
        {!waiting && (
          <div className="space-idea__meta">
            {/* CDS Badge is a div: the line is a div too (a div in a p broke hydration). */}
            <Badge size="small" variant={statusBadgeVariant(idea.status)}>{PLAN_WORDS[idea.status]}</Badge>
            {idea.author && <span>{idea.author.name}</span>}
          </div>
        )}
      </div>
    </li>
  );
}

export function SpaceIdeas({ s, data }: { s: GameSpace; data: SpaceIdeasData }) {
  const game = s.primary;
  const ask = s.ideas;
  return (
    <div className="space-stack">
      {ask && (
        <section className="room-tile space-ask" aria-labelledby="sp-ask">
          <div className="space-ask__head">
            <IconTile icon={IconBulb} tone="violet" />
            <div>
              <p className="space-ask__kicker">We&apos;re asking</p>
              <h2 id="sp-ask">What should we build for {s.name}?</h2>
              <p className="space-ask__line">{ask.line}</p>
            </div>
          </div>
          <ul className="space-ask__starters" aria-label="Starter ideas">
            {ask.starters.map((t) => (
              <li key={t}>
                <Link href={ideaFormHref(game, t)} className="space-ask__chip">
                  <Chip label={t} variant="outline" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.waiting.length > 0 && (
        <section className="room-tile" aria-labelledby="sp-ideas-waiting">
          <div className="room-tile__head"><h2 id="sp-ideas-waiting">Yours, waiting for review</h2></div>
          <p className="room-tile__note">Only you see these until they&apos;re reviewed. Then everyone here can vote.</p>
          <ul className="space-ideas">{data.waiting.map((i) => <IdeaLine key={i.id} idea={i} waiting />)}</ul>
        </section>
      )}

      <section className="room-tile" aria-labelledby="sp-ideas">
        <div className="room-tile__head">
          <h2 id="sp-ideas">Ideas for {s.name}</h2>
          <ArrowLink plain href={`/ideas?game=${encodeURIComponent(game)}`} className="room-tile__more">On the Idea Board</ArrowLink>
        </div>
        {data.ideas.length ? (
          <ul className="space-ideas">{data.ideas.map((i) => <IdeaLine key={i.id} idea={i} />)}</ul>
        ) : (
          <GhostRows count={3} places={false} lines notice={<>
            <p>No ideas for {s.short} yet. <b>Pick a starter above or write your own:</b> once it&apos;s reviewed, everyone here can vote on it.</p>
            <div className="space-actions"><Link href={ideaFormHref(game)} className="room-btn room-btn--ghost">Suggest an idea</Link></div>
          </>} />
        )}
      </section>
    </div>
  );
}
