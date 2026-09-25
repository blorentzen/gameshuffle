"use client";

/**
 * The event card. One component, every touchpoint.
 *
 * There were three treatments for the same object: the browse grid rendered a
 * full card with artwork, a price chip and badges, while "Nights that fit you"
 * and the "Also happening" cross-rail rendered a bare stack of text, and the
 * event page's "More from" rail was a third thing again. The same tournament
 * therefore looked like three different kinds of object depending on where you
 * met it, and the rails read as an afterthought next to the grid.
 *
 * Callers supply already-formatted display strings rather than a row shape, so
 * surfaces backed by different queries (BrowseEvent, MoreEvent) can share it
 * without one of them having to fake fields it does not have.
 */

import Link from "next/link";
import type { ReactNode } from "react";
import { formatEventPrice } from "@/lib/events/price";
import { EventHeaderArt, type ArtCategory } from "./EventHeaderArt";

export interface EventCardProps {
  href: string;
  title: string;
  /** Deterministic fallback art when there is no cover. Use the event id. */
  seed: string;
  cover?: string | null;
  /** Which generated art to draw when there is no cover image. */
  artCategory?: ArtCategory;
  /** Formatted date line. */
  when?: string | null;
  /** Secondary line: game, place, organizer — already joined. */
  meta?: string | null;
  /** Lowest ticket price in cents; null renders "Free". */
  priceFromCents?: number | null;
  /** Top-right of the artwork: "12 / 16 players", "3 games". */
  countLabel?: string | null;
  /** Renders as a live pill instead of the plain count. */
  isLive?: boolean;
  /** "Good match" flag on the artwork. */
  highlight?: string | null;
  /** Chips under the title. */
  badges?: ReactNode;
  /** Extra text appended to the date line (distance, "Online"). */
  whenSuffix?: ReactNode;
  /**
   * Discovery surfaces always state a price, free included, because "unstated"
   * is the one thing a viewer cannot interpret. My Stuff is a MANAGEMENT
   * surface — these are events you already host or attend — and it does not
   * load ticket tiers, so a chip there would read "Free" on a paid event.
   * Saying nothing beats saying something false.
   */
  showPrice?: boolean;
}

export function EventCard({
  href, title, seed, cover, artCategory, when, meta,
  priceFromCents, countLabel, isLive, highlight, badges, whenSuffix, showPrice = true,
}: EventCardProps) {
  const price = formatEventPrice(priceFromCents);

  return (
    <Link href={href} className="bgn-card">
      <span className={`bgn-card__hero${cover ? " bgn-card__hero--img" : ""}`}>
        {cover
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={cover} alt="" className="bgn-card__hero-photo" loading="lazy" />
          : <EventHeaderArt category={artCategory ?? "board"} seed={seed} motion="hover" />}
        {isLive
          ? <span className="bgn-card__hero-count events-browser__live">Live now</span>
          : countLabel && <span className="bgn-card__hero-count">{countLabel}</span>}
        {/* Always stated, free included: a card with no price chip reads as
            "unstated" rather than "free". */}
        {showPrice && (
          <span className={`bgn-card__hero-price${price.isFree ? " bgn-card__hero-price--free" : ""}`}>{price.label}</span>
        )}
        {highlight && <span className="bgn-card__hero-match">{highlight}</span>}
      </span>
      <span className="bgn-card__body">
        {(when || whenSuffix) && (
          <span className="bgn-card__when">{when}{whenSuffix}</span>
        )}
        <span className="bgn-card__title">{title}</span>
        {meta && <span className="bgn-card__place">{meta}</span>}
        {badges && <span className="bgn-card__tags">{badges}</span>}
      </span>
    </Link>
  );
}
