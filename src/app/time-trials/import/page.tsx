import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Container } from "@empac/cascadeds";
import { BrowseHero } from "@/components/events/BrowseHero";
import { TimeTrialImport } from "@/components/timeTrials/TimeTrialImport";
import { TtConnectDiscord } from "@/components/timeTrials/TtConnectDiscord";
import { TtMovedToast } from "@/components/timeTrials/TtMovedToast";
import { siteActor } from "@/lib/timeTrials/players";
import "@/styles/time-trials.css";

/**
 * Bring your times (picks 2026-10-29: 5A, migration 1A-6A): from Quaxly (Save to GameShuffle in
 * Discord, screenshots or a paste) or any list. ?d= opens a list read in Discord for checking.
 */

export const metadata: Metadata = {
  title: "Import your time trial times",
  robots: { index: false, follow: true },
};

export default async function TimeTrialImportPage({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  const { d } = await searchParams;
  const here = d ? `/time-trials/import?d=${encodeURIComponent(d)}` : "/time-trials/import";
  const actor = await siteActor();
  if (!actor) redirect(`/login?redirect=${encodeURIComponent(here)}`);
  return (
    <main className="tt-page">
      <TtMovedToast />
      <BrowseHero
        eyebrow="Time trials"
        title="Import your times"
        sub="Bring your times from Quaxly in two taps, or from screenshots, a spreadsheet or a message. You check every row before anything saves."
        accent="blue"
        field="compete"
        compact
      />
      <Container className="tt-body">
        {!actor.discordLinked && <TtConnectDiscord returnTo={here} />}
        <TimeTrialImport discordAppId={process.env.DISCORD_APPLICATION_ID ?? null} draftId={d ?? null} />
      </Container>
    </main>
  );
}
