import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Container } from "@empac/cascadeds";
import { BrowseHero } from "@/components/events/BrowseHero";
import { DailyDuelModule } from "@/components/originals/duel/DuelChallenger";
import { LabeledSubNav } from "@/components/ui/LabeledSubNav";
import { TcgAttribution } from "@/components/tcg/TcgAttribution";
import { RoadSection } from "@/components/originals/duel/road/RoadTiles";
import { RoadStarsProvider } from "@/components/originals/duel/road/RoadTileStars";
import { RoadPathBox } from "@/components/originals/duel/road/RoadPath";
import { ROAD_REGIONS, roadPath } from "@/lib/originals/duel/road";
import { regionHeading, regionView } from "@/lib/originals/duel/roadPages";
import { roadShown } from "@/lib/games-visibility";
import { ReportProblem } from "@/components/ui/ReportProblem";
import { shareMeta } from "@/lib/og/meta";
import "@/styles/trainer-road.css";

/**
 * /pokemon-trainers/<region>: one region on Trainer Road: its Gym Leaders (Alola's island kahunas),
 * Elite Four, Champions, rivals, villain bosses and villain teams as tiles, each with the team it brings, in the
 * order the games meet them. The region's path (badges, League, end-game battle) leads the page.
 */

export const dynamicParams = false;
export function generateStaticParams() {
  return ROAD_REGIONS.map((r) => ({ region: r.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ region: string }> }): Promise<Metadata> {
  const { region } = await params;
  const v = regionView(region);
  if (!v) return {};
  const heading = regionHeading(v.region, v.sections);
  const gym = v.sections.find((s) => s.tier === "gym");
  const title = `${heading}: teams and duels`;
  return {
    ...shareMeta({ title, description: `Every trainer from ${v.region.name} with the Pokémon they use in the games. Pick one and duel them with Pokémon cards.`, path: roadPath(region) }),
    title,
    description: `${v.region.name}'s ${gym ? `${gym.tiles.length} ${(gym.label === "Gym Leaders" ? gym.label : gym.label.toLowerCase())}` : "trainers"}${v.sections.some((s) => s.tier === "elite") ? ", Elite Four" : ""} and more, with the Pokémon each one uses in the games. Pick a trainer and duel them with Pokémon cards.`,
    alternates: { canonical: `https://www.gameshuffle.co${roadPath(region)}` },
  };
}

export default async function RegionPage({ params }: { params: Promise<{ region: string }> }) {
  if (!roadShown()) notFound();
  const { region } = await params;
  const v = regionView(region);
  if (!v) notFound();
  const heading = regionHeading(v.region, v.sections);
  const crumbs = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://www.gameshuffle.co/" },
      { "@type": "ListItem", position: 2, name: "Trainer Road", item: "https://www.gameshuffle.co/pokemon-trainers" },
      { "@type": "ListItem", position: 3, name: v.region.name, item: `https://www.gameshuffle.co${roadPath(region)}` },
    ],
  };
  return (
    <main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(crumbs) }} />
      <BrowseHero
        eyebrow="Trainer Road"
        title={heading}
        sub={`Every trainer from ${v.region.name} in the Daily Duel, with the team they bring in each game. Pick one to see their teams and duel them.`}
        accent="duel"
        field="duel"
        secondary={{ href: "/pokemon-trainers", label: "All regions" }}
      />
      <Container className="road-region-page">
        <LabeledSubNav label="Regions" variant="pills" className="road-regionnav" items={ROAD_REGIONS.map((r) => ({ label: r.name, href: roadPath(r.slug), active: r.slug === region }))} />
        <RoadPathBox region={region} signUpHref={`/signup?redirect=${encodeURIComponent(roadPath(region))}`} />
        <RoadStarsProvider>
          {v.sections.map((s) => <RoadSection key={s.tier} section={s} />)}
        </RoadStarsProvider>
        <DailyDuelModule from="trainer-road-region" />
        <ReportProblem about={`${v.region.name} on Trainer Road`} page={`/pokemon-trainers/${v.region.slug}`} />
        <TcgAttribution className="road-credits" />
      </Container>
    </main>
  );
}
