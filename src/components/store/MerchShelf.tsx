"use client";

/**
 * A merch product card (the shop's grid, a product page's "more from"): the picture, up to four color dots that
 * swap it, the name and the price. It opens the product page. Coming soon: no price. The shop's shelf is MerchShop.
 */

import { useState } from "react";
import Link from "next/link";
import { Chip } from "@empac/cascadeds";
import { formatPrice, merchCopy } from "@/lib/store/copy";
import type { MerchListing } from "@/lib/store/merchCatalog";

const DOTS = 4;

/** The color dots on a card: the first four, with the picked color swapped in for the fourth when it's further down. */
function dotColors<T>(colors: T[], picked: number): { c: T; i: number }[] {
  const out = colors.slice(0, DOTS).map((c, i) => ({ c, i }));
  if (picked >= DOTS && out.length === DOTS) out[DOTS - 1] = { c: colors[picked], i: picked };
  return out;
}

/** One product. `color` starts it on that color (the shop's Color filter). */
export function MerchCard({ listing, soon, color: startColor = null }: { listing: MerchListing; soon: boolean; color?: string | null }) {
  const copy = merchCopy();
  const [ci, setCi] = useState(() => Math.max(0, startColor ? listing.colors.findIndex((c) => c.name === startColor) : 0));
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
      <h3 className="merch-card__name"><Link href={href}>{listing.name}</Link></h3>
      <p className="merch-card__price">
        {!soon && <span>{listing.priceVaries ? copy.from(listing.fromCents) : formatPrice(listing.fromCents)}</span>}
        {sub && <span className="merch-card__sub">{sub}</span>}
      </p>
    </article>
  );
}
