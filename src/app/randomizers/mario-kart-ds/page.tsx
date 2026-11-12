import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Container } from "@empac/cascadeds";
import { MarioKartDsRandomizer } from "@/components/mario-kart-ds/MarioKartDsRandomizer";
import { RandomizerNudge } from "@/components/randomizer/RandomizerNudge";
import { RandomizerLanding } from "@/components/marketing/RandomizerLanding";
import { RANDOMIZER_LANDINGS, randomizerMetadata } from "@/data/randomizer-landings";
import { MARIO_KART_DS } from "@/data/mario-kart-ds/mario-kart-ds";
import { MARIO_KART_DS_PUBLIC, marioKartDsShown } from "@/lib/games-visibility";
import { BrowseHero } from "@/components/events/BrowseHero";
import { NewBanner } from "@/components/NewBanner";
import { GAME_ART } from "@/data/game-art";

const landing = RANDOMIZER_LANDINGS["mario-kart-ds"];

export const metadata: Metadata = {
  ...randomizerMetadata("mario-kart-ds"),
  // Out of search until the Retro Mario Kart space opens (MARIO_KART_DS_PUBLIC).
  ...(MARIO_KART_DS_PUBLIC ? {} : { robots: { index: false, follow: true } }),
};

/** /randomizers/mario-kart-ds: a character and a kart from the save for each player, cups, races, battles and Mission
 *  Mode. Staff only until the Retro Mario Kart space opens: production 404s it while MARIO_KART_DS_PUBLIC is off. */
export default function MarioKartDsRandomizerPage() {
  if (!marioKartDsShown()) notFound();
  return (
    <main>
      <BrowseHero eyebrow="New randomizer" title={landing.h1} sub={landing.lead} accent="red" field="video"
        image={GAME_ART["mario-kart-ds"].hero} primary={{ href: "#play", label: "Randomize now" }} />
      <div id="play">
        <Container className="tool-page">
          <NewBanner />
          <Suspense>
            <MarioKartDsRandomizer game={MARIO_KART_DS} />
          </Suspense>
        </Container>
      </div>
      <RandomizerNudge gameName="Mario Kart DS" game={MARIO_KART_DS.slug} saves="your racers, karts and race nights" />
      <RandomizerLanding landing={landing} />
    </main>
  );
}
