import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Container } from "@empac/cascadeds";
import { BrowseHero } from "@/components/events/BrowseHero";
import { TtConnectDiscord } from "@/components/timeTrials/TtConnectDiscord";
import { TtLinkSignIn } from "@/components/timeTrials/TtLinkSignIn";
import { siteActor } from "@/lib/timeTrials/players";
import "@/styles/time-trials.css";

/**
 * Where "Link to GameShuffle" in Discord lands (picks 2026-10-29, 3A): signed out, sign in with
 * Discord (a new account if needed); signed in without Discord, connect it; already connected,
 * straight to time trials. Either way the times added with /gs-tt move to the account.
 */

export const metadata: Metadata = { title: "Link your Discord times", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function TtLinkPage() {
  const actor = await siteActor();
  if (actor?.discordLinked) redirect("/time-trials");
  return (
    <main className="tt-page">
      <BrowseHero
        eyebrow="Time trials"
        title="Link your Discord times"
        sub="Times you add with /gs-tt land on your GameShuffle account, with your name and picture on every board."
        accent="blue"
        field="compete"
        compact
      />
      <Container className="tt-body">
        <section className="tt-sec tt-sec--flat" aria-label="Link">
          {actor ? <TtConnectDiscord returnTo="/time-trials" /> : <TtLinkSignIn />}
        </section>
      </Container>
    </main>
  );
}
