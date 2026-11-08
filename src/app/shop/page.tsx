/**
 * /shop: GameShuffle merch (since 2026-11-03; the card packs are on hold), made
 * in Printful and arranged in Platform ▸ Shop ▸ Merch. Collections as
 * sections with item chips on top (MerchShelf), each product on its own page
 * (/shop/[slug]). Marketing page, always light. Copy: src/lib/store/copy.ts.
 *
 * While the shop is hidden (`shop_open` and `shop_coming_soon` both off),
 * visitors get page not found. With `shop_coming_soon` on they get the Coming soon
 * version: the live products without prices or a cart, and an email signup
 * for launch. Staff get the full shop to test, including products that aren't
 * live yet, and `?view=soon` shows them the Coming soon version. Not indexed
 * until it opens.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { Alert, Container } from "@empac/cascadeds";
import { MarketingHeroField } from "@/components/marketing/MarketingHeroField";
import { MarketingHeroCurve } from "@/components/marketing/MarketingHeroCurve";
import { MerchShelf } from "@/components/store/MerchShelf";
import { ShopUpdates } from "@/components/store/ShopUpdates";
import { shopUpdatesConfigured } from "@/lib/store/updates";
import { createClient } from "@/lib/supabase/server";
import { listShopProducts, ShopNotReady, type ShopProduct } from "@/lib/store/products";
import { devPreviewFromPrintful, listMerchListings, type MerchListing } from "@/lib/store/merchCatalog";
import { MerchNotReady } from "@/lib/store/merchSync";
import { shopCopy } from "@/lib/store/copy";
import { holidayState } from "@/lib/store/rules";
import { getPlatformFlag } from "@/lib/platform/flags";
import { isStaffRequest } from "@/lib/auth/raw";
import { notFound } from "next/navigation";
import { TCG_SHOP_URL } from "@/data/shop";
import "@/styles/shop.css";

export const dynamic = "force-dynamic";

const copy = shopCopy();

export async function generateMetadata(): Promise<Metadata> {
  const open = await getPlatformFlag("shop_open", false);
  return {
    title: "GameShuffle merch",
    description: open ? copy.hero.lead : copy.soon.lead,
    alternates: { canonical: "https://www.gameshuffle.co/shop" },
    ...(open ? {} : { robots: { index: false, follow: true } }),
  };
}

const PAGE_BG = "color-mix(in srgb, var(--text-primary) 4%, var(--surface-default))";

export default async function ShopPage({ searchParams }: { searchParams: Promise<{ checkout?: string; view?: string }> }) {
  const { checkout, view } = await searchParams;
  const [open, comingSoon, staff] = await Promise.all([getPlatformFlag("shop_open", false), getPlatformFlag("shop_coming_soon", false), isStaffRequest()]);
  // Hidden while products are worked out: visitors get page not found until a switch says otherwise.
  if (!open && !comingSoon && !staff) notFound();
  const soon = !open && (!staff || view === "soon");

  // Every product on sale, so cart lines from other product pages still resolve here.
  let products: ShopProduct[] = [];
  let listings: MerchListing[] = [];
  let notReady = false;
  try {
    [products, listings] = await Promise.all([listShopProducts({ onlyOnSale: true }), listMerchListings({ preview: staff && !soon })]);
  } catch (err) {
    if (err instanceof ShopNotReady || err instanceof MerchNotReady) notReady = true;
    else throw err;
  }
  // Dev server before merch-m1.sql: the shelf straight from Printful, to check the pages.
  let devPreview = false;
  if (notReady && staff) {
    const dev = await devPreviewFromPrintful().catch(() => null);
    if (dev) { listings = dev.listings; products = dev.products; devPreview = true; }
  }
  const holiday = soon ? "none" : holidayState();
  let signedIn = false;
  if (soon) {
    const supabase = await createClient();
    signedIn = !!(await supabase.auth.getUser()).data.user;
  }
  const notify = soon && shopUpdatesConfigured();

  return (
    <main className="shop-page" style={{ background: PAGE_BG }}>
      <section className="marketing-hero">
        <MarketingHeroField category="merch" />
        <Container>
          <p className="marketing-eyebrow">{soon ? copy.soon.eyebrow : copy.hero.eyebrow}</p>
          <h1 className="marketing-hero__title">{copy.hero.title}</h1>
          <p className="marketing-hero__sub">{soon ? copy.soon.lead : copy.hero.lead}</p>
        </Container>
        <MarketingHeroCurve color={PAGE_BG} />
      </section>

      <Container>
        <div className="shop-page__body">
          {staff && !open && !soon && (
            <Alert variant="info" title="Staff preview">
              {comingSoon ? "Visitors see the Coming soon page" : "The shop is hidden: visitors get page not found"} until the shop opens (Platform ▸ Switches). <Link href="/shop?view=soon">See the Coming soon page</Link>
            </Alert>
          )}
          {staff && soon && (
            <Alert variant="info" title="What visitors see">
              This is the Coming soon page visitors get until the shop opens. <Link href="/shop">Back to the full shop</Link>
            </Alert>
          )}
          {staff && notReady && <Alert variant="warning" title="Not set up yet">Run supabase/merch-m1.sql, then press Sync from Printful in Platform ▸ Shop ▸ Merch.{devPreview ? " Dev server: showing every Printful product straight from Printful." : ""}</Alert>}
          {staff && !notReady && listings.length === 0 && <Alert variant="info" title="No products yet">Press Sync from Printful in <Link href="/admin/shop?tab=merch">Platform ▸ Shop ▸ Merch</Link>, then put products live.</Alert>}
          {checkout === "canceled" && !soon && <Alert variant="info">{copy.errors.canceled}</Alert>}
          {soon && <ShopUpdates signedIn={signedIn} ready={notify} />}
          {holiday !== "none" && (
            <Alert variant={holiday === "before_cutoff" ? "info" : "warning"}>
              {holiday === "before_cutoff" ? copy.banner.before : copy.banner.after}
            </Alert>
          )}

          {listings.length === 0 ? (soon || staff ? null : (
            <section className="shop-section shop-closed">
              <h2 className="shop-h2">{copy.closed.title}</h2>
              <p>{copy.closed.body}</p>
            </section>
          )) : (
            <MerchShelf listings={listings} products={products} soon={soon} preview={staff && !soon} />
          )}

          {!soon && <section className="shop-section shop-shipping" aria-labelledby="shop-shipping">
            <h2 id="shop-shipping" className="shop-h2">{copy.shipping.heading}</h2>
            <ul>
              {copy.shipping.lines.map((l) => <li key={l}>{l}</li>)}
              {holiday === "before_cutoff" && <li>{copy.shipping.christmas}</li>}
            </ul>
            <p><Link href="/shop/policies">{copy.shipping.policiesLink}</Link></p>
          </section>}

          <p className="shop-singles-path">
            {copy.singlesPath.line}{" "}
            <a href={TCG_SHOP_URL} target="_blank" rel="noopener noreferrer">{copy.singlesPath.link}</a>
          </p>

        </div>
      </Container>
    </main>
  );
}
