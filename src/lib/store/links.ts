/**
 * Links into the shop from around the site (build G), each tagged with where
 * it was (utm_content), so an order shows which placement it came from. The
 * cart keeps the tags (sessionStorage) and Checkout puts them on the order.
 * Client-safe.
 */

import { SHOP } from "./config";

/** Where a shop link sits. Email and Discord build their own links with their own medium. */
export type ShopPlacement = "nav" | "home-band" | "tcg" | "game-nights" | "checklist";

export function shopHref(placement: ShopPlacement): string {
  const u = SHOP.utm;
  const q = new URLSearchParams({ utm_source: u.source, utm_medium: u.medium, utm_campaign: u.campaign, utm_content: placement });
  return `/shop?${q.toString()}`;
}
