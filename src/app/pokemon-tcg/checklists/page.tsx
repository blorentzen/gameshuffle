import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@empac/cascadeds";
import { SITE_URL } from "@/lib/seo";
import { shareMeta } from "@/lib/og/meta";
import { CHECKLISTS, CHECKLISTS_PATH, checklistCount, checklistUrl } from "@/data/tcg-checklists";

const title = "Pokémon TCG Checklists";
const description = "Pokémon TCG checklists you tick off as you pull cards: every card in order with its artist. Your ticks stay in your browser.";

export const metadata: Metadata = {
  title,
  description,
  ...shareMeta({ title, description, path: CHECKLISTS_PATH }),
};

export default function ChecklistsHub() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "CollectionPage", name: title, description, url: `${SITE_URL}${CHECKLISTS_PATH}`, hasPart: CHECKLISTS.map((c) => ({ "@type": "ItemList", name: c.h1, url: `${SITE_URL}${checklistUrl(c.slug)}` })) },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Pokémon TCG", item: `${SITE_URL}/pokemon-tcg` },
          { "@type": "ListItem", position: 2, name: "Checklists", item: `${SITE_URL}${CHECKLISTS_PATH}` },
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
            <span className="deck-breadcrumb__current">Checklists</span>
          </nav>
          <header className="deck-detail__header">
            <h1 className="deck-detail__title">Pokémon TCG checklists</h1>
            <p className="rules-page__lede">Tick cards off as you pull them. Every card in order, with who drew it; your ticks stay on this device, no account needed.</p>
          </header>
          <ol className="rules-hub">
            {CHECKLISTS.map((c, i) => (
              <li key={c.slug} className="rules-hub__item">
                <span className="rules-hub__n" aria-hidden="true">{i + 1}</span>
                <span className="rules-hub__text">
                  <Link href={checklistUrl(c.slug)} className="rules-hub__link">{c.h1}</Link>
                  <span>{checklistCount(c)} cards from {c.set.name}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </Container>
    </main>
  );
}
