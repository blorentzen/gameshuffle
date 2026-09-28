import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Container } from "@empac/cascadeds";
import { SmashRandomizer } from "@/components/smash/SmashRandomizer";
import { RandomizerNudge } from "@/components/randomizer/RandomizerNudge";
import { RandomizerLanding } from "@/components/marketing/RandomizerLanding";
import { RANDOMIZER_LANDINGS, randomizerMetadata } from "@/data/randomizer-landings";
import { ULTIMATE } from "@/data/smash/ultimate";
import { SMASH_PUBLIC } from "@/lib/games-visibility";

const landing = RANDOMIZER_LANDINGS["super-smash-bros-ultimate"];

export const metadata: Metadata = randomizerMetadata("super-smash-bros-ultimate");

export default function SmashRandomizerPage() {
  if (!SMASH_PUBLIC) notFound();
  return (
    <>
      <main>
        <Container className="tool-page">
          <p className="marketing-eyebrow">Free randomizer</p>
          <h1 className="tool-page__title">{landing.h1}</h1>
          <p className="tool-page__lead">{landing.lead}</p>
          <Suspense>
            <SmashRandomizer game={ULTIMATE} />
          </Suspense>
        </Container>
        <RandomizerLanding landing={landing} />
      </main>
      <RandomizerNudge gameName={ULTIMATE.label} saves="your Smash setups" streamReady={false} />
    </>
  );
}
