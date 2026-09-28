import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Container } from "@empac/cascadeds";
import { SmashRandomizer } from "@/components/smash/SmashRandomizer";
import { RandomizerNudge } from "@/components/randomizer/RandomizerNudge";
import { MarketingJsonLd } from "@/components/marketing/MarketingJsonLd";
import { ULTIMATE } from "@/data/smash/ultimate";
import { SMASH_PUBLIC } from "@/lib/games-visibility";

const seo = {
  title: "Super Smash Bros. Ultimate Randomizer",
  description:
    "Randomize your Smash Ultimate night: fighters and costumes for up to 8 players, stages, rules, Custom Smash, Squad Strike squads, house rules and missions.",
  canonical: "https://www.gameshuffle.co/randomizers/super-smash-bros-ultimate",
};

export const metadata: Metadata = {
  title: seo.title,
  description: seo.description,
  openGraph: { title: seo.title, description: seo.description, url: seo.canonical },
  alternates: { canonical: seo.canonical },
};

export default function SmashRandomizerPage() {
  if (!SMASH_PUBLIC) notFound();
  return (
    <>
      <MarketingJsonLd
        appName={seo.title}
        appDescription={seo.description}
        appUrl="/randomizers/super-smash-bros-ultimate"
        breadcrumb={{ label: "Super Smash Bros. Ultimate Randomizer", path: "/randomizers/super-smash-bros-ultimate" }}
      />
      <main>
        <Container className="tool-page">
          <p className="marketing-eyebrow">Free randomizer</p>
          <h1 className="tool-page__title">{seo.title}</h1>
          <p className="tool-page__lead">
            Hand out fighters, roll the stage and rules, draw Squad Strike squads, and deal house rules and missions
            for the whole couch.
          </p>
          <Suspense>
            <SmashRandomizer game={ULTIMATE} />
          </Suspense>
        </Container>
      </main>
      <RandomizerNudge gameName={ULTIMATE.label} saves="your Smash setups" streamReady={false} />
    </>
  );
}
