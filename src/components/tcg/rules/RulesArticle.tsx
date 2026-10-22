/**
 * Layout for a Pokémon TCG rules page: breadcrumb, header, the page's own
 * sections, an FAQ (server-rendered so the answers are in the HTML), the
 * companion hand-off, related rules and the JSON-LD (Article, FAQPage,
 * BreadcrumbList). Reuses the deck guides' prose styles.
 */

import Link from "next/link";
import { Button, Container } from "@empac/cascadeds";
import { IconAlertTriangle, IconBook2, IconCards, IconCircles, IconScale, IconTrophy, type Icon } from "@tabler/icons-react";
import { SITE_URL } from "@/lib/seo";
import { RULES_CHECKED, RULES_PATH, RULE_PAGES, ruleUrl, type RulePage } from "@/data/tcg-rules";
import { IconTile, type TileTone } from "@/components/ui/IconTile";
import { ARROW_HOST_CLASS, ArrowCue } from "@/components/ui/ArrowLink";
import { PlugBand } from "@/components/tcg/rules/PlugBand";

export interface Faq { q: string; a: string }

/** Each rule page's tile on the More rules cards (design round 3, 2026-10-20). */
export const RULE_TILES: Record<string, { icon: Icon; tone: TileTone }> = {
  "damage-counters": { icon: IconCircles, tone: "red" },
  "special-conditions": { icon: IconAlertTriangle, tone: "violet" },
  "weakness-and-resistance": { icon: IconScale, tone: "teal" },
  "prize-cards": { icon: IconTrophy, tone: "orange" },
  "how-to-play": { icon: IconBook2, tone: "blue" },
};

/** One More rules card: the whole card is the link. */
function RuleCard({ href, title, summary, icon, tone }: { href: string; title: string; summary: string; icon: Icon; tone: TileTone }) {
  return (
    <Link href={href} className={`rule-card ${ARROW_HOST_CLASS}`}>
      <IconTile icon={icon} tone={tone} />
      <span className="rule-card__title">{title}</span>
      <span className="rule-card__text">{summary}</span>
      <ArrowCue className="rule-card__go">Read it</ArrowCue>
    </Link>
  );
}

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

          <PlugBand
            id="rules-companion"
            title="Keep track at the table"
            actions={<>
              <Link href="/tcg-companion"><Button variant="primary">Open the companion</Button></Link>
              <Link href="/pokemon-tcg-companion"><Button variant="ghost">How it works</Button></Link>
            </>}
          >
            The free GameShuffle TCG Companion tracks damage counters, Special Conditions, Energy and Prize cards on one phone, knows whose turn it is, and reminds you of the rules without stopping play. No download.
          </PlugBand>

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
              {related.map((p) => {
                const tile = RULE_TILES[p.slug] ?? { icon: IconBook2, tone: "blue" as const };
                return (
                  <li key={p.slug}>
                    <RuleCard href={ruleUrl(p.slug)} title={p.label} summary={p.summary} icon={tile.icon} tone={tile.tone} />
                  </li>
                );
              })}
              <li>
                <RuleCard href="/pokemon-tcg/decks" title="Deck guides" summary="Ready-to-play lists, from beginner decks to the meta." icon={IconCards} tone="green" />
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
