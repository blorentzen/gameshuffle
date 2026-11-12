import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { IconDice5, IconPokeball, IconShieldHalfFilled } from "@tabler/icons-react";
import { FreeToolShell } from "@/components/tools/FreeToolShell";
import { MarketingJsonLd } from "@/components/marketing/MarketingJsonLd";
import { FaqList } from "@/components/marketing/FaqList";
import { PlansPanel } from "@/components/marketing/PlansPanel";
import { RowLink, RowPanel, type PanelRow } from "@/components/marketing/RowPanel";
import { ArrowLink } from "@/components/ui/ArrowLink";
import { ChampionsTeamBuilder } from "@/components/pokemon/ChampionsTeamBuilder";
import { PokemonDisclaimer } from "@/components/pokemon/TypeCard";
import { TcgAttribution } from "@/components/tcg/TcgAttribution";
import { getShowcaseArt } from "@/lib/pokemon/showcase";
import { CHAMPIONS_ROSTER, CHAMPIONS_SEASON, TEAM_BUILDER_PATH } from "@/lib/pokemon/champions";
import { POKEMON_CHAMPIONS_PUBLIC, championsShown } from "@/lib/games-visibility";
import { EVENTS, tagged } from "@/lib/analytics/events";

/**
 * /pokemon-champions-team-builder (Pokémon Champions game space picks, 2026-11-11, all as recommended): the team
 * builder, on its own page so it can rank for "Pokémon Champions team builder". Hidden in production until the space
 * opens (POKEMON_CHAMPIONS_PUBLIC); until then it's out of search and the sitemap too.
 */

const SITE = "https://www.gameshuffle.co";
const TITLE = `Pokémon Champions Team Builder (Regulation ${CHAMPIONS_SEASON.regulation})`;
const DESCRIPTION = "Build a Pokémon Champions team from this season's list: see what's legal and every type your team is weak to or resists, fill the rest at random, and share it with a link. Free.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: `${SITE}${TEAM_BUILDER_PATH}` },
  openGraph: { title: TITLE, description: DESCRIPTION, url: `${SITE}${TEAM_BUILDER_PATH}`, siteName: "GameShuffle", type: "website" },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
  ...(POKEMON_CHAMPIONS_PUBLIC ? {} : { robots: { index: false, follow: true } }),
};

const day = (d: string, year = true) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", ...(year ? { year: "numeric" } : {}), timeZone: "UTC" });
const SPECIES = new Set(CHAMPIONS_ROSTER.map((m) => m.dex)).size;

const STEPS = [
  { name: "Pick your six", text: "Search this season's list by name or number, or narrow it by type, and add up to six." },
  { name: "Check the weak spots", text: "The builder shows which types hit two or more of your team hard with nobody to take the hit." },
  { name: "Share it", text: "Copy link opens the same team for anyone, or send it as your team list for a tournament on GameShuffle." },
];

const FAQ = [
  { q: `Which Pokémon can I use in Regulation ${CHAMPIONS_SEASON.regulation}?`, a: `${CHAMPIONS_ROSTER.length} Pokémon from ${SPECIES} species once regional forms and Rotom's appliances are counted on their own. No Legendary or Mythical Pokémon are allowed in ${CHAMPIONS_SEASON.regulation}, which runs until ${day(CHAMPIONS_SEASON.ends)}.` },
  { q: "Can a team have two of the same Pokémon?", a: "No. A team can have one Pokémon per National Pokédex number, so Raichu and Alolan Raichu can't both be on it, and only one Tauros or Rotom form. The list greys out a second one." },
  { q: "How many Pokémon does a team need?", a: "Four to six for official play. Battles are doubles: before each game you choose four of them to bring, all at level 50." },
  { q: "How are weaknesses worked out?", a: "From each Pokémon's types against all 18 attacking types. A weak spot is a type that hits two or more of your team for double damage while fewer of them can take it. Abilities such as Levitate, held items and Mega Evolution aren't counted." },
  { q: "What does Fill the rest at random do?", a: "It fills the empty slots from this season's list and never repeats a species. With Cover weak spots on, it picks Pokémon that resist or ignore the types your team is weak to. No repeated types keeps every type on the team different." },
  { q: "What happens when the regulation changes?", a: "We check the list against the official announcements every month. When a new regulation starts, a link to a team with a Pokémon that's left the list says which ones aren't allowed anymore." },
];

