/**
 * /trivia for visitors (server-rendered so it's in the HTML): how a night
 * works, what a night has (a swipe row on phones), a template per occasion and
 * the free tools as rows, the plans, then the FAQ. Signed-in hosts get their
 * nights instead (TriviaHome). Layout from refinement round 2 (Britton's
 * picks, 2026-10-20, https://claude.ai/artifact/Si3qUtPsHVqQXVmvGwyi4W).
 */

import Link from "next/link";
import { IconBriefcase, IconClipboard, IconHeart, IconListCheck, IconSparkles, IconUsers, IconVideo, type Icon } from "@tabler/icons-react";
import { FaqList } from "@/components/marketing/FaqList";
import type { IconName } from "@empac/cascadeds";
import { FeatureCard } from "@/components/marketing/FeatureCard";
import { ResponsiveCarousel } from "@/components/layout/ResponsiveCarousel";
import { RowLink, RowPanel, type RowTone } from "@/components/marketing/RowPanel";
import { PlansPanel } from "@/components/marketing/PlansPanel";
import { MarketingJsonLd } from "@/components/marketing/MarketingJsonLd";
import { LANDING_FAQ, OCCASIONS, TRIVIA_PATH, occasionUrl, topicUrl, type QuestionTopic } from "@/data/trivia-seo";
import "@/styles/trivia-seo.css";

const STEPS = [
  { name: "Pick a template", text: "Party, office, fundraiser, bar night or on stream. Each comes with its rounds laid out, and you can change any of them." },
  { name: "Fill the rounds", text: "Tap to fill them from GameShuffle's checked question pack, or write your own." },
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

const OCCASION_ICON: Record<string, { Icon: Icon; tone: RowTone }> = {
  "office-trivia-night": { Icon: IconBriefcase, tone: "blue" },
  "party-trivia": { Icon: IconSparkles, tone: "magenta" },
  "fundraiser-trivia-night": { Icon: IconHeart, tone: "red" },
  "bar-trivia": { Icon: IconUsers, tone: "orange" },
  "trivia-on-stream": { Icon: IconVideo, tone: "violet" },
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
        <h2 id="trivia-real" className="trivia-landing__h2">What a night has</h2>
        <ResponsiveCarousel className="empac-card-group empac-card-group--cols-3 empac-card-group--gap-md" label="What a night has">
          {FEATURES.map((f) => <FeatureCard key={f.title} variant="compact" icon={f.icon} title={f.title} description={f.description} />)}
        </ResponsiveCarousel>
      </section>

      <section className="trivia-landing__section" aria-labelledby="trivia-occasions">
        <h2 id="trivia-occasions" className="trivia-landing__h2">A template for every occasion</h2>
        <RowPanel across={false} rows={OCCASIONS.map((o) => ({
          key: o.slug,
          Icon: OCCASION_ICON[o.slug]?.Icon ?? IconListCheck,
          tone: OCCASION_ICON[o.slug]?.tone ?? "blue",
          title: o.label,
          text: o.description,
          action: <RowLink href={occasionUrl(o.slug)}>See the template</RowLink>,
        }))} />
      </section>

      <section className="trivia-landing__section" aria-labelledby="trivia-tools">
        <h2 id="trivia-tools" className="trivia-landing__h2">Free tools and guides</h2>
        <RowPanel rows={[
          { key: "guide", Icon: IconListCheck, tone: "teal", title: "How to host a trivia night", text: "Rounds, team sizes, scoring, the rules to read out and a checklist for the night.", action: <RowLink href={`${TRIVIA_PATH}/how-to-host`}>Read the guide</RowLink> },
          { key: "names", Icon: IconUsers, tone: "orange", title: "Team name generator", text: "Funny, gaming, office and clean names for kids. Pick a theme and copy one.", action: <RowLink href={`${TRIVIA_PATH}/team-names`}>Find a name</RowLink> },
          { key: "sheet", Icon: IconClipboard, tone: "blue", title: "Printable answer sheet", text: "Set your rounds and questions, add a wager and a tiebreaker, and print.", action: <RowLink href={`${TRIVIA_PATH}/answer-sheet`}>Make a sheet</RowLink> },
        ]} />
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

      <PlansPanel
        title="Free to host"
        rows={["account", "pro", "circuit"]}
        copy={{
          account: { name: "Keep your nights", body: "Save your questions and nights and run them again any time." },
          pro: { name: "AI questions and trivia on stream", body: "AI drafts rounds you approve, and on Twitch your chat answers with !a." },
          circuit: { name: "Run a weekly league", body: "Teams, weekly nights, points by place and a season champion, with a poster and answer sheets." },
        }}
        cta={{ circuit: { label: "Start a league", href: "/trivia/leagues/new" } }}
        from="trivia-landing"
      />

      <section className="trivia-landing__section pricing-page__faq" aria-labelledby="trivia-faq">
        <h2 id="trivia-faq" className="trivia-landing__h2">Questions hosts ask</h2>
        {/* Questions only; FaqList keeps every answer in the HTML for search. */}
        <FaqList items={LANDING_FAQ} />
      </section>
    </div>
  );
}
