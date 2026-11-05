"use client";

/**
 * /shop's merch shelf (picks 4 and 5): item chips on top (All, Tees,
 * Hoodies…) and the collections as sections, with each series of two or more
 * (Eat. Sleep.…) as its own section after its collection (shelfSections); a
 * chip turns the shelf into one grid of that item. Each card opens its product page; its color dots swap the
 * card's picture. Coming soon: no prices or cart.
 */

import { useState } from "react";
import Link from "next/link";
import { Badge, Chip } from "@empac/cascadeds";
import { ITEM_TYPES, shelfSections } from "@/lib/store/merch";
import { formatPrice, merchCopy } from "@/lib/store/copy";
import type { MerchListing } from "@/lib/store/merchCatalog";
import type { ShopProduct } from "@/lib/store/products";
import { CartButton, ShopCartProvider } from "./ShopCart";

const DOTS = 4;

export function MerchShelf({ listings, products, soon = false, preview = false }: { listings: MerchListing[]; products: ShopProduct[]; soon?: boolean; preview?: boolean }) {
  const copy = merchCopy();
  const [item, setItem] = useState<string>("All");
  const types = ITEM_TYPES.filter((t) => listings.some((l) => l.itemType === t));
  const shown = item === "All" ? listings : listings.filter((l) => l.itemType === item);

  return (
    <ShopCartProvider products={products}>
      {!soon && <CartButton />}
      {types.length > 1 && (
        <div className="merch-chips" role="group" aria-label={copy.chipsLabel}>
          {["All", ...types].map((t) => (
            <Chip key={t} label={t} clickable selected={item === t} onClick={() => setItem(t)} variant={item === t ? "primary" : "default"} />
          ))}
        </div>
      )}
      {item === "All" ? (
        shelfSections(shown).map((sec) => (
          <section key={sec.id} className="shop-section merch-collection" aria-labelledby={`merch-${sec.id}`}>
            <div className="merch-collection__head">
              <h2 id={`merch-${sec.id}`} className="shop-h2">{sec.name}</h2>
              {sec.line && <p className="shop-section__line">{sec.line}</p>}
            </div>
            <div className="merch-grid">{sec.listings.map((l) => <MerchCard key={l.id} listing={l} soon={soon} preview={preview} />)}</div>
          </section>
        ))
      ) : (
        <section className="shop-section merch-collection" aria-labelledby="merch-item">
          <h2 id="merch-item" className="shop-h2">{item}</h2>
          <div className="merch-grid">{shown.map((l) => <MerchCard key={l.id} listing={l} soon={soon} preview={preview} />)}</div>
        </section>
      )}
    </ShopCartProvider>
  );
}

export function MerchCard({ listing, soon, preview }: { listing: MerchListing; soon: boolean; preview: boolean }) {
  const copy = merchCopy();
  const [ci, setCi] = useState(0);
  const color = listing.colors[ci] ?? listing.colors[0];
  const phone = listing.optionLabel === "Phone";
  const image = (phone ? listing.variants[0]?.image : color?.image) ?? listing.photos[0]?.url ?? null;
  const href = `/shop/${listing.slug}`;
  const sub = phone ? copy.phones(listing.options.length) : listing.colors.length > 1 ? copy.colors(listing.colors.length) : null;
  return (
    <article className="merch-card">
      <Link href={href} className="merch-card__media" tabIndex={-1} aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element -- Printful's mockups and our own photos are plain files */}
        {image && <img src={image} alt="" loading="lazy" width={480} height={480} />}
      </Link>
      {/* The row stays (empty) without dots, so names line up across a row of cards. */}
      {phone || listing.colors.length < 2 ? <div className="merch-card__dots" aria-hidden="true" /> : (
        <div className="merch-card__dots" role="group" aria-label={`Colors for ${listing.name}`}>
          {listing.colors.slice(0, DOTS).map((c, i) => (
            <Chip
              key={c.name}
              size="small"
              clickable
              selected={i === ci}
              onClick={() => setCi(i)}
              aria-label={c.name}
              className="merch-swatch"
              icon={<span className="merch-dot" style={{ background: c.hex ?? "#ccc" }} aria-hidden="true" />}
            />
          ))}
          {listing.colors.length > DOTS && <span className="merch-card__more">+{listing.colors.length - DOTS}</span>}
        </div>
      )}
      <h3 className="merch-card__name"><Link href={href}>{listing.name}</Link></h3>
      <p className="merch-card__price">
        {!soon && <span>{listing.priceVaries ? copy.from(listing.fromCents) : formatPrice(listing.fromCents)}</span>}
        {sub && <span className="merch-card__sub">{sub}</span>}
      </p>
      {preview && !listing.live && <Badge variant="warning" size="small">Not live</Badge>}
    </article>
  );
}
