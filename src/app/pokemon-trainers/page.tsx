import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Container } from "@empac/cascadeds";
import { BrowseHero } from "@/components/events/BrowseHero";
import { DailyDuelModule } from "@/components/originals/duel/DuelChallenger";
import { FaqList } from "@/components/marketing/FaqList";
import { MarketingJsonLd } from "@/components/marketing/MarketingJsonLd";
import { TcgAttribution } from "@/components/tcg/TcgAttribution";
import { TrainerArt } from "@/components/originals/duel/TrainerArt";
import { RoadHubPath } from "@/components/originals/duel/road/RoadPath";
import { RoadStarsProvider } from "@/components/originals/duel/road/RoadTileStars";
import { ROAD_REGIONS, roadPath } from "@/lib/originals/duel/road";
import { regionView } from "@/lib/originals/duel/roadPages";
import { roadShown } from "@/lib/games-visibility";
import { ReportProblem } from "@/components/ui/ReportProblem";
import { shareMeta } from "@/lib/og/meta";
import "@/styles/trainer-road.css";
import "@/styles/road-card.css";

/**
 * /pokemon-trainers: Trainer Road's front page (picks 2026-10-23, https://claude.ai/artifact/Va86Xd5w5G44gPudmzsKDe):
 * every region with its Gym Leaders' pictures, how the road works, and the questions people ask.
 */

export const metadata: Metadata = {
  title: "Trainer Road: duel every Pokémon Gym Leader and Champion",
  description: "Every Pokémon Gym Leader, Elite Four member, Champion, rival and villain from Kanto to Paldea, with their teams from the games. Duel any of them.",
  ...shareMeta({
    title: "Trainer Road: duel every Pokémon Gym Leader and Champion",
    description: "Every Pokémon Gym Leader, Elite Four member, Champion, rival, villain boss and villain team grunt from Kanto to Paldea, with the teams they use in the games.",
    path: "/pokemon-trainers",
  }),
};

const FAQ = [
  { q: "What is Trainer Road?", a: "A page for every trainer in the Daily Duel: each region's Gym Leaders, Elite Four, Champions, rivals and villain bosses, plus each villain team's grunts and story battles, with the teams they use in the games. Pick one and duel them with Pokémon cards, any time, as often as you like." },
  { q: "Are these the teams from the games?", a: "Yes. Each team is the one the trainer uses in that game, in the order they send them out, checked against the games. A trainer who appears in several games has a team for each." },
  { q: "How does a duel work?", a: "The Daily Duel's rules: you hold three Energy, play one each turn on any of your cards, then attack or swap. Random events crash the duel about every third turn. You win by knocking out the trainer's whole team." },
  { q: "Do the duels change?", a: "Each team gets a new duel every month: a new six for you, a new Energy row and new events, the same for everyone that month. Your stars and the boards start fresh with it." },
  { q: "How do stars work?", a: "Win for one star, win within two turns of par for two, and win in par or fewer turns for all three. Easy wins earn two stars at most: the third needs Normal or Hard. Your best duel against each team this month counts, scored like the Daily Duel." },
  { q: "How does the road work?", a: "Each region follows one game: its Gym Leaders in badge order, the League back to back (lose one and you start again from its first challenge), then an end-game battle that clears the region and opens the next. Kanto comes first, Paldea last. Wins earn XP for your trainer level, and badges, Leagues and regions also pay tokens." },
  { q: "What happens when a villain team turns up?", a: "Each region's villain team turns up on your road once where its game puts it (Team Rocket's hideout before Koga in Kanto), and now and then after a badge. While they're out, the next trainer on your path waits; every other duel stays open. They swipe 50 tokens when they turn up. Beat them to get those back plus 25, and a story battle puts that team's mark on your trainer card. A loss changes nothing: try again any time." },
  { q: "What are tools?", a: "Items for your turn, each with its Item card's picture: Patch Up heals, Cure All clears conditions, Quick Switch swaps in a card that still attacks, Power Up adds to an attack, Spare Energy plays a second Energy, Look Ahead shows further down the Energy row, and Second Wind brings back a knocked-out card. Use one in a duel here or in the Daily Duel, in Easy or Normal, never in Hard; it ends that duel's solo bonus. Badges, Leagues, regions, first three-star wins and beaten villain teams give tools, and each region's Mart sells them for tokens. A first win against each trainer each month also pays prize money." },
  { q: "Do I need an account?", a: "No, anyone can duel any trainer. A free account follows the road for you, keeps your stars and level, and puts your best duels on each team's board." },
];

/** "Gym Leaders, Elite Four and Champions". */
const listOf = (parts: string[]) => (parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0] ?? "");

export default function TrainerRoadPage() {
  if (!roadShown()) notFound();
  const regions = ROAD_REGIONS.map((r) => regionView(r.slug)!).filter(Boolean);
  return (
    <main>
      <MarketingJsonLd appName="Trainer Road" appDescription="Duel every Pokémon Gym Leader, Elite Four member and Champion from the games with Pokémon cards." appUrl="/pokemon-trainers" breadcrumb={{ label: "Trainer Road", path: "/pokemon-trainers" }} faq={FAQ} />
      <BrowseHero
        eyebrow="Trainer Road"
        title="Duel every Pokémon trainer"
        sub="Every Gym Leader, Elite Four member, Champion, rival and villain from the games, with their teams. Pick one and battle them with the Daily Duel's cards."
        accent="duel"
        field="duel"
      />
      <Container className="road-hub">
        <RoadHubPath signUpHref="/signup?redirect=%2Fpokemon-trainers" />
        <RoadStarsProvider>
          <section aria-labelledby="road-regions-title" className="road-hub__regions">
            <h2 id="road-regions-title" className="road-section__title">Pick a region</h2>
            <ul className="road-regions">
              {regions.map(({ region, sections, people }) => {
                const gym = sections.find((s) => s.tier === "gym");
                const teams = people.reduce((n, p) => n + p.teams.length, 0);
                return (
                  <li key={region.slug}>
                    <Link href={roadPath(region.slug)} className="road-region">
                      <span className="road-region__name">{region.name}</span>
                      <span className="road-region__line">{listOf(sections.filter((s) => s.tier === "gym" || s.tier === "elite" || s.tier === "champion").map((s) => s.label))}</span>
                      <span className="road-region__faces" aria-hidden="true">
                        {(gym?.tiles ?? []).slice(0, 8).map((t) => (
                          <span key={t.slug} className="road-region__face">{t.picture ? <TrainerArt picture={t.picture} shape="round" /> : t.name.charAt(0)}</span>
                        ))}
                      </span>
                      <span className="road-region__count">{people.length} trainers · {teams} teams</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        </RoadStarsProvider>
        <DailyDuelModule from="trainer-road" />
        <section className="road-flat" aria-labelledby="road-faq-title">
          <h2 id="road-faq-title" className="road-section__title">About Trainer Road</h2>
          <FaqList items={FAQ} />
        </section>
        <ReportProblem about="Trainer Road" page="/pokemon-trainers" />
        <TcgAttribution className="road-credits" />
      </Container>
    </main>
  );
}
