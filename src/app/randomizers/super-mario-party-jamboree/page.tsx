import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Button, Container } from "@empac/cascadeds";
import { PartyRandomizer } from "@/components/party/PartyRandomizer";
import { RandomizerNudge } from "@/components/randomizer/RandomizerNudge";
import { MarketingJsonLd } from "@/components/marketing/MarketingJsonLd";
import { JAMBOREE } from "@/data/party/jamboree";

const seo = {
  title: "Super Mario Party Jamboree Randomizer",
  description:
    "Free Super Mario Party Jamboree randomizer: roll the board, rules and turns, give everyone a character, and spin minigames. Works with the Switch and Switch 2 Edition.",
  canonical: "https://www.gameshuffle.co/randomizers/super-mario-party-jamboree",
};

export const metadata: Metadata = {
  title: seo.title,
  description: seo.description,
  openGraph: { title: seo.title, description: seo.description, url: seo.canonical, images: ["https://www.gameshuffle.co/images/opengraph/mario-party-jamboree-og.jpg"] },
  alternates: { canonical: seo.canonical },
};

export default function JamboreeRandomizerPage() {
  return (
    <>
      <MarketingJsonLd
        appName={seo.title}
        appDescription={seo.description}
        appUrl="/randomizers/super-mario-party-jamboree"
        breadcrumb={{ label: "Super Mario Party Jamboree Randomizer", path: "/randomizers/super-mario-party-jamboree" }}
      />
      <Suspense>
        <PartyRandomizer
          game={JAMBOREE}
          hero={{ title: seo.title, lead: "Roll the board, rules and turns, give everyone a character, and spin a minigame or a whole set list. Works with the Switch and Switch 2 Edition.", image: "https://cdn.empac.co/gameshuffle/images/mario-party-jamboree/mario-party-jamboree-hero.avif", imagePosition: "center" }}
        />
      </Suspense>
      <Container>
        <div className="randomizer-crosslink">
          <div>
            <p className="randomizer-crosslink__title">Playing Mario Party Superstars instead?</p>
            <p className="randomizer-crosslink__sub">The five classic boards and 100 minigames, same randomizer.</p>
          </div>
          <Link href="/randomizers/mario-party-superstars"><Button variant="secondary">Open the Superstars randomizer</Button></Link>
        </div>
      </Container>
      <RandomizerNudge gameName={JAMBOREE.label} saves="your party setups" streamReady={false} />
    </>
  );
}