export default async function ChampionsTeamBuilderPage() {
  if (!championsShown()) notFound();
  const art = await getShowcaseArt([...new Set(CHAMPIONS_ROSTER.map((m) => m.dex))]).catch(() => ({}));
  const go = (to: string) => tagged(EVENTS.homeSectionClicked, { to: `champions-${to}` });
  const rows: PanelRow[] = [
    { key: "gen", Icon: IconDice5, tone: "red", title: "Random Pokémon generator", text: "Roll 1, 3 or 6 from all 1,025, by generation or type.", action: <RowLink href="/randomizers/pokemon" className={go("generator")}>Roll some</RowLink> },
    { key: "dex", Icon: IconPokeball, tone: "orange", title: "The Daily Dex", text: "Guess today's Pokémon from its clues in five tries.", action: <RowLink href="/daily-dex" className={go("daily-dex")}>Play today&apos;s</RowLink> },
  ];
  return (
    <main>
      <MarketingJsonLd
        appName="Pokémon Champions Team Builder"
        appDescription={DESCRIPTION}
        appUrl={TEAM_BUILDER_PATH}
        appCategory="GameApplication"
        breadcrumb={{ label: "Pokémon Champions team builder", path: TEAM_BUILDER_PATH, parent: { label: "Free tools", path: "/tools" } }}
        faq={FAQ}
        howTo={{ name: "How to build a Pokémon Champions team", steps: STEPS }}
      />
      <FreeToolShell
        icon={IconShieldHalfFilled}
        eyebrow="Pokémon Champions"
        name="Pokémon Champions team builder"
        lede={<>Pick six from the <span className="champ-nowrap">{CHAMPIONS_SEASON.name}</span> list and see what your team is weak to. Copy a link to share it.</>}
      >
        <Suspense>
          <ChampionsTeamBuilder art={art} />
        </Suspense>
        {Object.keys(art).length ? <TcgAttribution className="type-card-disclaimer" /> : <PokemonDisclaimer />}

        <div className="champ-page-copy">
          <section aria-labelledby="champ-how">
            <h2 id="champ-how">How it works</h2>
            <ol className="champ-steps">
              {STEPS.map((s) => <li key={s.name}><strong>{s.name}</strong><span>{s.text}</span></li>)}
            </ol>
          </section>
          <section aria-labelledby="champ-season">
            <h2 id="champ-season">This season&apos;s list</h2>
            <p>{CHAMPIONS_SEASON.name} runs from {day(CHAMPIONS_SEASON.starts, false)} to {day(CHAMPIONS_SEASON.ends)} (Pacific time). We last checked the list against the official announcements on {day(CHAMPIONS_SEASON.checkedOn)}, and check it again every month.</p>
            <ul className="champ-sources">
              {CHAMPIONS_SEASON.sources.filter((s) => s.official).map((s) => <li key={s.url}><ArrowLink href={s.url} external>{s.label}</ArrowLink></li>)}
            </ul>
          </section>
        </div>

        <PlansPanel
          id="take-it-further"
          title="Take your team further"
          rows={["account", "pro", "circuit"]}
          from="champions-team-builder"
          copy={{
            account: { name: "Send it to a tournament", body: "A free account joins Pokémon Champions tournaments on GameShuffle and sends your team list from this builder." },
            pro: { name: "Let chat draft your team", body: "With GS Pro, chat drafts your six pick by pick with !draft start champions, and every pick shows on your OBS overlay." },
            circuit: { name: "Run a Pokémon Champions tournament", body: "Swiss rounds and a top cut, with team lists checked against this season's list. GS Circuit adds fields of 64 or 256." },
          }}
          cta={{ circuit: { label: "Start a tournament", href: "/tournament/create?game=pokemon-champions" } }}
        />

        <RowPanel rows={rows} />

        <div className="champ-page-copy">
          <section aria-labelledby="champ-faq">
            <h2 id="champ-faq">Questions</h2>
            <FaqList items={FAQ} />
          </section>
        </div>
      </FreeToolShell>
    </main>
  );
}
