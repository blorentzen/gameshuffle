import type { Metadata } from "next";
import QRCode from "qrcode";
import { SITE_URL } from "@/lib/seo";
import Link from "next/link";
import { IconClipboardList } from "@tabler/icons-react";
import { FreeToolShell } from "@/components/tools/FreeToolShell";
import { MarketingJsonLd } from "@/components/marketing/MarketingJsonLd";
import { AnswerSheetMaker } from "@/components/trivia/seo/AnswerSheetMaker";
import { TriviaStartButton } from "@/components/trivia/seo/TriviaStartButton";
import { TRIVIA_PATH } from "@/data/trivia-seo";
import { triviaMetadata } from "@/lib/trivia/seoMeta";
import "@/styles/trivia-seo.css";

const PATH = `${TRIVIA_PATH}/answer-sheet`;
const TITLE = "Printable Trivia Answer Sheet Maker (Free)";
const DESCRIPTION = "Make a printable trivia answer sheet in seconds: pick the number of rounds and questions, add a final wager and a tiebreaker, and print one for every team. Free, no sign-up.";

export const metadata: Metadata = triviaMetadata({ title: TITLE, description: DESCRIPTION, path: PATH });

const FAQ = [
  { q: "How many rounds should a trivia answer sheet have?", a: "Most nights use five to seven rounds of 8 to 10 questions. A party or office lunch is fine with four rounds of 6. Pick the numbers here and the sheet lays itself out." },
  { q: "What is a final wager?", a: "On the last question, each team writes how many of its points it bets. A right answer wins the bet and a wrong one loses it, so a team behind can still catch up." },
  { q: "What is the tiebreaker for?", a: "If two teams finish level, the host reads a question with a number for an answer (a year, a distance, a count). The team closest to it wins." },
  { q: "Can teams answer on their phones instead?", a: "Yes. On GameShuffle teams join with a short code, type answers on their phones and the scoring adds up on its own. Keep a few paper sheets as a backup." },
];

export default async function AnswerSheetPage({ searchParams }: { searchParams: Promise<{ title?: string; code?: string }> }) {
  const sp = await searchParams;
  const initialTitle = typeof sp.title === "string" ? sp.title.slice(0, 60) : "";
  const code = typeof sp.code === "string" && /^[A-Z0-9]{4,8}$/.test(sp.code) ? sp.code : null;
  const joinQr = code ? await QRCode.toString(`${SITE_URL}/trivia/play/${code}`, { type: "svg", margin: 0, width: 96, color: { dark: "#111317", light: "#ffffff" } }) : null;
  return (
    <main>
      <MarketingJsonLd
        appName="Trivia Answer Sheet Maker"
        appDescription={DESCRIPTION}
        appUrl={PATH}
        appCategory="UtilitiesApplication"
        breadcrumb={{ label: "Trivia answer sheet", path: PATH }}
        faq={FAQ}
      />
      <FreeToolShell
        icon={IconClipboardList}
        name="Trivia answer sheet maker"
        crumbs={[{ label: "Trivia nights", href: TRIVIA_PATH }, { label: "Answer sheet" }]}
        lede="Pick your rounds and questions, add the night's name, and print one sheet for every team."
      >
        <section className="tool-panel" style={{ width: "100%" }}>
          <AnswerSheetMaker initialTitle={initialTitle} code={code} joinQr={joinQr} />
        </section>

        <section className="trivia-tool-copy">
          <h2>Questions</h2>
          <dl className="trivia-tool-faq">
            {FAQ.map((f) => <div key={f.q}><dt>{f.q}</dt><dd>{f.a}</dd></div>)}
          </dl>

          <div className="trivia-tool-cta">
            <h2>Skip the paper next time</h2>
            <p>Teams join on their phones, the TV shows each question, and the scores add up as you go, jokers and wagers included. Free to host. New to it? Read <Link href={`${TRIVIA_PATH}/how-to-host`}>how to host a trivia night</Link>.</p>
            <TriviaStartButton templateId="party" label="Host a trivia night" returnTo={PATH} />
          </div>
        </section>
      </FreeToolShell>
    </main>
  );
}
