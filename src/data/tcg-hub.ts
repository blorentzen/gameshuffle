/**
 * Content model for the GameShuffle TCG hub (`/pokemon-tcg`) — the
 * dual-purpose brand page: sells physical cards AND funnels to the
 * companion app.
 *
 * ─────────────────────────────────────────────────────────────────────
 * ⚠️  BEFORE THIS PAGE GOES LIVE (it ships `noindex` + unlinked):
 *
 *   1. Replace the FPO `FEATURED_CARDS` with REAL listings. (Reviews are
 *      real; deck ideas now come from the `content/decks` cluster via the
 *      page's Featured-decks section, not this file.) Do NOT publish fake
 *      listings — invented product data is deceptive and must never ship.
 *   2. Confirm the SCRYDEX copy is accurate to the actual arrangement
 *      (it's written conservatively — no "official partnership" claim).
 *   3. Then flip `TCG_HUB_LIVE = true` and do the go-live wiring
 *      (nav + footer + sitemap + companion-page cross-link) — see the
 *      "GO-LIVE" comment in `src/app/pokemon-tcg/page.tsx`.
 * ─────────────────────────────────────────────────────────────────────
 */

import { TCG_SHOP_URL } from "@/data/shop";

/** Flip to `true` once the placeholders below are real content. Drives
 *  the page's robots meta (noindex while false). */
export const TCG_HUB_LIVE = true;

export const TCG_HUB_PATH = "/pokemon-tcg";
export const TCG_COMPANION_HREF = "/tcg-companion";
export const TCG_COMPANION_MARKETING_HREF = "/pokemon-tcg-companion";
/** "My Cards" collection — private surface, lives in the account My Stuff
 *  section (the hub just links to it). */
export const TCG_MY_CARDS_HREF = "/account/stuff?tab=my-cards";

export interface FeaturedCard {
  name: string;
  set: string;
  /** Display price, e.g. "$4.99". Keep it a string — it's shown, not summed. */
  price: string;
  /** Card image URL (Scrydex / your own art / TCGplayer image). Omit for an
   *  FPO styled placeholder face — swap in real art before go-live. */
  image?: string;
  /** Deep link to the product (or the storefront) on TCGplayer. */
  href: string;
}

export interface TcgReview {
  quote: string;
  /** Attribution — a first name / handle is plenty. */
  author: string;
  /** Where it came from, e.g. "TCGplayer". Optional. */
  source?: string;
  /** 1–5. Optional; renders star glyphs when present. */
  rating?: number;
}

export interface DeckRtb {
  /** CDS registry icon name. */
  icon: string;
  title: string;
  description: string;
}

// ── Hero ──────────────────────────────────────────────────────────────
export const HERO = {
  eyebrow: "GameShuffle TCG",
  // Non-breaking space keeps "with care." together so "care." never orphans.
  h1: "Pokémon cards, handled with\u00A0care.",
  subhead:
    "Singles to chase and ready-to-run decks — competitive, beginner, or meme. Whether you collect, compete, or are just getting back into it, we treat every card like it matters, ship it fast and protected, and back it with a free companion app for game night.",
  image: "https://cdn.empac.co/gameshuffle/images/standard/pokemon-cards.png",
  imageAlt: "Pokémon TCG cards spread across a game-night table",
  primary: { label: "Shop the cards", href: TCG_SHOP_URL, external: true },
  secondary: { label: "Open the companion", href: TCG_COMPANION_HREF },
} as const;

// ── What we carry — the product lines (singles + three deck flavors) ──
export interface CarryLine {
  icon: string;
  title: string;
  description: string;
}
export const CARRY: CarryLine[] = [
  {
    icon: "layout-grid",
    title: "Singles",
    description: "Chase cards and staples, carefully graded and protected.",
  },
  {
    icon: "flag",
    title: "Competitive decks",
    description: "Tournament-ready lists built to win, ready to sleeve up.",
  },
  {
    icon: "sparkles",
    title: "Beginner decks",
    description: "Approachable builds to learn the game — or get back into it.",
  },
  {
    icon: "bolt",
    title: "Meme decks",
    description: "Off-meta, for-the-bit builds that are just plain fun.",
  },
];

// ── Featured cards ────────────────────────────────────────────────────
// FPO (For Placement Only) — layout stand-ins so the carousel can be styled.
// No `image` set, so each renders a styled placeholder face. Before go-live,
// replace with REAL listings (name/set/price/image/href) from your store.
export const FEATURED_CARDS: FeaturedCard[] = [
  { name: "Charizard ex", set: "Obsidian Flames", price: "$—", href: TCG_SHOP_URL },
  { name: "Pikachu VMAX", set: "Vivid Voltage", price: "$—", href: TCG_SHOP_URL },
  { name: "Mewtwo V", set: "Pokémon GO", price: "$—", href: TCG_SHOP_URL },
  { name: "Gardevoir ex", set: "Scarlet & Violet", price: "$—", href: TCG_SHOP_URL },
  { name: "Miraidon ex", set: "Paldea Evolved", price: "$—", href: TCG_SHOP_URL },
  { name: "Giratina VSTAR", set: "Lost Origin", price: "$—", href: TCG_SHOP_URL },
  { name: "Rayquaza VMAX", set: "Evolving Skies", price: "$—", href: TCG_SHOP_URL },
  { name: "Lugia V", set: "Silver Tempest", price: "$—", href: TCG_SHOP_URL },
];

