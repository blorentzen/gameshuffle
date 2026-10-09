"use client";

/** The shop's products in two sections (bundles, then single packs) under the cart. Coming soon: no cart, no prices. */

import { shopCopy } from "@/lib/store/copy";
import type { ShopProduct } from "@/lib/store/products";
import { CartButton, ShopCartProvider } from "./ShopCart";
import { ShopProductCard } from "./ShopProductCard";

export function ShopShelf({ products, soon = false, notify = false }: { products: ShopProduct[]; soon?: boolean; notify?: boolean }) {
  const copy = shopCopy();
  const bundles = products.filter((p) => p.kind === "bundle");
  const singles = products.filter((p) => p.kind === "single");
  return (
    <ShopCartProvider products={products}>
      {!soon && <CartButton />}
      {bundles.length > 0 && (
        <section className="shop-section" aria-labelledby="shop-bundles">
          <h2 id="shop-bundles" className="shop-h2">{copy.sections.bundles}</h2>
          <div className="shop-grid">{bundles.map((p) => <ShopProductCard key={p.sku} product={p} soon={soon} notify={notify} />)}</div>
        </section>
      )}
      {singles.length > 0 && (
        <section className="shop-section" aria-labelledby="shop-singles">
          <h2 id="shop-singles" className="shop-h2">{copy.sections.singles}</h2>
          {!soon && <p className="shop-section__line">{copy.sections.singlesLine}</p>}
          <div className="shop-grid">{singles.map((p) => <ShopProductCard key={p.sku} product={p} soon={soon} notify={notify} />)}</div>
        </section>
      )}
    </ShopCartProvider>
  );
}
