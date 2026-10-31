import type { Metadata } from "next";
import { IconDeviceTv } from "@tabler/icons-react";
import { PlugBand } from "@/components/tcg/rules/PlugBand";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Container } from "@empac/cascadeds";
import { SITE_URL } from "@/lib/seo";
import { TriviaStartButton } from "@/components/trivia/seo/TriviaStartButton";
import { TopicQuestionList, type TopicQuestionView } from "@/components/trivia/seo/TopicQuestionList";
import { MIN_TOPIC_QUESTIONS, QUESTION_TOPICS, TRIVIA_PATH, topicBySlug, topicUrl } from "@/data/trivia-seo";
import { liveTopics, topicQuestions } from "@/lib/trivia/topics";
import { triviaMetadata } from "@/lib/trivia/seoMeta";
import { FIRE_ROUND_PUBLIC } from "@/lib/games-visibility";
import "@/styles/trivia-seo.css";

/** Questions come from the approved pack, so refresh once a day. A topic without
 *  enough approved questions is a 404 until it has them. */
export const revalidate = 86400;

/** The Fire Round category a topic's questions play as (Fire Round falls back to Mixed until a category has enough questions). */
const FIRE_CATEGORY: Record<string, string> = { "mario-kart": "mario-kart", pokemon: "pokemon", "mario-party": "mario-party", smash: "smash", overwatch: "overwatch", mario: "mario", zelda: "zelda", kirby: "kirby", halloween: "halloween", christmas: "christmas" };
export const dynamicParams = false;

export function generateStaticParams() {
  return QUESTION_TOPICS.map((t) => ({ topic: t.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ topic: string }> }): Promise<Metadata> {
  const topic = topicBySlug((await params).topic);
  if (!topic) return {};
  return triviaMetadata({ title: topic.title, description: topic.description, path: topicUrl(topic.slug), article: true });
}

export default async function TopicQuestionsPage({ params }: { params: Promise<{ topic: string }> }) {
  const topic = topicBySlug((await params).topic);
  if (!topic) notFound();
  const questions = (await topicQuestions(topic).catch(() => [])).filter((q) => q.familySafe);
  if (questions.length < MIN_TOPIC_QUESTIONS) notFound();
  const others = (await liveTopics().catch(() => [])).filter((t) => t.slug !== topic.slug);

  const view: TopicQuestionView[] = questions.map((q) => ({
    id: q.id,
    prompt: q.prompt,
    answer: q.answer,
    options: q.kind === "choice" ? q.options ?? null : null,
    imageUrl: q.imageUrl ?? null,
    difficulty: q.difficulty ?? "medium",
    asOf: q.changeable ? q.asOf ?? null : null,
    source: q.sources?.[0] ? { title: q.sources[0].title, url: q.sources[0].url ?? null } : null,
  }));
  const path = topicUrl(topic.slug);
  const url = `${SITE_URL}${path}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Quiz",
        name: topic.h1,
        description: topic.description,
        url,
        about: topic.label,
        educationalLevel: "General audience",
        hasPart: view.map((q) => ({
          "@type": "Question",
          name: q.prompt,
          acceptedAnswer: { "@type": "Answer", text: q.answer },
        })),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Trivia nights", item: `${SITE_URL}${TRIVIA_PATH}` },
          { "@type": "ListItem", position: 2, name: "Trivia questions", item: `${SITE_URL}${TRIVIA_PATH}/questions` },
          { "@type": "ListItem", position: 3, name: topic.label, item: url },
        ],
      },
    ],
  };

  return (
    <main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Container>
        <article className="deck-detail rules-page trivia-article">
          <nav className="deck-breadcrumb" aria-label="Breadcrumb">
            <Link href={TRIVIA_PATH}>Trivia nights</Link>
            <span aria-hidden="true"> › </span>
            <Link href={`${TRIVIA_PATH}/questions`}>Trivia questions</Link>
            <span aria-hidden="true"> › </span>
            <span className="deck-breadcrumb__current">{topic.label}</span>
          </nav>
          <header className="deck-detail__header">
            <h1 className="deck-detail__title">{topic.h1}</h1>
            <p className="rules-page__lede">
              {view.length} {topic.label}{" "}questions from GameShuffle&apos;s question pack, easiest first. Every answer was checked against a source before it went in. Quiz yourself, or play them as a trivia night where teams answer on their phones.
            </p>
            <div className="rules-page__actions">
              <TriviaStartButton topic={topic.slug} label="Play these as a trivia night" returnTo={path} />
              {FIRE_ROUND_PUBLIC && <Link href={`/daily-trivia?category=${FIRE_CATEGORY[topic.slug] ?? "video-games"}`} className="trivia-article__more">Or play them solo in a Fire Round</Link>}
              {topic.slug === "pokemon" && <Link href="/name-every-pokemon" className="trivia-article__more">Or name every Pokémon from memory</Link>}
            </div>
          </header>

          <TopicQuestionList questions={view} topic={topic.slug} />

          <PlugBand id="trivia-host" title="Play them with friends" icon={IconDeviceTv} tone="violet" field="mixed"
            actions={<>
              <TriviaStartButton topic={topic.slug} label="Play these as a trivia night" returnTo={path} />
              <Link href={`${TRIVIA_PATH}/how-to-host`} className="trivia-article__more">How to host a trivia night</Link>
            </>}>
            One tap builds a night from these questions: three rounds, a picture round when the game has pictures, and scoring that adds up on its own. Teams join with a short code, the TV shows each question, and you can change anything before you open the room. Free to host.
          </PlugBand>

          <nav className="rules-page__related" aria-labelledby="trivia-related">
            <h2 id="trivia-related">More trivia</h2>
            <ul>
              {others.map((t) => <li key={t.slug}><Link href={topicUrl(t.slug)}>{t.label} trivia questions</Link></li>)}
              <li><Link href={`${TRIVIA_PATH}/team-names`}>Trivia team name generator</Link></li>
              <li><Link href={`${TRIVIA_PATH}/answer-sheet`}>Printable answer sheet</Link></li>
            </ul>
          </nav>
        </article>
      </Container>
    </main>
  );
}
