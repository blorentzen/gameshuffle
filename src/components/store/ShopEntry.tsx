/**
 * The ways into the shop from around the site (build G). Server components;
 * each page renders them only while visitors can see the shop
 * (`shopVisibleToVisitors`), and every link carries its placement tag.
 *
 * Since 2026-11-03 the shop sells merch: the homepage gets MerchRow (pick 13:
 * a row where the card-store link sits), and the card-pack lines on the TCG
 * pages, game nights and checklists render nothing while packs are on hold.
 */

import Link from "next/link";
import { CTABanner, CarouselItem } from "@empac/cascadeds";
import { IconArrowRight } from "@tabler/icons-react";
import { formatPrice, merchCopy, shopCopy } from "@/lib/store/copy";
import { shopHref, type ShopPlacement } from "@/lib/store/links";
import { listMerchListings } from "@/lib/store/merchCatalog";
import { PACKS_ON_HOLD } from "@/lib/store/config";
import { getPlatformFlag } from "@/lib/platform/flags";
import { EVENTS, tagged } from "@/lib/analytics/events";
import { ArrowLink } from "@/components/ui/ArrowLink";
import { LabeledCarousel } from "@/components/ui/LabeledCarousel";

/**
 * The homepage's merch row: up to four live products and a link to the shop. A game space (round two picks 8A) shows
 * the same row under its own heading, with the designs about its game first (`prefer`, matched on the name).
 */
