/**
 * Every word a buyer sees in the shop, verbatim from docs/specs/shop/shop-copy.md
 * (Britton's copy). Dates come from the config so they live in one place.
 * Client-safe. Lines marked NEW aren't in the copy doc yet; CHANGED lines follow
 * Britton's 2026-10-09 shipping rule (every order tracked by USPS Ground
 * Advantage, $4.99 under $25, free from $25), which replaced "free shipping
 * on everything" and untracked single packs. Britton to confirm both.
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

/** TCGplayer's public card condition guide (Near Mint, Lightly Played...), the standard our cards follow. */
export const TCG_CONDITION_GUIDE_URL = "https://help.tcgplayer.com/hc/en-us/articles/221430307-Card-Conditioning-Overview";

export function shopCopy(config: ShopConfig = SHOP) {
  const cutoff = shopDate(config.holiday.cutoff_lower48, { weekday: true });
  const cutoffAkHi = shopDate(config.holiday.cutoff_ak_hi, { weekday: true });
  const support = config.contact.support_email;
  const rate = config.shipping.rate;
  const threshold = formatPrice(rate.free_threshold_cents).replace(/\.00$/, "");
  const standard = formatPrice(rate.standard_cents);
  return {
    nav: "Shop",
    hero: {
      eyebrow: "HOLIDAY DROP",
      title: "Packs for game night, gifts and stockings",
      lead: `Real Pokémon TCG cards, sorted and packed by hand by the GameShuffle team. Free shipping on orders of ${threshold} or more. When a pack sells out, it's gone.`, // CHANGED
    },
    sections: {
      bundles: "Bundles",
      singles: "Single packs",
      singlesLine: "Add one to any order, or buy them on their own.",
    },
    card: {
      price: (cents: number) => formatPrice(cents),
      addToCart: "Add to cart", // Britton, 2026-10-09
      viewDetails: "View details", // Britton, 2026-10-09
      buy: "Buy now",
      soldOut: "Sold out",
      lowStock: (n: number) => `Only ${n} left`,
      imageAlt: (name: string) => `${name} pack, sealed, shown from the front`,
    },
    shipping: {
      heading: "Shipping",
      lines: [ // CHANGED
        "Ships from Washington State within 2 business days.",
        "Every order ships tracked by USPS Ground Advantage, to all 50 states and DC.",
        `Free shipping on orders of ${threshold} or more. Orders under ${threshold} ship for ${standard}.`,
      ],
      christmas: `Order by ${cutoff} for Christmas delivery. Alaska and Hawaii: order by ${cutoffAkHi}.`,
      policiesLink: "Shipping, returns and card condition",
    },
    details: { // NEW
      inside: "What's inside",
      shipsHeading: "How it ships",
      ships: `Ships tracked by USPS Ground Advantage within 2 business days. Free shipping on orders of ${threshold} or more; ${standard} under ${threshold}.`, // CHANGED
      quantity: "Quantity",
      finalSaleHeading: "Final sale", // NEW
      finalSale: "Pokémon card products are final sale. We can't take returns because of which cards are in the pack. If it arrives damaged or is missing something this listing guarantees, you choose a replacement or a refund.", // NEW (Britton, 2026-10-09: options for damage, no gatekeeping)
      conditionHeading: "Card condition", // NEW
      // NEW (Britton, 2026-10-09): Near Mint aim, Lightly Played possible, linked to TCGplayer's guide.
      condition: { before: "We aim to send every card in Near Mint condition. Some may arrive Lightly Played, as ", link: "TCGplayer's card condition guidelines", after: " describe it.", href: TCG_CONDITION_GUIDE_URL },
    },
    cart: { // NEW
      open: (n: number) => (n > 0 ? `Cart (${n})` : "Cart"),
      title: "Your cart",
      empty: "Your cart is empty.",
      emptyAction: "Keep shopping",
      added: (name: string) => `Added ${name} to your cart`,
      subtotal: "Subtotal",
      shipping: "Shipping",
      shippingValue: (cents: number) => (cents === 0 ? "Free" : formatPrice(cents)),
      toFree: (cents: number) => `Add ${formatPrice(cents)} more for free shipping.`,
      freeReached: "Your order ships free.",
      suggest: "Add a single pack",
      suggestAdd: (name: string) => `Add ${name}`,
      add: "Add",
      tax: "Sales tax for Washington addresses is added at checkout.",
      checkout: "Check out",
      checkoutNote: "Ships from Washington State within 2 business days, tracked by USPS Ground Advantage. Pokémon card products are final sale.", // CHANGED (Stripe custom text)
      finalSale: "Pokémon card products are final sale.", // NEW
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
    soon: { // NEW (Britton, 2026-10-09: everything Coming soon until launch, with an email signup)
      eyebrow: "COMING SOON",
      lead: "Real Pokémon TCG cards, sorted and packed by hand by the GameShuffle team. The packs and sets aren't on sale yet. Get an email the day they go live.",
      badge: "Coming soon",
      notify: "Notify me",
      panelTitle: "Get an email when the packs go live",
      panelBody: "We'll email you when the packs and sets go on sale. Unsubscribe anytime.",
      emailLabel: "Email address",
      signedInButton: "Email me when they go live",
      joined: "You're on the list. We'll email you when the packs go live.",
      later: "Check back soon. The packs and sets are on their way.",
      badEmail: "Check that email address and try again.",
      failed: "Couldn't add you just now. Try again.",
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
