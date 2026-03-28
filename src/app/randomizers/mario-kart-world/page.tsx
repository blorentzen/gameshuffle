import { Suspense } from "react";
import type { Metadata } from "next";
import { RandomizerClient } from "@/components/randomizer/RandomizerClient";
import { mkworldConfig, mkworldHero, mkworldSeo } from "./config";
import mkworldData from "@/data/mkworld-data.json";
import type { GameData } from "@/data/types";

const gameData = mkworldData as unknown as GameData;

export const metadata: Metadata = {
  title: mkworldSeo.title,
  description: mkworldSeo.description,
  openGraph: {
    title: mkworldSeo.title,
    description: mkworldSeo.description,
    url: mkworldSeo.canonical,
    images: [mkworldSeo.ogImage],
  },
  alternates: {
    canonical: mkworldSeo.canonical,
  },
};

export default function MKWorldRandomizerPage() {
  return (
    <Suspense>
      <RandomizerClient
        gameConfig={mkworldConfig}
        gameData={gameData}
        heroProps={mkworldHero}
      />
    </Suspense>
  );
}
