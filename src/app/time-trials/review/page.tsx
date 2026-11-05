import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Container } from "@empac/cascadeds";
import { BrowseHero } from "@/components/events/BrowseHero";
import { TtReviewQueue } from "@/components/timeTrials/TtReviewQueue";
import { siteActor } from "@/lib/timeTrials/players";
import { reviewScope } from "@/lib/timeTrials/updaters";
import "@/styles/time-trials.css";

/** The review queue for time trial reviewers and updaters who aren't staff (round 2, 6A; round 3, 8A). */

export const metadata: Metadata = { title: "Time trial reviews", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function TtReviewPage() {
  const actor = await siteActor();
  if (!actor) redirect(`/login?redirect=${encodeURIComponent("/time-trials/review")}`);
  if (!(await reviewScope(actor.userId))) notFound();
  return (
    <main className="tt-page">
      <BrowseHero eyebrow="Time trials" title="Reviews" sub="Check clips and legacy proof so times show as Verified, settle legacy claims, and decide reported times." accent="blue" field="compete" compact />
      <Container className="tt-body">
        <TtReviewQueue />
      </Container>
    </main>
  );
}
