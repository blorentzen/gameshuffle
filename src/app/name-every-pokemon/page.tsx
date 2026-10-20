import type { Metadata } from "next";
import { IconBolt, IconDice5, IconListNumbers, IconPokeball } from "@tabler/icons-react";
import { FreeToolShell } from "@/components/tools/FreeToolShell";
import { MarketingJsonLd } from "@/components/marketing/MarketingJsonLd";
import { FaqList } from "@/components/marketing/FaqList";
import { RowLink, RowPanel, type PanelRow } from "@/components/marketing/RowPanel";
import { NameEveryPokemon } from "@/components/pokemon/NameEveryPokemon";
import { PokemonDisclaimer } from "@/components/pokemon/TypeCard";
import { GEN_REGIONS } from "@/lib/pokemon/generator";
import { clockLabel, setPool, QUIZ_SETS } from "@/lib/pokemon/nameQuiz";
import { topicUrl } from "@/data/trivia-seo";
import { EVENTS, tagged } from "@/lib/analytics/events";

const PATH = "/name-every-pokemon";
const SITE = "https://www.gameshuffle.co";
const TITLE = "Name Every Pokémon Quiz: Can You Name All 1,025?";
const DESCRIPTION = "How many Pokémon can you name from memory? Type all 1,025 in 15 minutes, or one generation at a time. Close spellings count, your best is kept, and you can share your score. Free.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: `${SITE}${PATH}` },
  openGraph: { title: TITLE, description: DESCRIPTION, url: `${SITE}${PATH}`, siteName: "GameShuffle", type: "website" },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

const STEPS = [
  { name: "Pick the Pokémon", text: "All 1,025, or one generation from Kanto to Paldea." },
  { name: "Pick the clock", text: "15 minutes for everyone (8 for Gen 1), double that, or no limit." },
  { name: "Start typing", text: "Each one counts as soon as it's spelled right. Press Enter for a close spelling." },
];

const FAQ = [
  { q: "How many Pokémon are there?", a: "1,025, from Bulbasaur (#0001) to Pecharunt (#1025), across nine generations. Gen 1 has 151, and Gen 9 (Scarlet and Violet, with its DLC) brought the total to 1,025." },
  { q: "Do I have to spell them right?", a: "A name counts the moment it's spelled right, ignoring capitals, accents and punctuation (mr mime, farfetchd and flabebe all work). If you're close, press Enter: a small typo counts when it can only mean one Pokémon." },
  { q: "How do I type Nidoran, Mr. Mime or Type: Null?", a: "Just the letters: nidoran (type it twice for both), mr mime, mime jr, type null, ho oh, porygon z, jangmo o. Nidoran f and nidoran m work too." },
  { q: "Why didn't Mew count straight away?", a: "Mew is the start of Mewtwo, so the game waits a moment in case you're still typing. The same goes for Porygon and Klink. Press Enter to count it right away." },
  { q: "How long do I get?", a: "15 minutes for all 1,025, 8 for Gen 1's 151, and the same pace for the other generations. Pick 30 minutes (double) or no limit if you'd rather take your time." },
  { q: "Is my score saved?", a: "Your best for each set and clock stays in this browser, and a game in progress survives a reload. Share makes a picture card with your score." },
];

export default function NameEveryPokemonPage() {
  const go = (to: string) => tagged(EVENTS.homeSectionClicked, { to: `name-quiz-${to}` });
  const rows: PanelRow[] = [
    { key: "dex", Icon: IconPokeball, tone: "orange", title: "The Daily Dex", text: "One Pokémon a day to guess from its clues, in five tries.", action: <RowLink href="/daily-dex" className={go("daily-dex")}>Play today&apos;s</RowLink> },
    { key: "gen", Icon: IconDice5, tone: "red", title: "Random Pokémon generator", text: "Roll 1, 3 or 6 from all 1,025, by generation or type.", action: <RowLink href="/randomizers/pokemon" className={go("generator")}>Roll some</RowLink> },
    { key: "quiz", Icon: IconBolt, tone: "violet", title: "Pokémon quiz", text: "Trivia questions with answers, from starters to the card game.", action: <RowLink href={topicUrl("pokemon")} className={go("quiz")}>Take the quiz</RowLink> },
  ];
  return (
    <main>
      <MarketingJsonLd
        appName="Name Every Pokémon"
        appDescription={DESCRIPTION}
        appUrl={PATH}
        appCategory="GameApplication"
        breadcrumb={{ label: "Name every Pokémon", path: PATH, parent: { label: "Free tools", path: "/tools" } }}
        faq={FAQ}
        howTo={{ name: "How to play Name Every Pokémon", steps: STEPS }}
      />
      <FreeToolShell icon={IconListNumbers} eyebrow="Pokémon quiz" name="Name every Pokémon" lede="How many can you name from memory? Type them in before the clock runs out. All 1,025, or one generation at a time.">
        <NameEveryPokemon />
        <PokemonDisclaimer />

        <div className="nq-copy">
          <section aria-labelledby="nq-how">
            <h2 id="nq-how">How it works</h2>
            <ol className="nq-steps">
              {STEPS.map((s) => <li key={s.name}><strong>{s.name}</strong><span>{s.text}</span></li>)}
            </ol>
          </section>
          <section aria-labelledby="nq-gens">
            <h2 id="nq-gens">Every generation</h2>
            <p>Want a warm-up? Each generation is its own round, on the same pace as the full list.</p>
            <ul className="nq-gens">
              {QUIZ_SETS.filter((s) => s !== "all").map((s) => (
                <li key={s}><strong>Gen {s} · {GEN_REGIONS[Number(s)]}</strong>: {setPool(s).length} Pokémon, {clockLabel(s, "standard")}</li>
              ))}
            </ul>
          </section>
        </div>

        <RowPanel rows={rows} />

        <div className="nq-copy">
          <section aria-labelledby="nq-faq">
            <h2 id="nq-faq">Questions</h2>
            <FaqList items={FAQ} />
          </section>
        </div>
      </FreeToolShell>
    </main>
  );
}
