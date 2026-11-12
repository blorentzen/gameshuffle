import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Container } from "@empac/cascadeds";
import { DoubleDashRandomizer } from "@/components/double-dash/DoubleDashRandomizer";
import { RandomizerNudge } from "@/components/randomizer/RandomizerNudge";
import { RandomizerLanding } from "@/components/marketing/RandomizerLanding";
import { RANDOMIZER_LANDINGS, randomizerMetadata } from "@/data/randomizer-landings";
import { DOUBLE_DASH } from "@/data/double-dash/double-dash";
import { DOUBLE_DASH_PUBLIC, doubleDashShown } from "@/lib/games-visibility";
import { BrowseHero } from "@/components/events/BrowseHero";
import { NewBanner } from "@/components/NewBanner";
import { GAME_ART } from "@/data/game-art";

const landing = RANDOMIZER_LANDINGS["mario-kart-double-dash"];

export const metadata: Metadata = {
  ...randomizerMetadata("mario-kart-double-dash"),
  // Out of search until the Retro Mario Kart space opens (DOUBLE_DASH_PUBLIC).
  ...(DOUBLE_DASH_PUBLIC ? {} : { robots: { index: false, follow: true } }),
};

/** /randomizers/mario-kart-double-dash: a pair and a kart for each kart, two to a kart, cups, the All Cup Tour and
 *  battles. Staff only until the Retro Mario Kart space opens: production 404s it while DOUBLE_DASH_PUBLIC is off. */
export default function DoubleDashRandomizerPage() {
  if (!doubleDashShown()) notFound();
  return (
    <main>
      <BrowseHero eyebrow="New randomizer" title={landing.h1} sub={landing.lead} accent="red" field="video"
        image={GAME_ART["mario-kart-double-dash"].hero} primary={{ href: "#play", label: "Randomize now" }} />
      <div id="play">
        <Container className="tool-page">
          <NewBanner />
          <Suspense>
            <DoubleDashRandomizer game={DOUBLE_DASH} />
          </Suspense>
        </Container>
      </div>
      <RandomizerNudge gameName="Double Dash" game={DOUBLE_DASH.slug} saves="your pairs, karts and race nights" />
      <RandomizerLanding landing={landing} />
    </main>
  );
}
