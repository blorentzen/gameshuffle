/**
 * /shop: the GameShuffle Shop, curated packs and themes (singles stay on
 * TCGplayer, linked at the bottom). Marketing page, always light. Stock is
 * read live on every request. Copy: src/lib/store/copy.ts. Hidden from the
 * public until the `shop_open` platform flag is on; staff always see it.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, Container } from "@empac/cascadeds";
import { MarketingHeroField } from "@/components/marketing/MarketingHeroField";
import { MarketingHeroCurve } from "@/components/marketing/MarketingHeroCurve";
import { ShopShelf } from "@/components/store/ShopShelf";
import { listShopProducts, ShopNotReady, type ShopProduct } from "@/lib/store/products";
import { shopCopy } from "@/lib/store/copy";
import { holidayState } from "@/lib/store/rules";
import { SHOP, isOnSale } from "@/lib/store/config";
import { getPlatformFlag } from "@/lib/platform/flags";
import { isStaffRequest } from "@/lib/auth/raw";
import { TCG_SHOP_URL } from "@/data/shop";
import "@/styles/shop.css";

export const dynamic = "force-dynamic";

const copy = shopCopy();

export const metadata: Metadata = {
  title: "Shop",
  description: copy.hero.lead,
  alternates: { canonical: "https://www.gameshuffle.co/shop" },
};

function previewFromSeed(): ShopProduct[] {
  return SHOP.products.filter((p) => isOnSale(p)).sort((a, b) => a.sort_order - b.sort_order).map((p) => ({
    sku: p.sku, kind: p.kind, category: p.category, name: p.name, blurb: p.blurb, description: p.stripe_description, contents: p.contents, priceCents: p.price_cents,
    stripePriceId: null, onSale: true, stock: 10, held: 0, available: 10, maxPerOrder: p.max_per_order, shipWeightOz: p.ship_weight_oz,
    imageUrl: p.image_url, sortOrder: p.sort_order,
  }));
}

const PAGE_BG = "color-mix(in srgb, var(--text-primary) 4%, var(--surface-default))";

export default async function ShopPage({ searchParams }: { searchParams: Promise<{ checkout?: string }> }) {
  const { checkout } = await searchParams;
  const [open, staff] = await Promise.all([getPlatformFlag("shop_open", false), isStaffRequest()]);
  if (!open && !staff) notFound();

  let products: ShopProduct[] = [];
  let notReady = false;
  try {
    products = await listShopProducts({ onlyOnSale: true });
  } catch (err) {
    if (err instanceof ShopNotReady) notReady = true;
    else throw err;
  }
  // Before the tables exist, staff see the layout from the seed file (10 in stock each).
  if (notReady && staff) products = previewFromSeed();
  const holiday = holidayState();

  return (
    <main className="shop-page" style={{ background: PAGE_BG }}>
      <section className="marketing-hero">
        <MarketingHeroField category="tcg" />
        <Container>
          <p className="marketing-eyebrow">{copy.hero.eyebrow}</p>
          <h1 className="marketing-hero__title">{copy.hero.title}</h1>
          <p className="marketing-hero__sub">{copy.hero.lead}</p>
        </Container>
        <MarketingHeroCurve color={PAGE_BG} />
      </section>

      <Container>
        <div className="shop-page__body">
          {staff && !open && (
            <Alert variant="info" title="Staff preview">
              The shop is closed to the public. Turn on the shop_open platform flag to open it.
            </Alert>
          )}
          {staff && notReady && <Alert variant="warning" title="Not set up yet">Showing the seed file with sample stock. Run supabase/shop-m1.sql, then scripts/seed-shop.ts.</Alert>}
          {checkout === "canceled" && <Alert variant="info">{copy.errors.canceled}</Alert>}
          {holiday !== "none" && (
            <Alert variant={holiday === "before_cutoff" ? "info" : "warning"}>
              {holiday === "before_cutoff" ? copy.banner.before : copy.banner.after}
            </Alert>
          )}

          {products.length === 0 ? (
            <section className="shop-section shop-closed">
              <h2 className="shop-h2">{copy.closed.title}</h2>
              <p>{copy.closed.body}</p>
            </section>
          ) : (
            <ShopShelf products={products} />
          )}

          <section className="shop-section shop-shipping" aria-labelledby="shop-shipping">
            <h2 id="shop-shipping" className="shop-h2">{copy.shipping.heading}</h2>
            <ul>
              {copy.shipping.lines.map((l) => <li key={l}>{l}</li>)}
              {holiday === "before_cutoff" && <li>{copy.shipping.christmas}</li>}
            </ul>
            <p><Link href="/shop/policies">{copy.shipping.policiesLink}</Link></p>
          </section>

          <p className="shop-singles-path">
            {copy.singlesPath.line}{" "}
            <a href={TCG_SHOP_URL} target="_blank" rel="noopener noreferrer">{copy.singlesPath.link}</a>
          </p>

          <p className="shop-disclaimer">{copy.disclaimer}</p>
        </div>
      </Container>
    </main>
  );
}
