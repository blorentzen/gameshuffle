/**
 * /trivia for visitors (server-rendered so it's in the HTML): how a night
 * works, what makes it a real trivia night, a template per occasion (each
 * linking its guide), the free tools and guides, then the FAQ. Signed-in
 * hosts get their nights instead (TriviaHome).
 */

import Link from "next/link";
import { Accordion, CardGroup } from "@empac/cascadeds";
import type { IconName } from "@empac/cascadeds";
import { FeatureCard } from "@/components/marketing/FeatureCard";
import { MarketingJsonLd } from "@/components/marketing/MarketingJsonLd";
import { LANDING_FAQ, OCCASIONS, TRIVIA_PATH, occasionUrl, topicUrl, type QuestionTopic } from "@/data/trivia-seo";
import "@/styles/trivia-seo.css";

const STEPS = [
  { name: "Pick a template", text: "Party, office, fundraiser, bar night or on stream. Each comes with its rounds laid out, and you can change any of them." },
  { name: "Fill the rounds", text: "Tap to fill them from GameShuffle's checked question pack, write your own, or (with GS Pro) have AI draft questions you approve." },
  { name: "Open the room", text: "Put the TV on. Teams join on their phones with a short code or the QR code, answer each question, and the scores add up as you go." },
];

const FEATURES: { icon: IconName; title: string; description: string }[] = [
  { icon: "clock", title: "Same time for everyone", description: "Every team gets the full clock on every question. No prizes for the fastest tap." },
  { icon: "device-mobile", title: "Teams play on phones", description: "No app and no account for players. One phone answers for the team; teammates can follow along on theirs." },
  { icon: "help-circle", title: "Close answers in one tap", description: "Typos and alternate answers are accepted for you, and similar answers are grouped so you judge them together." },
  { icon: "star", title: "Jokers and wagers", description: "Each team can play a joker for double points on one round, then bet on the final question." },
  { icon: "target", title: "Confidence rounds", description: "Teams rank their answers 1 to 5 by how sure they are. Right answers score their number." },
  { icon: "photo", title: "Picture rounds", description: "Name the character from their picture, shown on the TV and on every team's phone." },
];

const OCCASION_ICON: Record<string, IconName> = {
  "office-trivia-night": "briefcase",
  "party-trivia": "sparkles",
  "fundraiser-trivia-night": "heart",
  "bar-trivia": "users",
  "trivia-on-stream": "video",
};

export function TriviaLanding({ topics }: { topics: QuestionTopic[] }) {
  return (
    <div className="trivia-landing">
      <MarketingJsonLd
        appName="GameShuffle Trivia Nights"
        appDescription="Free trivia night software: build the rounds, teams answer on their phones, the TV shows the questions and the scoring adds up on its own."
        appUrl={TRIVIA_PATH}
        appCategory="GameApplication"
        breadcrumb={{ label: "Trivia nights", path: TRIVIA_PATH }}
        faq={LANDING_FAQ}
        howTo={{ name: "How to host a trivia night on GameShuffle", steps: STEPS }}
      />

      <section className="trivia-landing__section" aria-labelledby="trivia-how">
        <h2 id="trivia-how" className="trivia-landing__h2">How a trivia night works</h2>
        <ol className="app-steps">
          {STEPS.map((s, i) => (
            <li key={s.name} className="app-steps__item">
              <span className="app-steps__num" aria-hidden="true">{i + 1}</span>
              <div>
                <h3 className="app-steps__title">{s.name}</h3>
                <p className="app-steps__body">{s.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="trivia-landing__section" aria-labelledby="trivia-real">
        <h2 id="trivia-real" className="trivia-landing__h2">A real trivia night, not a quiz app</h2>
        <CardGroup columns={3} gap="md">
          {FEATURES.map((f) => <FeatureCard key={f.title} variant="compact" icon={f.icon} title={f.title} description={f.description} />)}
        </CardGroup>
      </section>

      <section className="trivia-landing__section" aria-labelledby="trivia-occasions">
        <h2 id="trivia-occasions" className="trivia-landing__h2">A template for every occasion</h2>
        <CardGroup columns={3} gap="md">
          {OCCASIONS.map((o) => (
            <FeatureCard key={o.slug} variant="compact" icon={OCCASION_ICON[o.slug] ?? "list"} title={o.label} description={o.description} href={occasionUrl(o.slug)} cta="See the template" />
          ))}
        </CardGroup>
      </section>

      <section className="trivia-landing__section" aria-labelledby="trivia-tools">
        <h2 id="trivia-tools" className="trivia-landing__h2">Free tools and guides</h2>
        <CardGroup columns={3} gap="md">
          <FeatureCard variant="compact" icon="list" title="How to host a trivia night" description="Rounds, team sizes, scoring, the rules to read out and a checklist for the night." href={`${TRIVIA_PATH}/how-to-host`} cta="Read the guide" />
          <FeatureCard variant="compact" icon="users" title="Team name generator" description="Funny, gaming, office and clean names for kids. Pick a theme and copy one." href={`${TRIVIA_PATH}/team-names`} cta="Find a name" />
          <FeatureCard variant="compact" icon="clipboard" title="Printable answer sheet" description="Set your rounds and questions, add a wager and a tiebreaker, and print." href={`${TRIVIA_PATH}/answer-sheet`} cta="Make a sheet" />
        </CardGroup>
        {topics.length > 0 && (
          <p className="trivia-landing__topics">
            Trivia questions with answers:{" "}
            {topics.map((t, i) => (
              <span key={t.slug}>{i > 0 ? " · " : ""}<Link href={topicUrl(t.slug)}>{t.label}</Link></span>
            ))}
            {" · "}<Link href={`${TRIVIA_PATH}/questions`}>All games</Link>
          </p>
        )}
      </section>

      <section className="trivia-landing__section pricing-page__faq" aria-labelledby="trivia-faq">
        <h2 id="trivia-faq" className="trivia-landing__h2">Questions hosts ask</h2>
        {/* Open by default: CDS Accordion only mounts an item once opened, so
            collapsed answers would be missing from the HTML. */}
        <Accordion
          variant="bordered"
          allowMultiple
          defaultOpenIds={LANDING_FAQ.map((_, i) => String(i))}
          items={LANDING_FAQ.map((f, i) => ({ id: String(i), title: f.q, content: f.a }))}
        />
      </section>
    </div>
  );
}
