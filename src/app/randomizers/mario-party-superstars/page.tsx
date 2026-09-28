import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@empac/cascadeds";
import { PartyRandomizer } from "@/components/party/PartyRandomizer";
import { RandomizerNudge } from "@/components/randomizer/RandomizerNudge";
import { MarketingJsonLd } from "@/components/marketing/MarketingJsonLd";
import { SUPERSTARS } from "@/data/party/superstars";

const seo = {
  title: "Mario Party Superstars Randomizer",
  description:
    "Free Mario Party Superstars randomizer: roll one of the five classic boards and the turns, give everyone a character, and spin from 100 classic minigames.",
  canonical: "https://www.gameshuffle.co/randomizers/mario-party-superstars",
};

export const metadata: Metadata = {
  title: seo.title,
  description: seo.description,
  openGraph: { title: seo.title, description: seo.description, url: seo.canonical, images: ["https://www.gameshuffle.co/images/opengraph/mario-party-superstars-og.jpg"] },
  alternates: { canonical: seo.canonical },
};

export default function SuperstarsRandomizerPage() {
  return (
    <>
      <MarketingJsonLd
        appName={seo.title}
        appDescription={seo.description}
        appUrl="/randomizers/mario-party-superstars"
        breadcrumb={{ label: "Mario Party Superstars Randomizer", path: "/randomizers/mario-party-superstars" }}
      />
      <Suspense>
        <PartyRandomizer
          game={SUPERSTARS}
          hero={{ title: seo.title, lead: "Roll one of the five classic boards and the turns, give everyone a character, and spin a minigame or a whole set list.", image: "https://cdn.empac.co/gameshuffle/images/mario-party-superstars/mario-party-superstars-hero.jpg", imagePosition: "center 25%" }}
        />
      </Suspense>
      <Container>
        <p className="tool-page__lead" style={{ textAlign: "center" }}>
          Playing Super Mario Party Jamboree instead? Try the <Link href="/randomizers/super-mario-party-jamboree">Super Mario Party Jamboree randomizer</Link>.
        </p>
      </Container>
      <RandomizerNudge gameName={SUPERSTARS.label} saves="your party setups" streamReady={false} />
    </>
  );
}