export async function MerchRow({ from = "home-band", prefer, heading, line, className, preview = false }: {
  from?: ShopPlacement;
  /** Staff: designs that aren't live yet too (a staff-only space shows what's coming). */
  preview?: boolean;
  prefer?: RegExp;
  heading?: string;
  line?: string;
  className?: string;
} = {}) {
  const [all, open] = await Promise.all([listMerchListings({ preview }).catch(() => []), getPlatformFlag("shop_open", false)]);
  const listings = prefer ? [...all.filter((l) => prefer.test(l.name)), ...all.filter((l) => !prefer.test(l.name))] : all;
  if (!listings.length) return null;
  const c = shopCopy().entry.band;
  const m = merchCopy();
  const titleId = `merch-row-title-${from}`;
  return (
    <section className={`merch-row${className ? ` ${className}` : ""}`} aria-labelledby={titleId}>
      <div className="merch-row__head">
        <h2 id={titleId} className="merch-row__title">{heading ?? c.heading}</h2>
        <p className="merch-row__line">{line ?? c.body}</p>
      </div>
      <ul className="merch-row__list">
        {listings.slice(0, 4).map((l) => {
          const image = l.colors[0]?.image ?? l.variants[0]?.image ?? null;
          return (
            <li key={l.id} className="merch-row__item">
              <Link href={`/shop/${l.slug}`} className={`merch-row__link ${tagged(EVENTS.shopLinkClicked, { from })}`}>
                {/* eslint-disable-next-line @next/next/no-img-element -- Printful's mockups are plain files */}
                {image && <img src={image} alt="" loading="lazy" width={320} height={320} />}
                <span className="merch-row__name">{l.name}</span>
                {open && <span className="merch-row__price">{l.priceVaries ? m.from(l.fromCents) : formatPrice(l.fromCents)}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
      <ArrowLink href={shopHref(from)} className={tagged(EVENTS.shopLinkClicked, { from })}>{c.button}</ArrowLink>
    </section>
  );
}

/**
 * A game space's merch shelf (merch pass, 2026-11-06; Britton: four items crammed in a tile didn't look good, pull it
 * back and use a carousel). Its own row at the foot of the space's Now tab, flat on the page and as wide as the page:
 * the heading and Shop merch on one line, then a carousel of up to eight pieces, that game's designs first, four at a
 * time on desktop and two on phones, ending on a "Shop all merch" tile like the card store's.
 */
export async function MerchShelf({ from = "space", prefer, heading = "Wear it", line, className, preview = false }: {
  from?: ShopPlacement;
  prefer?: RegExp;
  heading?: string;
  line?: string;
  className?: string;
  preview?: boolean;
}) {
  const [all, open] = await Promise.all([listMerchListings({ preview }).catch(() => []), getPlatformFlag("shop_open", false)]);
  const listings = (prefer ? [...all.filter((l) => prefer.test(l.name)), ...all.filter((l) => !prefer.test(l.name))] : all).slice(0, 8);
  if (!listings.length) return null;
  const m = merchCopy();
  const shop = shopHref(from);
  const titleId = `merch-shelf-${from}`;
  return (
    <section className={`merch-shelf${className ? ` ${className}` : ""}`} aria-labelledby={titleId}>
      <div className="merch-shelf__head">
        <div className="merch-shelf__words">
          <h2 id={titleId} className="merch-shelf__title">{heading}</h2>
          {line && <p className="merch-shelf__line">{line}</p>}
        </div>
        <ArrowLink href={shop} className={`merch-shelf__all ${tagged(EVENTS.shopLinkClicked, { from })}`}>Shop merch</ArrowLink>
      </div>
      <LabeledCarousel label={`${heading}: GameShuffle merch`} slidesToShow={{ mobile: 2, tablet: 3, desktop: 4 }} gap={16} showArrows showDots arrowPosition="bottom">
        {[
          ...listings.map((l) => {
            const image = l.colors[0]?.image ?? l.variants[0]?.image ?? null;
            const meta = [l.colors.length > 1 ? `${l.colors.length} colors` : null, open ? (l.priceVaries ? m.from(l.fromCents) : formatPrice(l.fromCents)) : null].filter(Boolean).join(" · ");
            return (
              <CarouselItem key={l.id}>
                <Link href={`/shop/${l.slug}`} className={`merch-shelf__item ${tagged(EVENTS.shopLinkClicked, { from })}`}>
                  <span className="merch-shelf__pic">
                    {/* eslint-disable-next-line @next/next/no-img-element -- Printful's mockups are plain files */}
                    {image && <img src={image} alt="" loading="lazy" width={400} height={400} />}
                  </span>
                  <span className="merch-shelf__name">{l.name}</span>
                  {meta && <span className="merch-shelf__meta">{meta}</span>}
                </Link>
              </CarouselItem>
            );
          }),
          <CarouselItem key="all">
            <Link href={shop} className={`merch-shelf__browse ${tagged(EVENTS.shopLinkClicked, { from })}`}>
              <IconArrowRight size={28} stroke={2} aria-hidden="true" />
              <span className="merch-shelf__name">Shop all merch</span>
              <span className="merch-shelf__meta">Tees, hoodies, hats and more</span>
            </Link>
          </CarouselItem>,
        ]}
      </LabeledCarousel>
    </section>
  );
}

/** The card packs' homepage band (packs on hold; kept for when they're back). */
export function ShopBand() {
  const c = shopCopy().entry.band;
  return (
    <section className="shop-band" aria-label="The GameShuffle shop">
      <p className="shop-band__eyebrow">{c.eyebrow}</p>
      <CTABanner
        variant="gradient"
        size="small"
        align="left"
        headline={c.heading}
        description={c.body}
        actions={[{ label: c.button, href: shopHref("home-band"), variant: "secondary" }]}
      />
    </section>
  );
}

/** One line pointing at the shop: the TCG pages ("tcg") or game nights ("game-nights"). */
export function ShopLine({ placement }: { placement: Extract<ShopPlacement, "tcg" | "game-nights"> }) {
  // Card packs are on hold (2026-11-03): these lines sold packs, so they stay quiet.
  if (PACKS_ON_HOLD) return null;
  const entry = shopCopy().entry;
  const c = placement === "tcg" ? entry.tcg : entry.gameNights;
  return (
    <p className="shop-line">
      {c.line}{" "}
      <Link href={shopHref(placement)} className={tagged(EVENTS.shopLinkClicked, { from: placement })}>
        {c.link}
      </Link>
    </p>
  );
}

/** A checklist's own line: which GameShuffle packs carry its cards. */
export function ShopChecklistLine({ text }: { text: string }) {
  if (PACKS_ON_HOLD) return null;
  return (
    <p className="shop-line">
      {text}{" "}
      <Link href={shopHref("checklist")} className={tagged(EVENTS.shopLinkClicked, { from: "checklist" })}>
        See the packs
      </Link>
    </p>
  );
}
