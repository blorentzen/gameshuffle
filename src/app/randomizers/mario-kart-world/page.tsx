import { Suspense } from "react";
import type { Metadata } from "next";
import { RandomizerClient } from "@/components/randomizer/RandomizerClient";
import { RandomizerNudge } from "@/components/randomizer/RandomizerNudge";
import { RandomizerLanding } from "@/components/marketing/RandomizerLanding";
import { RANDOMIZER_LANDINGS, randomizerMetadata } from "@/data/randomizer-landings";
import { mkworldConfig, mkworldHero } from "./config";
import mkworldData from "@/data/mkworld-data.json";
import type { GameData } from "@/data/types";

const gameData = mkworldData as unknown as GameData;

export const metadata: Metadata = randomizerMetadata("mario-kart-world");

export default function MKWorldRandomizerPage() {
  return (
    <>
      <Suspense>
        <RandomizerClient
          gameConfig={mkworldConfig}
          gameData={gameData}
          heroProps={mkworldHero}
        />
      </Suspense>
      <RandomizerLanding landing={RANDOMIZER_LANDINGS["mario-kart-world"]} />
      <RandomizerNudge gameName="Mario Kart World" />
    </>
  );
}
