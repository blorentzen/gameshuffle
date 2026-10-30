import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Container } from "@empac/cascadeds";
import { BrowseHero } from "@/components/events/BrowseHero";
import { ArrowLink } from "@/components/ui/ArrowLink";
import { TtTicket } from "@/components/timeTrials/TtTicket";
import { siteActor } from "@/lib/timeTrials/players";
import { ticketView } from "@/lib/timeTrials/review";
import { trackPath, ttTrack } from "@/lib/timeTrials/tracks";
import "@/styles/time-trials.css";

/** A report ticket (round 2, 5A): the reporter, the time's owner and reviewers in one thread. */

export const metadata: Metadata = { title: "Report ticket", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function TtTicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await siteActor();
  if (!actor) redirect(`/login?redirect=${encodeURIComponent(`/time-trials/tickets/${id}`)}`);
  const view = await ticketView(id, { player: actor.player, userId: actor.userId });
  if (!view) notFound();
  const track = ttTrack(view.time.game, view.time.track);
  return (
    <main className="tt-page">
      <BrowseHero eyebrow="Time trials" title="Report ticket" sub={`${view.ownerName} · ${view.label}`} accent="blue" field="compete" compact />
      <Container className="tt-body">
        <TtTicket initial={view} />
        {track && <p className="tt-note"><ArrowLink href={trackPath(track, view.time.cc, view.time)}>The board</ArrowLink></p>}
      </Container>
    </main>
  );
}
