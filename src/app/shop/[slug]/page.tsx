/**
 * /shop/[slug]: one merch product (pick 6), from Platform ▸ Shop ▸ Merch.
 * Hidden like /shop: page not found for visitors until the shop is open or in
 * Coming soon; staff open a product that isn't live yet only with ?preview=1. Not indexed
 * until the shop is open and the product is live; then Product JSON-LD.
 * A product in a series (Eat. Sleep.…) names it above the title and links
 * the rest of the series under the product. "Pair it with" (pairsFor) sits
 * under the buy box: three live products of other kinds.
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumb, Container } from "@empac/cascadeds";
import { MerchProduct } from "@/components/store/MerchProduct";
import { MerchCard } from "@/components/store/MerchShelf";
import { devPreviewFromPrintful, getMerchListing, listMerchListings, type MerchListing } from "@/lib/store/merchCatalog";
import { MerchNotReady } from "@/lib/store/merchSync";
import { cartSeed, listShopProducts, type ShopProduct } from "@/lib/store/products";
import { collectionOf } from "@/lib/store/merch";
import { pairsFor } from "@/lib/store/merchFilters";
import { merchCopy } from "@/lib/store/copy";
import { getPlatformFlag } from "@/lib/platform/flags";
import { isStaffRequest } from "@/lib/auth/raw";
import "@/styles/shop.css";

export const dynamic = "force-dynamic";

const SITE = "https://www.gameshuffle.co";
const PAGE_BG = "color-mix(in srgb, var(--text-primary) 4%, var(--surface-default))";

async function load(slug: string, staff: boolean) {
  try {
    return await getMerchListing(slug, { preview: staff });
  } catch (err) {
    if (!(err instanceof MerchNotReady)) throw err;
    // Dev server before merch-m1.sql: straight from Printful.
    const dev = staff ? await devPreviewFromPrintful().catch(() => null) : null;
    return dev?.listings.find((l) => l.slug === slug) ?? null;
  }
}

/** Every live listing: the rest of a series and "Pair it with" come from these. */
async function liveListings(): Promise<MerchListing[]> {
  try { return await listMerchListings(); } catch (err) {
    if (!(err instanceof MerchNotReady)) throw err;
    return [];
  }
}

export async function generateMetadata({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ preview?: string }> }): Promise<Metadata> {
  const [{ slug }, { preview }] = await Promise.all([params, searchParams]);
  const [open, staff] = await Promise.all([getPlatformFlag("shop_open", false), isStaffRequest()]);
  const listing = await load(slug, staff && preview === "1");
  if (!listing) return { title: "Merch", robots: { index: false, follow: true } };
  const image = listing.colors[0]?.image ?? listing.variants[0]?.image ?? null;
  const description = [listing.description, listing.facts[0]].filter(Boolean).join(" ") || `${listing.name} from GameShuffle, made when you order.`;
  return {
    title: listing.name,
    description: description.slice(0, 160),
    alternates: { canonical: `${SITE}/shop/${listing.slug}` },
    ...(open && listing.live ? {} : { robots: { index: false, follow: true } }),
    openGraph: { title: `${listing.name} | GameShuffle`, description: description.slice(0, 200), url: `${SITE}/shop/${listing.slug}`, siteName: "GameShuffle", type: "website", ...(image ? { images: [{ url: image }] } : {}) },
    twitter: { card: "summary_large_image", ...(image ? { images: [image] } : {}) },
  };
}

export default async function MerchProductPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ view?: string; preview?: string }> }) {
  const [{ slug }, { view, preview }] = await Promise.all([params, searchParams]);
  const [open, comingSoon, staff] = await Promise.all([getPlatformFlag("shop_open", false), getPlatformFlag("shop_coming_soon", false), isStaffRequest()]);
  if (!open && !comingSoon && !staff) notFound();
  const soon = !open && (!staff || view === "soon");
  // A product that isn't live opens only as a staff preview from Admin ▸ Shop ▸ Merch (?preview=1); without it, page
  // not found for everyone, staff too (2026-11-08: a product sitting in the shop marked "Not live" read as broken).
  const previewing = staff && preview === "1";
  const listing = await load(slug, previewing);
  if (!listing) notFound();
  let products: ShopProduct[] = [];
  try { products = await listShopProducts({ onlyOnSale: true }); } catch { /* the cart just won't know other lines */ }
  if (!products.some((p) => p.listingId === listing.id)) {
    const dev = await devPreviewFromPrintful().catch(() => null);
    if (dev) products = [...products, ...dev.products];
  }
  const copy = merchCopy();
  const collection = collectionOf(listing.collection);
  const live = await liveListings();
  const siblings = listing.series ? live.filter((l) => l.series === listing.series && l.id !== listing.id) : [];
  // Pair it with: other kinds of product, leaving out the series already shown below.
  const pairs = pairsFor(listing, live.filter((l) => !siblings.includes(l)));

  const jsonLd = open && listing.live ? {
    "@context": "https://schema.org",
    "@type": "Product",
    name: listing.name,
    image: listing.colors.map((c) => c.image).filter(Boolean).slice(0, 6),
    description: [listing.description, ...listing.facts].filter(Boolean).join(" "),
    brand: { "@type": "Brand", name: "GameShuffle" },
    offers: {
      "@type": "AggregateOffer", priceCurrency: "USD",
      lowPrice: (Math.min(...listing.variants.map((v) => v.priceCents)) / 100).toFixed(2),
      highPrice: (Math.max(...listing.variants.map((v) => v.priceCents)) / 100).toFixed(2),
      offerCount: listing.variants.length, availability: "https://schema.org/InStock", url: `${SITE}/shop/${listing.slug}`,
    },
  } : null;

  return (
    <main className="shop-page merch-page" style={{ background: PAGE_BG }}>
      <Container>
        <div className="merch-page__head">
          <Breadcrumb items={[{ label: copy.backToShop, href: "/shop" }, { label: listing.name }]} />
          <p className="merch-page__eyebrow">{listing.series ?? collection.name}</p>
          <h1 className="merch-page__title">{listing.name}</h1>
        </div>
        <MerchProduct listing={listing} products={cartSeed(products, listing.id)} pairs={pairs} preview={previewing} soon={soon} />
        {siblings.length > 0 && (
          <section className="shop-section merch-related" aria-labelledby="merch-related">
            <h2 id="merch-related" className="shop-h2">{copy.moreFrom(listing.series!)}</h2>
            <div className="merch-grid">{siblings.map((l) => <MerchCard key={l.id} listing={l} soon={soon} />)}</div>
          </section>
        )}
      </Container>
      {jsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />}
    </main>
  );
}
