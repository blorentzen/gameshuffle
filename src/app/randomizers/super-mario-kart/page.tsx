import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Container } from "@empac/cascadeds";
import { SuperMarioKartRandomizer } from "@/components/super-mario-kart/SuperMarioKartRandomizer";
import { RandomizerNudge } from "@/components/randomizer/RandomizerNudge";
import { RandomizerLanding } from "@/components/marketing/RandomizerLanding";
import { RANDOMIZER_LANDINGS, randomizerMetadata } from "@/data/randomizer-landings";
import { SUPER_MARIO_KART } from "@/data/super-mario-kart/super-mario-kart";
import { SUPER_MARIO_KART_PUBLIC, superMarioKartShown } from "@/lib/games-visibility";
import { BrowseHero } from "@/components/events/BrowseHero";
import { NewBanner } from "@/components/NewBanner";
import { GAME_ART } from "@/data/game-art";

const landing = RANDOMIZER_LANDINGS["super-mario-kart"];

export const metadata: Metadata = {
  ...randomizerMetadata("super-mario-kart"),
  // Out of search until the Retro Mario Kart space opens (SUPER_MARIO_KART_PUBLIC).
  ...(SUPER_MARIO_KART_PUBLIC ? {} : { robots: { index: false, follow: true } }),
};

/** /randomizers/super-mario-kart: a different racer for each of two players, cups, races and battle courses. Staff
 *  only until the Retro Mario Kart space opens: production 404s it while SUPER_MARIO_KART_PUBLIC is off. */
export default function SuperMarioKartRandomizerPage() {
  if (!superMarioKartShown()) notFound();
  return (
    <main>
      <BrowseHero eyebrow="New randomizer" title={landing.h1} sub={landing.lead} accent="blue" field="video"
        image={GAME_ART["super-mario-kart"].hero} primary={{ href: "#play", label: "Randomize now" }} />
      <div id="play">
        <Container className="tool-page">
          <NewBanner />
          <Suspense>
            <SuperMarioKartRandomizer game={SUPER_MARIO_KART} />
          </Suspense>
        </Container>
      </div>
      <RandomizerNudge gameName="Super Mario Kart" game={SUPER_MARIO_KART.slug} saves="your racers and race lists" />
      <RandomizerLanding landing={landing} />
    </main>
  );
}
