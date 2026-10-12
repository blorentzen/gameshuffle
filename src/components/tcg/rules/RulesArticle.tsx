/**
 * Layout for a Pokémon TCG rules page: breadcrumb, header, the page's own
 * sections, an FAQ (server-rendered so the answers are in the HTML), the
 * companion hand-off, related rules and the JSON-LD (Article, FAQPage,
 * BreadcrumbList). Reuses the deck guides' prose styles.
 */

import Link from "next/link";
import { Button, Container } from "@empac/cascadeds";
import { SITE_URL } from "@/lib/seo";
import { RULES_CHECKED, RULES_PATH, RULE_PAGES, ruleUrl, type RulePage } from "@/data/tcg-rules";

export interface Faq { q: string; a: string }

export function RulesArticle({ page, lede, faq, children }: { page: RulePage; lede: React.ReactNode; faq: Faq[]; children: React.ReactNode }) {
  const url = `${SITE_URL}${ruleUrl(page.slug)}`;
  const related = RULE_PAGES.filter((p) => p.slug !== page.slug);
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        headline: page.h1,
        description: page.description,
        mainEntityOfPage: url,
        dateModified: RULES_CHECKED,
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
          { "@type": "ListItem", position: 1, name: "Pokémon TCG", item: `${SITE_URL}/pokemon-tcg` },
          { "@type": "ListItem", position: 2, name: "Rules", item: `${SITE_URL}${RULES_PATH}` },
          { "@type": "ListItem", position: 3, name: page.label, item: url },
        ],
      },
    ],
  };

  return (
    <main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Container>
        <article className="deck-detail rules-page">
          <nav className="deck-breadcrumb" aria-label="Breadcrumb">
            <Link href="/pokemon-tcg">Pokémon TCG</Link>
            <span aria-hidden="true"> › </span>
            <Link href={RULES_PATH}>Rules</Link>
            <span aria-hidden="true"> › </span>
            <span className="deck-breadcrumb__current">{page.label}</span>
          </nav>
          <header className="deck-detail__header">
            <h1 className="deck-detail__title">{page.h1}</h1>
            <p className="rules-page__lede">{lede}</p>
          </header>

          <div className="deck-prose rules-page__body">{children}</div>

          <section className="rules-page__companion" aria-labelledby="rules-companion">
            <h2 id="rules-companion">Keep track at the table</h2>
            <p>
              The free GameShuffle TCG Companion tracks damage counters, Special Conditions, Energy and Prize cards on one phone, knows whose turn it is, and reminds you of the rules without stopping play. No download.
            </p>
            <div className="rules-page__actions">
              <Link href="/tcg-companion"><Button variant="primary">Open the companion</Button></Link>
              <Link href="/pokemon-tcg-companion"><Button variant="ghost">How it works</Button></Link>
            </div>
          </section>

          <section className="deck-prose rules-page__faq" aria-labelledby="rules-faq">
            <h2 id="rules-faq">Questions players ask</h2>
            <dl>
              {faq.map((f) => (
                <div key={f.q} className="rules-page__qa">
                  <dt>{f.q}</dt>
                  <dd>{f.a}</dd>
                </div>
              ))}
            </dl>
          </section>

          <nav className="rules-page__related" aria-labelledby="rules-related">
            <h2 id="rules-related">More rules</h2>
            <ul>
              {related.map((p) => (
                <li key={p.slug}>
                  <Link href={ruleUrl(p.slug)}>{p.label}</Link>
                  <span>{p.summary}</span>
                </li>
              ))}
              <li>
                <Link href="/pokemon-tcg/decks">Deck guides</Link>
                <span>Ready-to-play lists, from beginner decks to the meta.</span>
              </li>
            </ul>
          </nav>

          <p className="rules-page__checked">
            Written in our own words from the current Pokémon TCG rules, checked {new Date(`${RULES_CHECKED}T12:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/Los_Angeles" })}. Card effects can change any rule; the card wins. Pokémon and the Pokémon TCG are trademarks of their owners; GameShuffle isn&apos;t affiliated with them.
          </p>
        </article>
      </Container>
    </main>
  );
}
