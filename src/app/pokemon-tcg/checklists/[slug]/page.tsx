import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Container } from "@empac/cascadeds";
import { SITE_URL } from "@/lib/seo";
import { shareMeta } from "@/lib/og/meta";
import { CHECKLISTS, CHECKLISTS_PATH, checklistBySlug, checklistCount, checklistUrl } from "@/data/tcg-checklists";
import { ChecklistBoard } from "@/components/tcg/checklists/ChecklistBoard";
import { ShopChecklistLine } from "@/components/store/ShopEntry";
import { shopVisibleToVisitors } from "@/lib/store/visibility";
import { TCG_SHOP_URL } from "@/data/shop";

/**
 * One Pokémon TCG checklist (src/data/tcg-checklists.ts): the cards in order
 * with their artists, ticks kept in the browser, where the facts were checked,
 * and the GameShuffle packs that carry the cards (once visitors can see the shop).
 */

export function generateStaticParams() {
  return CHECKLISTS.map((c) => ({ slug: c.slug }));
}
export const dynamicParams = false;

/** The deck guides' share picture (a page that sets openGraph must restate it). */
const IMAGE = "/pokemon-tcg/decks/opengraph-image.jpg";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const c = checklistBySlug((await params).slug);
  if (!c) return {};
  const base = shareMeta({ title: c.title, description: c.description, path: checklistUrl(c.slug) });
  return {
    title: c.title,
    description: c.description,
    ...base,
    openGraph: { ...base.openGraph, type: "article", images: [{ url: IMAGE, width: 1200, height: 630, alt: "GameShuffle Pokémon TCG" }] },
    twitter: { ...base.twitter, images: [IMAGE] },
  };
}

const fmtDate = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

export default async function ChecklistPage({ params }: { params: Promise<{ slug: string }> }) {
  const c = checklistBySlug((await params).slug);
  if (!c) notFound();
  const shopOn = await shopVisibleToVisitors();
  const url = `${SITE_URL}${checklistUrl(c.slug)}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "ItemList",
        name: c.h1,
        url,
        numberOfItems: checklistCount(c),
        itemListElement: c.sections.flatMap((s) => s.items).map((i, n) => ({
          "@type": "ListItem",
          position: n + 1,
          name: `${i.name} ${i.no}/${c.set.total}${i.artist ? ` (illustrated by ${i.artist})` : ""}`,
        })),
      },
      { "@type": "FAQPage", mainEntity: c.faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Pokémon TCG", item: `${SITE_URL}/pokemon-tcg` },
          { "@type": "ListItem", position: 2, name: "Checklists", item: `${SITE_URL}${CHECKLISTS_PATH}` },
          { "@type": "ListItem", position: 3, name: c.h1, item: url },
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
            <Link href={CHECKLISTS_PATH}>Checklists</Link>
            <span aria-hidden="true"> › </span>
            <span className="deck-breadcrumb__current">{c.set.name}</span>
          </nav>
          <header className="deck-detail__header">
            <h1 className="deck-detail__title">{c.h1}</h1>
            <p className="rules-page__lede">{c.lede}</p>
            <p className="checklist__meta">{c.set.name} · {c.set.total} cards · released {fmtDate(c.set.released)}</p>
          </header>

          <ChecklistBoard slug={c.slug} setName={c.set.name} sections={c.sections} />

          <div className="checklist__shop">
            {shopOn && <ShopChecklistLine text={c.shopLine} />}
            <p className="shop-line">
              Missing a few? <a href={TCG_SHOP_URL} target="_blank" rel="noopener noreferrer">Shop singles on TCGplayer</a>
            </p>
          </div>

          <section className="deck-prose rules-page__faq" aria-labelledby="checklist-faq">
            <h2 id="checklist-faq">Questions</h2>
            <dl>
              {c.faq.map((f) => (
                <div key={f.q} className="rules-page__qa">
                  <dt>{f.q}</dt>
                  <dd>{f.a}</dd>
                </div>
              ))}
            </dl>
          </section>

          <footer className="deck-verify">
            <p>
              Checked {fmtDate(c.checked)} against{" "}
              {c.sources.map((s, i) => (
                <span key={s.url}>{i === 0 ? "" : i === c.sources.length - 1 ? " and " : ", "}<a href={s.url} target="_blank" rel="noopener noreferrer">{s.title}</a></span>
              ))}
              . Spot a mistake? <Link href="/contact-us">Tell us</Link>.
            </p>
          </footer>
        </div>
      </Container>
    </main>
  );
}
