"use client";

/**
 * A merch product card (the shop's grid, a product page's "more from"): the picture, up to four color dots that
 * swap it, the name and the price. It opens the product page. Coming soon: no price. The shop's shelf is MerchShop.
 * Under a section heading (`inSection`) the card names only the design ("Run it back.") and says the item when it
 * isn't the section's plain one ("Crop top"); screen readers still hear the whole name.
 */

import { useState } from "react";
import Link from "next/link";
import { Chip } from "@empac/cascadeds";
import { formatPrice, merchCopy } from "@/lib/store/copy";
import { familyOf } from "@/lib/store/merchColors";
import { cardName } from "@/lib/store/merchFilters";
import type { MerchListing } from "@/lib/store/merchCatalog";

const DOTS = 4;

/** The color dots on a card: the first four, with the picked color swapped in for the fourth when it's further down. */
function dotColors<T>(colors: T[], picked: number): { c: T; i: number }[] {
  const out = colors.slice(0, DOTS).map((c, i) => ({ c, i }));
  if (picked >= DOTS && out.length === DOTS) out[DOTS - 1] = { c: colors[picked], i: picked };
  return out;
}

/** One product. `family` starts it on its first shade of that color family (the shop's Color filter). */
export function MerchCard({ listing, soon, family = null, inSection = false }: { listing: MerchListing; soon: boolean; family?: string | null; inSection?: boolean }) {
  const copy = merchCopy();
  const [ci, setCi] = useState(() => Math.max(0, family ? listing.colors.findIndex((c) => familyOf(c.name, c.hex) === family) : 0));
  const named = inSection ? cardName(listing) : null;
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
          {dotColors(listing.colors, ci).map(({ c, i }) => (
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
      <h3 className="merch-card__name">
        {named?.item ? <Link href={href}>{named.design}<span className="sr-only"> {named.item}</span></Link> : <Link href={href}>{listing.name}</Link>}
      </h3>
      {named?.style && <p className="merch-card__style" aria-hidden="true">{named.style}</p>}
      <p className="merch-card__price">
        {!soon && <span>{listing.priceVaries ? copy.from(listing.fromCents) : formatPrice(listing.fromCents)}</span>}
        {sub && <span className="merch-card__sub">{sub}</span>}
      </p>
    </article>
  );
}
