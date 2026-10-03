import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Container } from "@empac/cascadeds";
import { KirbyRandomizer } from "@/components/kirby/KirbyRandomizer";
import { RandomizerNudge } from "@/components/randomizer/RandomizerNudge";
import { RandomizerLanding } from "@/components/marketing/RandomizerLanding";
import { RANDOMIZER_LANDINGS, randomizerMetadata } from "@/data/randomizer-landings";
import { AIR_RIDERS } from "@/data/kirby/air-riders";
import { KIRBY_PUBLIC } from "@/lib/games-visibility";

const landing = RANDOMIZER_LANDINGS["kirby-air-riders"];

export const metadata: Metadata = randomizerMetadata("kirby-air-riders");

export default function KirbyRandomizerPage() {
  // Hidden until launch, except locally so it can be built and checked.
  if (!KIRBY_PUBLIC && process.env.NODE_ENV === "production") notFound();
  return (
    <>
      <main>
        <Container className="tool-page">
          <p className="marketing-eyebrow">Free randomizer</p>
          <h1 className="tool-page__title">{landing.h1}</h1>
          <p className="tool-page__lead">{landing.lead}</p>
          <Suspense>
            <KirbyRandomizer game={AIR_RIDERS} />
          </Suspense>
        </Container>
        <RandomizerLanding landing={landing} />
      </main>
      <RandomizerNudge gameName={AIR_RIDERS.label} saves="your Kirby Air Riders setups" streamReady={false} />
    </>
  );
}