// ── Companion tie-in ──────────────────────────────────────────────────
export const COMPANION = {
  eyebrow: "Free with every order — free for everyone",
  heading: "A companion app that runs your whole table",
  body:
    "Buy the cards, then run the game with the free GameShuffle Companion. Damage, conditions, prizes, coin flips, dice — everything the game needs, in one place, so nothing gets lost between turns. It's the real reason to make GameShuffle your shop: you're not just getting cards, you're getting the tool that makes game night better.",
  rtbs: [
    {
      icon: "activity",
      title: "Damage & HP",
      description: "Per-Pokémon counters you adjust in a tap.",
    },
    {
      icon: "eye",
      title: "Conditions",
      description: "Status effects stay visible at a glance.",
    },
    {
      icon: "award",
      title: "Prizes",
      description: "Track prize counts for both players.",
    },
    {
      icon: "sparkles",
      title: "Coin flips & dice",
      description: "Built-in randomizers for card effects.",
    },
  ] as DeckRtb[],
  // Forward-looking vision, shown inside the same (dark) companion module.
  // Written conservatively — no claim of a formal/official partnership.
  // Confirm framing against the real Scrydex arrangement before go-live.
  scrydex: {
    eyebrow: "In progress",
    heading: "Soon: your actual cards, in the app",
    body:
      "We're building toward real card artwork and data inside the Companion, powered by Scrydex — so the digital table shows the cards you're actually playing, not just counters. It's early; we'll share more as it comes together.",
  },
  cta: { label: "Open the companion", href: TCG_COMPANION_HREF },
  learnMore: { label: "How the companion works", href: TCG_COMPANION_MARKETING_HREF },
} as const;

// ── Reviews ───────────────────────────────────────────────────────────
// Real, verified buyer reviews from the GameShuffle TCG store on
// tcgplayer.com. Quotes are verbatim; attribution is the reviewer's given
// first name. To add more, copy new verified reviews here — do not edit
// the wording or invent entries.
export const REVIEWS: TcgReview[] = [
  {
    quote:
      "Genuinely the fastest shipping I have encountered. Amazing packaging and protection. And the card looks incredible. Thank you!",
    author: "Emily",
    source: "TCGplayer",
    rating: 5,
  },
  {
    quote: "Ridiculously good packaging and service! Thank you for the coin!",
    author: "Cash",
    source: "TCGplayer",
    rating: 5,
  },
  {
    quote:
      "Card arrived in excellent condition and loved the message letting me know that they had shipped it!",
    author: "Brandon",
    source: "TCGplayer",
    rating: 5,
  },
  {
    quote: "Cards arrived as described. Fast shipping. Thank you!",
    author: "Luciano",
    source: "TCGplayer",
    rating: 5,
  },
  {
    quote: "Came quick and in great condition! Packages well too!",
    author: "Caitlyn",
    source: "TCGplayer",
    rating: 5,
  },
  {
    quote: "The cards arrived fast and were packaged well.",
    author: "Andrew",
    source: "TCGplayer",
    rating: 5,
  },
  {
    quote: "Excellent Service, the best of the best!",
    author: "Rene",
    source: "TCGplayer",
    rating: 5,
  },
  {
    quote: "10/10 Thanks!",
    author: "Michael",
    source: "TCGplayer",
    rating: 5,
  },
  {
    quote: "Fast shipping and great packaging!! Would buy from again.",
    author: "Kristina",
    source: "TCGplayer",
    rating: 5,
  },
  {
    quote: "Excellent customer service when USPS dropped the ball on us.",
    author: "Matthew",
    source: "TCGplayer",
    rating: 5,
  },
];

// ── FAQ ───────────────────────────────────────────────────────────────
export const FAQ: { q: string; a: string }[] = [
  {
    q: "What do you sell?",
    a: "Singles and ready-to-run decks — competitive, beginner, and meme builds. (No sealed product right now.)",
  },
  {
    q: "Where do the cards ship from?",
    a: "Orders are fulfilled through our GameShuffle TCG store on TCGplayer, which handles checkout, packing, and shipping.",
  },
  {
    q: "Is the companion app free?",
    a: "Yes. The GameShuffle Companion runs free in your browser — Pokémon Mode is available now, with more TCGs on the way.",
  },
  {
    q: "Do I need to buy cards to use the companion?",
    a: "No. The companion is free and independent — buy from us if you'd like to support it, but the app works with whatever cards you already play.",
  },
  {
    q: "What is Scrydex going to add?",
    a: "We're working toward showing real card artwork and data inside the companion via Scrydex. It's in progress — follow along and we'll announce when it's ready.",
  },
];

export const META = {
  title: "GameShuffle TCG — Pokémon Singles, Decks + the Companion App",
  description:
    "Pokémon singles and ready-to-run decks (competitive, beginner, and meme) from GameShuffle TCG — shipped fast and protected, backed by a free companion app for running your games.",
  ogImage: "https://cdn.empac.co/gameshuffle/images/opengraph/tcg-companion-og.jpg",
} as const;
