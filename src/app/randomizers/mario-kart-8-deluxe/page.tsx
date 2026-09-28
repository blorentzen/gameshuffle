import { Suspense } from "react";
import type { Metadata } from "next";
import { RandomizerClient } from "@/components/randomizer/RandomizerClient";
import { RandomizerNudge } from "@/components/randomizer/RandomizerNudge";
import { RandomizerLanding } from "@/components/marketing/RandomizerLanding";
import { RANDOMIZER_LANDINGS, randomizerMetadata } from "@/data/randomizer-landings";
import { mk8dxConfig, mk8dxHero } from "./config";
import mk8dxData from "@/data/mk8dx-data.json";
import type { GameData } from "@/data/types";

const gameData = mk8dxData as GameData;

export const metadata: Metadata = randomizerMetadata("mario-kart-8-deluxe");

export default function MK8DXRandomizerPage() {
  return (
    <>
      <Suspense>
        <RandomizerClient
          gameConfig={mk8dxConfig}
          gameData={gameData}
          heroProps={mk8dxHero}
        />
      </Suspense>
      <RandomizerLanding landing={RANDOMIZER_LANDINGS["mario-kart-8-deluxe"]} />
      <RandomizerNudge gameName="Mario Kart 8 Deluxe" />
    </>
  );
}
