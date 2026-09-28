import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Button, Container } from "@empac/cascadeds";
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
        <div className="randomizer-crosslink">
          <div>
            <p className="randomizer-crosslink__title">Playing Super Mario Party Jamboree instead?</p>
            <p className="randomizer-crosslink__sub">Seven boards, 112 minigames and the Switch 2 Edition extras.</p>
          </div>
          <Link href="/randomizers/super-mario-party-jamboree"><Button variant="secondary">Open the Jamboree randomizer</Button></Link>
        </div>
      </Container>
      <RandomizerNudge gameName={SUPERSTARS.label} saves="your party setups" streamReady={false} />
    </>
  );
}
