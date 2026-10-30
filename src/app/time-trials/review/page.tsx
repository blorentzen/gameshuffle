import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Container } from "@empac/cascadeds";
import { BrowseHero } from "@/components/events/BrowseHero";
import { TtReviewQueue } from "@/components/timeTrials/TtReviewQueue";
import { siteActor } from "@/lib/timeTrials/players";
import { isReviewer } from "@/lib/timeTrials/review";
import "@/styles/time-trials.css";

/** The reviewers' queue for time trial reviewers who aren't staff (round 2, 6A). */

export const metadata: Metadata = { title: "Time trial reviews", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function TtReviewPage() {
  const actor = await siteActor();
  if (!actor) redirect(`/login?redirect=${encodeURIComponent("/time-trials/review")}`);
  if (!(await isReviewer(actor.userId))) notFound();
  return (
    <main className="tt-page">
      <BrowseHero eyebrow="Time trials" title="Reviews" sub="Check clips so times show as Verified, and decide reported times." accent="blue" field="compete" compact />
      <Container className="tt-body">
        <TtReviewQueue />
      </Container>
    </main>
  );
}
