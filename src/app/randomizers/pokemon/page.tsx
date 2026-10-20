import { Suspense } from "react";
import type { Metadata } from "next";
import { Container } from "@empac/cascadeds";
import { IconBolt, IconListNumbers, IconPokeball, IconRoute } from "@tabler/icons-react";
import { PokemonGenerator } from "@/components/pokemon/PokemonGenerator";
import { NewBanner } from "@/components/NewBanner";
import { PlansPanel } from "@/components/marketing/PlansPanel";
import { NewHereLine } from "@/components/welcome/NewHereLine";
import { RandomizerLanding } from "@/components/marketing/RandomizerLanding";
import { RowLink, RowPanel, type PanelRow } from "@/components/marketing/RowPanel";
import { RANDOMIZER_LANDINGS, randomizerMetadata } from "@/data/randomizer-landings";
import { BrowseHero } from "@/components/events/BrowseHero";
import { getShowcaseArt } from "@/lib/pokemon/showcase";
import { topicUrl } from "@/data/trivia-seo";
import { EVENTS, tagged } from "@/lib/analytics/events";

const landing = RANDOMIZER_LANDINGS.pokemon;

// Showcase card art is read from tcg_cards; refresh it daily.
export const revalidate = 86400;

export const metadata: Metadata = randomizerMetadata("pokemon");

/**
 * /randomizers/pokemon: the random Pokémon generator (search pages round,
 * picks 2026-10-20). One URL like every randomizer: the tool, more Pokémon on
 * GameShuffle, then the landing copy. Type cards only (no official art), with
 * showcase TCG card art where it's populated.
 */
export default async function PokemonGeneratorPage() {
  const art = await getShowcaseArt();
  const go = (to: string) => tagged(EVENTS.homeSectionClicked, { to: `pokegen-${to}` });
  const rows: PanelRow[] = [
    { key: "dex", Icon: IconPokeball, tone: "orange", title: "The Daily Dex", text: "Guess today's Pokémon from all 1,025 in five tries. A new one every day.", action: <RowLink href="/daily-dex" className={go("daily-dex")}>Play today&apos;s</RowLink> },
    { key: "names", Icon: IconListNumbers, tone: "red", title: "Name every Pokémon", text: "How many of the 1,025 can you name in 15 minutes?", action: <RowLink href="/name-every-pokemon" className={go("names")}>Start naming</RowLink> },
    { key: "quiz", Icon: IconBolt, tone: "violet", title: "Pokémon quiz", text: "Trivia questions with answers, from starters to the card game.", action: <RowLink href={topicUrl("pokemon")} className={go("quiz")}>Take the quiz</RowLink> },
    { key: "run", Icon: IconRoute, tone: "green", title: "Fire Red and Leaf Green run challenge", text: "A starter, the catches you can find before each gym, and level caps.", action: <RowLink href="/randomizers/pokemon-firered-leafgreen" className={go("frlg")}>Start a run</RowLink> },
  ];
  return (
    <main>
      <BrowseHero eyebrow="Free randomizer · New" title={landing.h1} sub={landing.lead} subShort="Roll from all 1,025 Pokémon." accent="red" field="video" primary={{ href: "#play", label: "Roll Pokémon" }} />
      <div id="play">
        <Container className="tool-page">
          <NewBanner />
          <Suspense>
            <PokemonGenerator art={art} />
          </Suspense>
        </Container>
      </div>
      <Container className="pokegen-more">
        <section aria-labelledby="pokegen-more-title">
          <h2 id="pokegen-more-title">More Pokémon on GameShuffle</h2>
          <RowPanel rows={rows} />
        </section>
      </Container>
      {/* Its own wording (the shared nudge would promise saved rolls): real paid paths for Pokémon fans. */}
      <Container>
        <NewHereLine from="randomizer" />
        <PlansPanel
          id="take-it-further"
          title="Take Pokémon further"
          rows={["account", "pro", "circuit"]}
          from="randomizer-pokemon"
          copy={{
            account: { name: "Keep your streak and your cards", body: "A free account keeps your Daily Dex streak, your Pokémon TCG deck lists and the cards you collect." },
            pro: { name: "Let chat draft your team", body: "With GS Pro, chat drafts your Pokémon team pick by pick with !draft start pokemon, and every pick shows on your OBS overlay." },
            circuit: { name: "Run a Pokémon TCG tournament", body: "Swiss rounds by the Play! Pokémon rules, deck lists checked for you, and a top cut. GS Circuit adds fields of 64 or 256." },
          }}
        />
      </Container>
      <RandomizerLanding landing={landing} />
    </main>
  );
}
