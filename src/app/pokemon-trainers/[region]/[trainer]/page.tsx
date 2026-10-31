import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Container } from "@empac/cascadeds";
import { BrowseHero } from "@/components/events/BrowseHero";
import { DailyDuelModule } from "@/components/originals/duel/DuelChallenger";
import { TcgAttribution } from "@/components/tcg/TcgAttribution";
import { TrainerArt } from "@/components/originals/duel/TrainerArt";
import { RoadDuel } from "@/components/originals/duel/road/RoadDuel";
import { roadPath } from "@/lib/originals/duel/road";
import { allRoadPeople, personView } from "@/lib/originals/duel/roadPages";
import "@/styles/daily-duel.css";
import { roadShown } from "@/lib/games-visibility";
import { ReportProblem } from "@/components/ui/ReportProblem";
import { previewText, shareMeta } from "@/lib/og/meta";
import "@/styles/trainer-road.css";

/**
 * /pokemon-trainers/<region>/<trainer>: one trainer on Trainer Road: who they are, every team they
 * bring in that region's games, and a duel against the team you pick (RoadDuel).
 */

export const dynamicParams = false;
export function generateStaticParams() {
  return allRoadPeople().map((p) => ({ region: p.region, trainer: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ region: string; trainer: string }> }): Promise<Metadata> {
  const { region, trainer } = await params;
  const v = personView(region, trainer);
  if (!v) return {};
  const many = v.teams.length > 1;
  const games = [...new Set(v.teams.map((t) => t.gameLabel))];
  // The eyebrow names the region ("Johto Gym Leader"), so two regions' Team Rocket pages don't share a title.
  const title = `${v.person.name}'s Pokémon team${many ? "s" : ""}: ${v.eyebrow}`;
  // Search shows about 160 characters: the teams and the duel first, the bio after.
  const description = previewText(`${v.person.name}'s team${many ? "s" : ""} in ${games.join(", ")}, in battle order, and a Pokémon card duel against them.${v.bio ? ` ${v.bio}` : ""}`, 160);
  return { title, description, ...shareMeta({ title, description, path: roadPath(region, trainer) }) };
}

export default async function TrainerPage({ params }: { params: Promise<{ region: string; trainer: string }> }) {
  if (!roadShown()) notFound();
  const { region, trainer } = await params;
  const v = personView(region, trainer);
  if (!v) notFound();
  const crumbs = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://www.gameshuffle.co/" },
      { "@type": "ListItem", position: 2, name: "Trainer Road", item: "https://www.gameshuffle.co/pokemon-trainers" },
      { "@type": "ListItem", position: 3, name: v.region.name, item: `https://www.gameshuffle.co${roadPath(region)}` },
      { "@type": "ListItem", position: 4, name: v.person.name, item: `https://www.gameshuffle.co${roadPath(region, trainer)}` },
    ],
  };
  return (
    <main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(crumbs) }} />
      <BrowseHero
        eyebrow={v.eyebrow}
        title={v.person.name}
        sub={v.bio ?? v.role}
        accent="duel"
        field="duel"
        aside={v.picture ? <div className="road-hero__art"><TrainerArt picture={v.picture} shape="banner" alt={v.picture.alt} eager /></div> : undefined}
        secondary={{ href: roadPath(region), label: `All of ${v.region.name}` }}
      />
      <Container className="tool-page duel-page road-page">
        <nav className="road-crumbs road-quiet" aria-label="Breadcrumb">
          <Link href="/pokemon-trainers">Trainer Road</Link> <span aria-hidden="true">/</span> <Link href={roadPath(region)}>{v.region.name}</Link> <span aria-hidden="true">/</span> <span aria-current="page">{v.person.name}</span>
        </nav>
        <RoadDuel region={region} person={{ name: v.person.name, slug: trainer }} teams={v.teams} next={v.next} />
        <DailyDuelModule from="trainer-road-trainer" className="road-quiet" />
        <div className="road-credits road-quiet">
          <ReportProblem about={`${v.person.name} on Trainer Road`} page={roadPath(region, trainer)} />
          {v.picture && <p className="road-credits__pic">{v.picture.credit}</p>}
          <TcgAttribution className="duel-credits" />
        </div>
      </Container>
    </main>
  );
}
