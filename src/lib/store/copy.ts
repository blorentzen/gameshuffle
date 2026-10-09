/**
 * Every word a buyer sees in the shop, verbatim from docs/specs/shop/shop-copy.md
 * (Britton's copy). Dates come from the config so they live in one place.
 * Client-safe. Lines marked NEW aren't in the copy doc yet (the singles path,
 * decided 2026-10-08, and the closed-shop state); Britton to confirm.
 */

import { SHOP, type ShopConfig } from "./config";

/** "Sunday, Dec 13" in Pacific time, the copy's date style. */
export function shopDate(iso: string, opts: { weekday?: boolean } = {}): string {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: SHOP.shipping.timezone, month: "short", day: "numeric", ...(opts.weekday ? { weekday: "long" } : {}),
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return opts.weekday ? `${get("weekday")}, ${get("month")} ${get("day")}` : `${get("month")} ${get("day")}`;
}

export const formatPrice = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export function shopCopy(config: ShopConfig = SHOP) {
  const cutoff = shopDate(config.holiday.cutoff_lower48, { weekday: true });
  const cutoffAkHi = shopDate(config.holiday.cutoff_ak_hi, { weekday: true });
  const support = config.contact.support_email;
  return {
    nav: "Shop",
    hero: {
      eyebrow: "HOLIDAY DROP",
      title: "Packs for game night, gifts and stockings",
      lead: "Real Pokémon TCG cards, sorted and packed by hand by the GameShuffle team. Free shipping anywhere in the US. When a pack sells out, it's gone.",
    },
    sections: {
      bundles: "Bundles",
      singles: "Single packs",
      singlesLine: "Add one to any order, or buy them on their own.",
    },
    card: {
      priceLine: (cents: number) => `${formatPrice(cents)} · Free shipping`,
      price: (cents: number) => formatPrice(cents),
      freeShipping: "Free shipping",
      addToCart: "Add to cart", // Britton, 2026-10-09
      viewDetails: "View details", // Britton, 2026-10-09
      buy: "Buy now",
      soldOut: "Sold out",
      lowStock: (n: number) => `Only ${n} left`,
      imageAlt: (name: string) => `${name} pack, sealed, shown from the front`,
    },
    shipping: {
      heading: "Shipping",
      lines: [
        "Ships from Washington State within 2 business days.",
        "Free shipping to all 50 states and DC.",
        "Bundles ship tracked by USPS Ground Advantage. Single packs ship by First-Class Mail without tracking.",
      ],
      christmas: `Order by ${cutoff} for Christmas delivery. Alaska and Hawaii: order by ${cutoffAkHi}.`,
      policiesLink: "Shipping, returns and card condition",
    },
    details: { // NEW
      inside: "What's inside",
      shipsHeading: "How it ships",
      shipsParcel: "Ships free and tracked by USPS Ground Advantage within 2 business days.",
      shipsSingle: "Ships free by First-Class Mail within 2 business days. 5 or more single packs ship tracked.",
      quantity: "Quantity",
    },
    cart: { // NEW
      open: (n: number) => (n > 0 ? `Cart (${n})` : "Cart"),
      title: "Your cart",
      empty: "Your cart is empty.",
      emptyAction: "Keep shopping",
      added: (name: string) => `Added ${name} to your cart`,
      subtotal: "Subtotal",
      shipping: "Shipping",
      shippingValue: "Free",
      tax: "Sales tax for Washington addresses is added at checkout.",
      checkout: "Check out",
      remove: "Remove",
      less: (name: string) => `One less ${name}`,
      more: (name: string) => `One more ${name}`,
      maxed: (n: number) => `${n} is the most per order`,
      leftOnly: (n: number) => `Only ${n} left`,
    },
    singlesPath: { // NEW (singles stay on TCGplayer)
      line: "Looking for single cards?",
      link: "Shop singles on TCGplayer",
    },
    closed: { // NEW
      title: "The shop is closed right now",
      body: "Check back soon for the next drop.",
    },
    disclaimer: "Real Pokémon TCG cards, packed by hand. GameShuffle is not affiliated with or endorsed by The Pokémon Company or Nintendo. No guaranteed value.",
    banner: {
      before: `Order by ${cutoff} for Christmas delivery. Alaska and Hawaii: ${cutoffAkHi}.`,
      after: "Orders placed now arrive after Christmas. Everything still ships within 2 business days.",
    },
    errors: {
      soldOut: "That pack just sold out. Pick another one, or check back after we restock.",
      notEnough: (n: number) => `We only have ${n} left. Lower the quantity to keep going.`,
      military: "We can't ship to APO, FPO or DPO addresses yet. Use a US street address in the 50 states or DC.",
      checkoutFailed: `Checkout didn't open. Try again, and if it still won't open, email ${support}.`,
      expired: "Your checkout timed out and the packs went back on the shelf. Start again whenever you're ready.",
      canceled: "No charge was made. Your packs are still here.",
    },
    support,
  };
}
