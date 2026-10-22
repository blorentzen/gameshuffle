/**
 * Layout for the trivia pages written for search (occasion pages, the hosting
 * guide): breadcrumb, header, the page's own sections, an FAQ (server-rendered
 * so the answers are in the HTML), the "host a night" hand-off, related pages
 * and the JSON-LD (Article, FAQPage, BreadcrumbList). Reuses the deck guides'
 * prose styles, like the Pokémon TCG rules pages.
 */

import Link from "next/link";
import { IconDeviceTv } from "@tabler/icons-react";
import { PlugBand } from "@/components/tcg/rules/PlugBand";
import { Container } from "@empac/cascadeds";
import { SITE_URL } from "@/lib/seo";
import { OCCASIONS, TRIVIA_CHECKED, TRIVIA_PATH, occasionUrl, type Faq } from "@/data/trivia-seo";
import { TriviaStartButton } from "./TriviaStartButton";
import "@/styles/trivia-seo.css";

export function TriviaArticle({ path, label, h1, description, lede, faq, children, templateId, startLabel }: {
  /** The page's own path, e.g. /trivia/office-trivia-night. */
  path: string;
  /** Short name for the breadcrumb. */
  label: string;
  h1: string;
  description: string;
  lede: React.ReactNode;
  faq: Faq[];
  children: React.ReactNode;
  /** Which template "Start" opens (default: Party). */
  templateId?: string;
  startLabel?: string;
}) {
  const url = `${SITE_URL}${path}`;
  const related = [
    ...OCCASIONS.filter((o) => occasionUrl(o.slug) !== path).map((o) => ({ href: occasionUrl(o.slug), label: o.label })),
    ...(path !== `${TRIVIA_PATH}/how-to-host` ? [{ href: `${TRIVIA_PATH}/how-to-host`, label: "How to host a trivia night" }] : []),
    { href: `${TRIVIA_PATH}/team-names`, label: "Trivia team name generator" },
    { href: `${TRIVIA_PATH}/answer-sheet`, label: "Printable answer sheet" },
  ];
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        headline: h1,
        description,
        mainEntityOfPage: url,
        dateModified: TRIVIA_CHECKED,
        author: { "@type": "Organization", name: "GameShuffle", url: SITE_URL },
        publisher: { "@type": "Organization", name: "GameShuffle", url: SITE_URL },
      },
      {
        "@type": "FAQPage",
        mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Trivia nights", item: `${SITE_URL}${TRIVIA_PATH}` },
          { "@type": "ListItem", position: 2, name: label, item: url },
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
            <span className="deck-breadcrumb__current">{label}</span>
          </nav>
          <header className="deck-detail__header">
            <h1 className="deck-detail__title">{h1}</h1>
            <p className="rules-page__lede">{lede}</p>
            <div className="rules-page__actions">
              <TriviaStartButton templateId={templateId ?? "party"} label={startLabel ?? "Host a trivia night"} returnTo={path} />
            </div>
          </header>

          <div className="deck-prose rules-page__body">{children}</div>

          <PlugBand id="trivia-host" title="Run it on GameShuffle" icon={IconDeviceTv} tone="violet" field="mixed"
            actions={<>
              <TriviaStartButton templateId={templateId ?? "party"} label={startLabel ?? "Host a trivia night"} returnTo={path} />
              <Link href={TRIVIA_PATH} className="trivia-article__more">How GameShuffle trivia works</Link>
            </>}>
            Free to host. Teams answer on their phones with a short code, the TV shows the questions and the standings, and the scoring adds up on its own. Fill rounds from our checked question pack, your own questions, or AI drafts you approve.
          </PlugBand>

          <section className="deck-prose rules-page__faq" aria-labelledby="trivia-faq">
            <h2 id="trivia-faq">Questions hosts ask</h2>
            <dl>
              {faq.map((f) => (
                <div key={f.q} className="rules-page__qa">
                  <dt>{f.q}</dt>
                  <dd>{f.a}</dd>
                </div>
              ))}
            </dl>
          </section>

          <nav className="rules-page__related" aria-labelledby="trivia-related">
            <h2 id="trivia-related">More for your trivia night</h2>
            <ul>
              {related.map((r) => <li key={r.href}><Link href={r.href}>{r.label}</Link></li>)}
            </ul>
          </nav>
        </article>
      </Container>
    </main>
  );
}
