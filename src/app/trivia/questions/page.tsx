import type { Metadata } from "next";
import { IconDeviceTv } from "@tabler/icons-react";
import { PlugBand } from "@/components/tcg/rules/PlugBand";
import Link from "next/link";
import { Container } from "@empac/cascadeds";
import { SITE_URL } from "@/lib/seo";
import { TriviaStartButton } from "@/components/trivia/seo/TriviaStartButton";
import { TRIVIA_PATH, topicUrl } from "@/data/trivia-seo";
import { liveTopics, topicCounts } from "@/lib/trivia/topics";
import { triviaMetadata } from "@/lib/trivia/seoMeta";
import "@/styles/trivia-seo.css";

export const revalidate = 86400;

const PATH = `${TRIVIA_PATH}/questions`;
const TITLE = "Video Game Trivia Questions and Answers by Game";
const DESCRIPTION = "Trivia questions with answers for Mario Kart, Mario Party, Smash, Pokémon, Overwatch and more, each checked against a source. Quiz yourself or play them as a trivia night.";

export const metadata: Metadata = triviaMetadata({ title: TITLE, description: DESCRIPTION, path: PATH });

export default async function TriviaQuestionsIndex() {
  const [topics, counts] = await Promise.all([liveTopics().catch(() => []), topicCounts().catch(() => ({} as Record<string, number>))]);
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "ItemList",
        name: "Trivia questions by game",
        itemListElement: topics.map((t, i) => ({ "@type": "ListItem", position: i + 1, name: `${t.label} trivia questions`, url: `${SITE_URL}${topicUrl(t.slug)}` })),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Trivia nights", item: `${SITE_URL}${TRIVIA_PATH}` },
          { "@type": "ListItem", position: 2, name: "Trivia questions", item: `${SITE_URL}${PATH}` },
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
            <span className="deck-breadcrumb__current">Trivia questions</span>
          </nav>
          <header className="deck-detail__header">
            <h1 className="deck-detail__title">Trivia questions by game</h1>
            <p className="rules-page__lede">Questions with answers from GameShuffle&apos;s question pack, each checked against a source before it went in. Pick a game to quiz yourself, or play its questions as a trivia night.</p>
          </header>

          {topics.length > 0 ? (
            <ul className="trivia-topics">
              {topics.map((t) => (
                <li key={t.slug}>
                  <Link href={topicUrl(t.slug)} className="trivia-topics__link">
                    <span className="trivia-topics__name">{t.label} trivia</span>
                    <span className="trivia-topics__count">{Math.min(counts[t.slug] ?? 0, 30)} questions</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="trivia-topics__empty">The first game pages are on their way. Meanwhile, host a night from our general question pack.</p>
          )}

          <PlugBand id="trivia-host" title="Host a trivia night" icon={IconDeviceTv} tone="violet" field="mixed"
            actions={<>
              <TriviaStartButton templateId="party" label="Host a trivia night" returnTo={PATH} />
              <Link href={`${TRIVIA_PATH}/how-to-host`} className="trivia-article__more">How to host a trivia night</Link>
            </>}>
            Teams answer on their phones with a short code, the TV shows the questions, and the scoring adds up on its own. Free to host.
          </PlugBand>
        </article>
      </Container>
    </main>
  );
}
