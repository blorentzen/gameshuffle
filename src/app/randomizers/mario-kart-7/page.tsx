import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Container } from "@empac/cascadeds";
import { MarioKart7Randomizer } from "@/components/mario-kart-7/MarioKart7Randomizer";
import { RandomizerNudge } from "@/components/randomizer/RandomizerNudge";
import { RandomizerLanding } from "@/components/marketing/RandomizerLanding";
import { RANDOMIZER_LANDINGS, randomizerMetadata } from "@/data/randomizer-landings";
import { MARIO_KART_7 } from "@/data/mario-kart-7/mario-kart-7";
import { MARIO_KART_7_PUBLIC, mario7Shown } from "@/lib/games-visibility";
import { BrowseHero } from "@/components/events/BrowseHero";
import { NewBanner } from "@/components/NewBanner";
import { GAME_ART } from "@/data/game-art";

const landing = RANDOMIZER_LANDINGS["mario-kart-7"];

export const metadata: Metadata = {
  ...randomizerMetadata("mario-kart-7"),
  // Out of search until the Retro Mario Kart space opens (MARIO_KART_7_PUBLIC).
  ...(MARIO_KART_7_PUBLIC ? {} : { robots: { index: false, follow: true } }),
};

/** /randomizers/mario-kart-7: a character and a body, tires and glider for each player, cups, races and battles.
 *  Staff only until the Retro Mario Kart space opens: production 404s it while MARIO_KART_7_PUBLIC is off. */
export default function MarioKart7RandomizerPage() {
  if (!mario7Shown()) notFound();
  return (
    <main>
      <BrowseHero eyebrow="New randomizer" title={landing.h1} sub={landing.lead} accent="red" field="video"
        image={GAME_ART["mario-kart-7"].hero} primary={{ href: "#play", label: "Randomize now" }} />
      <div id="play">
        <Container className="tool-page">
          <NewBanner />
          <Suspense>
            <MarioKart7Randomizer game={MARIO_KART_7} />
          </Suspense>
        </Container>
      </div>
      <RandomizerNudge gameName="Mario Kart 7" game={MARIO_KART_7.slug} saves="your racers, karts and race nights" />
      <RandomizerLanding landing={landing} />
    </main>
  );
}
