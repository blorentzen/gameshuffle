import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Container } from "@empac/cascadeds";
import { SplatoonRandomizer } from "@/components/splatoon/SplatoonRandomizer";
import { RandomizerNudge } from "@/components/randomizer/RandomizerNudge";
import { RandomizerLanding } from "@/components/marketing/RandomizerLanding";
import { RANDOMIZER_LANDINGS, randomizerMetadata } from "@/data/randomizer-landings";
import { SPLATOON3 } from "@/data/splatoon/splatoon3";
import { SPLATOON_PUBLIC } from "@/lib/games-visibility";

const landing = RANDOMIZER_LANDINGS["splatoon-3"];

export const metadata: Metadata = randomizerMetadata("splatoon-3");

export default function SplatoonRandomizerPage() {
  // Hidden until launch, except locally so it can be built and checked.
  if (!SPLATOON_PUBLIC && process.env.NODE_ENV === "production") notFound();
  return (
    <>
      <main>
        <Container className="tool-page">
          <p className="marketing-eyebrow">Free randomizer</p>
          <h1 className="tool-page__title">{landing.h1}</h1>
          <p className="tool-page__lead">{landing.lead}</p>
          <Suspense>
            <SplatoonRandomizer game={SPLATOON3} />
          </Suspense>
        </Container>
        <RandomizerLanding landing={landing} />
      </main>
      <RandomizerNudge gameName={SPLATOON3.label} saves="your Splatoon setups" streamReady={false} />
    </>
  );
}
