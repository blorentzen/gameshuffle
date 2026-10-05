import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RandomizerClient } from "@/components/randomizer/RandomizerClient";
import { RandomizerNudge } from "@/components/randomizer/RandomizerNudge";
import { RandomizerLanding } from "@/components/marketing/RandomizerLanding";
import { RANDOMIZER_LANDINGS, randomizerMetadata } from "@/data/randomizer-landings";
import { MK64_PUBLIC } from "@/lib/games-visibility";
import { mk64Config, mk64Hero } from "./config";
import mk64Data from "@/data/mk64-data.json";
import type { GameData } from "@/data/types";

const gameData = mk64Data as unknown as GameData;

export const metadata: Metadata = randomizerMetadata("mario-kart-64");

/** /randomizers/mario-kart-64: the N64 classic on the shared Mario Kart randomizer (beta: no art yet). */
export default function MK64RandomizerPage() {
  if (!MK64_PUBLIC && process.env.NODE_ENV === "production") notFound();
  return (
    <>
      <Suspense>
        <RandomizerClient gameConfig={mk64Config} gameData={gameData} heroProps={mk64Hero} />
      </Suspense>
      <RandomizerLanding landing={RANDOMIZER_LANDINGS["mario-kart-64"]} />
      <RandomizerNudge gameName="Mario Kart 64" saves="your racers and game-night setups" streamReady={false} />
    </>
  );
}
