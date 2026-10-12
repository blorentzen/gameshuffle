import type { Metadata } from "next";
import Link from "next/link";
import { Button, Container } from "@empac/cascadeds";
import { SITE_URL } from "@/lib/seo";
import { RULES_PATH, RULE_PAGES, ruleUrl } from "@/data/tcg-rules";
import { shareMeta } from "@/lib/og/meta";

const title = "Pokémon TCG Rules in Plain Words";
const description = "The Pokémon Trading Card Game rules players look up most: damage counters, Special Conditions, Weakness and Resistance, Prize cards and how a turn works.";

export const metadata: Metadata = {
  title,
  description,
  ...shareMeta({ title, description, path: RULES_PATH }),
};

export default function RulesHubPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        name: title,
        description,
        url: `${SITE_URL}${RULES_PATH}`,
        hasPart: RULE_PAGES.map((p) => ({ "@type": "Article", headline: p.h1, url: `${SITE_URL}${ruleUrl(p.slug)}` })),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Pokémon TCG", item: `${SITE_URL}/pokemon-tcg` },
          { "@type": "ListItem", position: 2, name: "Rules", item: `${SITE_URL}${RULES_PATH}` },
        ],
      },
    ],
  };

  return (
    <main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Container>
        <div className="deck-detail rules-page">
          <nav className="deck-breadcrumb" aria-label="Breadcrumb">
            <Link href="/pokemon-tcg">Pokémon TCG</Link>
            <span aria-hidden="true"> › </span>
            <span className="deck-breadcrumb__current">Rules</span>
          </nav>
          <header className="deck-detail__header">
            <h1 className="deck-detail__title">Pokémon TCG rules, in plain words</h1>
            <p className="rules-page__lede">
              The rules players look up most, written short, with a tool to use on the spot. Card effects can change any rule; when they do, the card wins.
            </p>
          </header>

          <ol className="rules-hub">
            {RULE_PAGES.map((p, i) => (
              <li key={p.slug} className="rules-hub__item">
                <span className="rules-hub__n" aria-hidden="true">{i + 1}</span>
                <span className="rules-hub__text">
                  <Link href={ruleUrl(p.slug)} className="rules-hub__link">{p.label}</Link>
                  <span>{p.summary}</span>
                </span>
              </li>
            ))}
          </ol>

          <section className="rules-page__companion" aria-labelledby="rules-hub-companion">
            <h2 id="rules-hub-companion">Play with the rules built in</h2>
            <p>The free GameShuffle TCG Companion keeps the turn, damage counters, conditions and Prize cards on one phone, and reminds you of these rules as you play.</p>
            <div className="rules-page__actions">
              <Link href="/tcg-companion"><Button variant="primary">Open the companion</Button></Link>
              <Link href="/pokemon-tcg/decks"><Button variant="ghost">Find a deck to start with</Button></Link>
            </div>
          </section>
        </div>
      </Container>
    </main>
  );
}
