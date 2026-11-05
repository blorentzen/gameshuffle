/**
 * Every word a buyer sees in the shop. Written for card packs, verbatim from
 * docs/specs/shop/shop-copy.md (Britton's copy); since 2026-11-03 the shop sells
 * merch from Printful (packs on hold), so the hero, shipping, cart, checkout and
 * Coming soon lines are merch lines (MERCH below). Card-pack-only lines (pack
 * details, condition, final sale) stay for when packs come back. Dates come
 * from the config so they live in one place.
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
  const shipDays = config.shipping.ship_within_business_days;
  return {
    nav: "Merch", // pick 12: menus say Merch; the address stays /shop
    // Entry points around the site (build G). The copy doc says "Free shipping
    // anywhere in the US"; these follow the $4.99-under-$25 rule instead (CHANGED,
    // Britton to confirm).
    entry: {
      band: { // MERCH
        eyebrow: "Merch",
        heading: "GameShuffle merch",
        body: `Tees, hoodies, hats and phone cases, made when you order. Free shipping on orders of ${threshold} or more.`,
        button: "Shop merch",
      },
      tcg: { line: `Need cards for game night? Our holiday packs ship free on orders of ${threshold} or more.`, link: "Visit the shop" }, // CHANGED
      gameNights: { line: "Bringing kids to game night? Grab a few packs from the shop.", link: "Visit the shop" },
    },
    hero: { // MERCH
      eyebrow: "Merch",
      title: "GameShuffle merch",
      lead: `Made when you order. ${standard} shipping in the US, free from ${threshold}.`,
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
      heading: "Shipping and returns",
      lines: [ // MERCH
        `Everything is made when you order and usually ships within ${shipDays} business days, with tracking.`,
        "We ship to all 50 states and DC.",
        `Free shipping on orders of ${threshold} or more. Orders under ${threshold} ship for ${standard}.`,
        "Misprinted or arrived damaged? We'll replace it or refund you.",
      ],
      christmas: `Order by ${cutoff} for Christmas delivery. Alaska and Hawaii: order by ${cutoffAkHi}.`,
      policiesLink: "Shipping and returns",
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
      suggest: "Add a single pack", // card packs only
      suggestAdd: (name: string) => `Add ${name}`,
      add: "Add",
      tax: "Sales tax is added at checkout where it applies.",
      checkout: "Check out",
      checkoutNote: `Made when you order; it usually ships within ${shipDays} business days, with tracking. Misprinted or damaged? We'll replace it or refund you.`, // MERCH (Stripe custom text)
      finalSale: "Pokémon card products are final sale.", // NEW
      remove: "Remove",
      less: (name: string) => `One less ${name}`,
      more: (name: string) => `One more ${name}`,
      maxed: (n: number) => `${n} is the most per order`,
      leftOnly: (n: number) => `Only ${n} left`,
    },
    singlesPath: { // NEW (singles stay on TCGplayer)
      line: "Pokémon singles are in our card store.",
      link: "Shop singles on TCGplayer",
    },
    hubPath: { // NEW (2026-10-11 SEO pass: one link to the Pokémon TCG hub)
      line: "Want a deck guide or a free companion for game night?",
      link: "Visit the Pokémon TCG hub",
    },
    closed: { // MERCH
      title: "Nothing here yet",
      body: "Check back soon.",
    },
    soon: { // NEW (Britton, 2026-10-09: everything Coming soon until launch, with an email signup)
      eyebrow: "Coming soon", // MERCH
      lead: "Tees, hoodies, hats and phone cases, made when you order. Get an email the day they go on sale.",
      badge: "Coming soon",
      notify: "Notify me",
      panelTitle: "Get an email when the merch goes on sale",
      panelBody: "One email when it opens. Unsubscribe anytime.",
      emailLabel: "Email address",
      signedInButton: "Email me when it opens",
      joined: "You're on the list. We'll email you when the merch goes on sale.",
      later: "Check back soon.",
      badEmail: "Check that email address and try again.",
      failed: "Couldn't add you just now. Try again.",
    },
    disclaimer: "Real Pokémon TCG cards, packed by hand. GameShuffle is not affiliated with or endorsed by The Pokémon Company or Nintendo. No guaranteed value.",
    banner: {
      before: `Order by ${cutoff} for Christmas delivery. Alaska and Hawaii: ${cutoffAkHi}.`,
      after: "Orders placed now arrive after Christmas. Everything still ships within 2 business days.",
    },
    errors: {
      soldOut: "That one just stopped selling. Pick another color or size.",
      notEnough: (n: number) => `We only have ${n} left. Lower the quantity to keep going.`,
      military: "We can't ship to APO, FPO or DPO addresses yet. Use a US street address in the 50 states or DC.",
      checkoutFailed: `Checkout didn't open. Try again, and if it still won't open, email ${support}.`,
      expired: "Your checkout timed out. Your cart is still here whenever you're ready.",
      canceled: "No charge was made. Your cart is still here.",
    },
    support,
  };
}

/** Merch-only words: product pages and the shelf. */
export function merchCopy(config: ShopConfig = SHOP) {
  const threshold = formatPrice(config.shipping.rate.free_threshold_cents).replace(/\.00$/, "");
  return {
    from: (cents: number) => `From ${formatPrice(cents)}`,
    colors: (n: number) => (n === 1 ? "1 color" : `${n} colors`),
    phones: (n: number) => `${n} phones`,
    moreFrom: (series: string) => `More from ${series.replace(/\.$/, "")}`,
    allChip: "All",
    chipsLabel: "Show",
    color: "Color",
    size: "Size",
    phone: "Phone",
    pickSize: "Pick a size",
    pickPhone: "Pick your phone",
    sizeGuide: "Size guide",
    sizeGuideNote: (unit: string) => `Measured laid flat, in ${unit}. Width is across the chest.`,
    oneSize: "One size fits most.",
    addToCart: "Add to cart",
    added: "Added to cart",
    details: "Details",
    arrives: (min: number | null, max: number | null) =>
      max == null ? "Made when you order." : `Made when you order. Usually arrives in ${min != null && min !== max ? `${min} to ${max}` : max} days in the US.`,
    shippingLine: `${formatPrice(config.shipping.rate.standard_cents)} shipping, free from ${threshold}.`,
    returns: "Misprinted or arrived damaged? We'll replace it or refund you.",
    backToShop: "All merch",
    notLive: "Not live yet. Visitors can't see this product, and Add to cart is off.",
    soon: "Coming soon: get an email when it goes on sale",
    imageAlt: (name: string, color: string | null) => (color ? `${name} in ${color}` : name),
    yourPhoto: (name: string) => `${name}, photo`,
  };
}
