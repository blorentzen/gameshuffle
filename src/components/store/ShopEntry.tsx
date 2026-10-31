/**
 * The ways into the shop from around the site (build G): the homepage band and
 * a one-line pointer for the TCG pages and game nights. Server components; each
 * page renders them only while visitors can see the shop
 * (`shopVisibleToVisitors`), and every link carries its placement tag.
 */

import Link from "next/link";
import { CTABanner } from "@empac/cascadeds";
import { shopCopy } from "@/lib/store/copy";
import { shopHref, type ShopPlacement } from "@/lib/store/links";
import { EVENTS, tagged } from "@/lib/analytics/events";

/** The homepage's holiday drop band. */
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
  return (
    <p className="shop-line">
      {text}{" "}
      <Link href={shopHref("checklist")} className={tagged(EVENTS.shopLinkClicked, { from: "checklist" })}>
        See the packs
      </Link>
    </p>
  );
}
