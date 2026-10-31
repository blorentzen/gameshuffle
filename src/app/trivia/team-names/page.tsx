import type { Metadata } from "next";
import Link from "next/link";
import { IconUsersGroup } from "@tabler/icons-react";
import { FreeToolShell } from "@/components/tools/FreeToolShell";
import { MarketingJsonLd } from "@/components/marketing/MarketingJsonLd";
import { TeamNameGenerator } from "@/components/trivia/seo/TeamNameGenerator";
import { TriviaStartButton } from "@/components/trivia/seo/TriviaStartButton";
import { TEAM_NAMES, TEAM_NAME_THEMES } from "@/data/trivia-team-names";
import { TRIVIA_PATH } from "@/data/trivia-seo";
import { triviaMetadata } from "@/lib/trivia/seoMeta";
import "@/styles/trivia-seo.css";

const PATH = `${TRIVIA_PATH}/team-names`;
const TITLE = "Trivia Team Name Generator: Funny and Gaming Names";
const DESCRIPTION = "Free trivia team name generator with 120+ names: funny, gaming, office, puns and clean names for kids. Pick a theme, get six names, copy your favorite. No sign-up.";

export const metadata: Metadata = triviaMetadata({ title: TITLE, description: DESCRIPTION, path: PATH });

const FAQ = [
  { q: "What makes a good trivia team name?", a: "Short enough for the host to read out, easy to say, and a little bit funny. Puns on the word quiz, a nod to your group (the office, a game you all play) or a joke at your own expense all work well." },
  { q: "Are these trivia team names clean?", a: "Yes. A few joke about drinking, and the Clean for kids switch hides those, so the rest are fine for a school or family trivia night." },
  { q: "Do I need an account?", a: "No. Pick themes, press More names, and copy the one you like. Nothing is saved or sent anywhere." },
];

export default function TeamNamesPage() {
  return (
    <main>
      <MarketingJsonLd
        appName="Trivia Team Name Generator"
        appDescription={DESCRIPTION}
        appUrl={PATH}
        appCategory="UtilitiesApplication"
        breadcrumb={{ label: "Trivia team name generator", path: PATH }}
        faq={FAQ}
      />
      <FreeToolShell
        icon={IconUsersGroup}
        name="Trivia team name generator"
        crumbs={[{ label: "Trivia nights", href: TRIVIA_PATH }, { label: "Team names" }]}
        lede="Stuck on a name? Pick a theme or two, press More names, and copy the one that makes your table laugh."
      >
        <section className="tool-panel" style={{ width: "100%" }}>
          <TeamNameGenerator />
        </section>

        <section className="trivia-tool-copy">
          <h2>Every name on the list</h2>
          <p>Our own handwritten names, by theme. The ones marked 🍺 joke about drinking.</p>
          <div className="trivia-name-lists">
            {TEAM_NAME_THEMES.map((t) => (
              <div key={t.id}>
                <h3>{t.id === "kids" ? "Trivia team names for kids" : `${t.label} trivia team names`}</h3>
                <ul>
                  {TEAM_NAMES[t.id].map((n) => <li key={n.name}>{n.name}{n.adult ? <span className="trivia-name-lists__adult" title="Drinking joke" aria-label="(drinking joke)"> 🍺</span> : null}</li>)}
                </ul>
              </div>
            ))}
          </div>

          <h2>Questions</h2>
          <dl className="trivia-tool-faq">
            {FAQ.map((f) => <div key={f.q}><dt>{f.q}</dt><dd>{f.a}</dd></div>)}
          </dl>

          <div className="trivia-tool-cta">
            <h2>Got a name? Now host the night</h2>
            <p>Teams join on their phones with a short code, the TV shows the questions, and the scoring adds up on its own. Free to host. Or read <Link href={`${TRIVIA_PATH}/how-to-host`}>how to host a trivia night</Link>.</p>
            <TriviaStartButton templateId="party" label="Host a trivia night" returnTo={PATH} />
          </div>
        </section>
      </FreeToolShell>
    </main>
  );
}
