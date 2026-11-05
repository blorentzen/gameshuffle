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
import { CTABanner } from "@empac/cascadeds";
import { formatPrice, merchCopy, shopCopy } from "@/lib/store/copy";
import { shopHref, type ShopPlacement } from "@/lib/store/links";
import { listMerchListings } from "@/lib/store/merchCatalog";
import { PACKS_ON_HOLD } from "@/lib/store/config";
import { getPlatformFlag } from "@/lib/platform/flags";
import { EVENTS, tagged } from "@/lib/analytics/events";
import { ArrowLink } from "@/components/ui/ArrowLink";

/** The homepage's merch row: up to four live products and a link to the shop. */
export async function MerchRow() {
  const [listings, open] = await Promise.all([listMerchListings().catch(() => []), getPlatformFlag("shop_open", false)]);
  if (!listings.length) return null;
  const c = shopCopy().entry.band;
  const m = merchCopy();
  return (
    <section className="merch-row" aria-labelledby="merch-row-title">
      <div className="merch-row__head">
        <h2 id="merch-row-title" className="merch-row__title">{c.heading}</h2>
        <p className="merch-row__line">{c.body}</p>
      </div>
      <ul className="merch-row__list">
        {listings.slice(0, 4).map((l) => {
          const image = l.colors[0]?.image ?? l.variants[0]?.image ?? null;
          return (
            <li key={l.id} className="merch-row__item">
              <Link href={`/shop/${l.slug}`} className={`merch-row__link ${tagged(EVENTS.shopLinkClicked, { from: "home-band" })}`}>
                {/* eslint-disable-next-line @next/next/no-img-element -- Printful's mockups are plain files */}
                {image && <img src={image} alt="" loading="lazy" width={320} height={320} />}
                <span className="merch-row__name">{l.name}</span>
                {open && <span className="merch-row__price">{l.priceVaries ? m.from(l.fromCents) : formatPrice(l.fromCents)}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
      <ArrowLink href={shopHref("home-band")} className={tagged(EVENTS.shopLinkClicked, { from: "home-band" })}>{c.button}</ArrowLink>
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
