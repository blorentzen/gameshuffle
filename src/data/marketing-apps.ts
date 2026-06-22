import type { IconName } from "@empac/cascadeds";

/**
 * Content for the per-app marketing landing pages (the SEO/GEO surface).
 * Each entry drives one keyword-targeted page via <AppMarketingPage>.
 * Tools stay clean at their own routes; these pages deep-link into them.
 *
 * Copy is written answer-first and scannable for GEO (AI answer engines),
 * with a FAQ that also feeds FAQPage JSON-LD. Keep facts accurate to the
 * shipped tools — see CLAUDE.md for the source of truth on each.
 */

export interface AppFeature {
  icon: IconName;
  title: string;
  description: string;
}

export interface AppStep {
  title: string;
  description: string;
}

export interface AppFaq {
  q: string;
  /** Plain text (also used verbatim in FAQPage JSON-LD). */
  a: string;
}

export interface AppCrossSell {
  heading: string;
  body: string;
  ctaLabel: string;
  ctaHref: string;
  secondaryLabel?: string;
  secondaryHref?: string;
}

export interface AppMarketingContent {
  /** Marketing page path (the route + canonical). */
  path: string;
  metaTitle: string;
  metaDescription: string;
  breadcrumbLabel: string;
  eyebrow: string;
  /** Status badge in the hero — green "Live" or blue "Beta". */
  status: "live" | "beta";
  h1: string;
  heroSubhead: string;
  heroImage: string;
  heroImageAlt: string;
  toolHref: string;
  toolCtaLabel: string;
  /** Answer-first overview paragraph (GEO-extractable). */
  overview: string;
  featuresHeading: string;
  features: AppFeature[];
  /** Optional "how it works" steps — omitted for tools simple enough not
   *  to need instructions (the randomizers). */
  howItWorksHeading?: string;
  howItWorks?: AppStep[];
  crossSell: AppCrossSell;
  /** Optional background image for the final "Ready to play?" CTA — set to
   *  the tool's own background so the marketing page feels cohesive with it. */
  ctaBackground?: string;
  faqHeading: string;
  faq: AppFaq[];
  /** Name used in SoftwareApplication JSON-LD. */
  schemaName: string;
}

const PRO_CROSS_SELL: AppCrossSell = {
  heading: "Streaming it? GameShuffle Pro takes it further.",
  body: "Pro turns the tool into a live, multiplayer experience for your chat — Twitch & Discord sessions, an OBS overlay, chat commands, channel-point rewards, Picks & Bans, and a token economy with prediction markets.",
  ctaLabel: "Explore GameShuffle Pro",
  ctaHref: "/gs-pro",
  secondaryLabel: "See all features",
  secondaryHref: "/features",
};

export const MARKETING_APPS: Record<string, AppMarketingContent> = {
  "mario-kart-8-deluxe-randomizer": {
    path: "/mario-kart-8-deluxe-randomizer",
    metaTitle: "Mario Kart 8 Deluxe Randomizer — Karts, Tracks & Items",
    metaDescription:
      "Free Mario Kart 8 Deluxe randomizer. Generate random character, vehicle, wheels, and glider combos for up to 12 players, shuffle tracks and items, and run wild game nights — no account required.",
    breadcrumbLabel: "Mario Kart 8 Deluxe Randomizer",
    eyebrow: "Mario Kart 8 Deluxe",
    status: "live",
    h1: "Mario Kart 8 Deluxe Randomizer",
    heroSubhead:
      "Randomize kart combos, tracks, and items for Mario Kart 8 Deluxe — for up to 12 players. Free, instant, and no account required.",
    heroImage: "/images/fg/mk8dx-kart-selection-screen.jpg",
    heroImageAlt: "Mario Kart 8 Deluxe character and kart selection screen",
    toolHref: "/randomizers/mario-kart-8-deluxe",
    toolCtaLabel: "Launch the randomizer",
    overview:
      "The GameShuffle Mario Kart 8 Deluxe randomizer builds random four-part kart combos — character, vehicle, wheels, and glider — for everyone at the table, then shuffles the tracks and items for your race. It supports up to 12 players, a tour-only track filter, drift-type filters, and race counts up to 48. Open it in any browser, hit randomize, and play.",
    featuresHeading: "What you can do",
    features: [
      { icon: "layout-grid", title: "Full four-part kart combos", description: "A random character, vehicle, wheels, and glider for every player — up to 12 at once." },
      { icon: "flag", title: "Track shuffler", description: "Randomize the courses for your races, with optional cup icons and a tour-only filter." },
      { icon: "sparkles", title: "Item randomizer", description: "Shuffle item sets to spice up house rules and keep races unpredictable." },
      { icon: "bolt", title: "Drift & weight filters", description: "Constrain combos by drift type and build rules for fairer or wackier races." },
      { icon: "bookmark", title: "Save your setups", description: "Save kart builds, item sets, and full game-night setups to reuse later." },
      { icon: "share", title: "Share & deep-link", description: "Share a config link, or open combos straight from the GameShuffle Discord bot." },
    ],
    crossSell: PRO_CROSS_SELL,
    ctaBackground: "/images/bg/MK8DX_Background_Music.jpg",
    faqHeading: "Frequently asked questions",
    faq: [
      { q: "Is the Mario Kart 8 Deluxe randomizer free?", a: "Yes. The randomizer is completely free and runs in your browser with no account required." },
      { q: "How many players does it support?", a: "Up to 12 players per round, each getting their own random character, vehicle, wheels, and glider combo." },
      { q: "Can I randomize tracks and items too?", a: "Yes. You can shuffle tracks — with a tour-only filter and optional cup icons — and randomize item sets alongside the kart combos." },
      { q: "Can I re-roll just one player's combo?", a: "Yes. You can re-roll any individual slot without re-rolling everyone else." },
      { q: "Does it work on mobile?", a: "Yes. The randomizer runs in any modern mobile or desktop browser." },
    ],
    schemaName: "Mario Kart 8 Deluxe Randomizer",
  },

  "mario-kart-world-randomizer": {
    path: "/mario-kart-world-randomizer",
    metaTitle: "Mario Kart World Randomizer — Characters, Karts & Tracks",
    metaDescription:
      "Free Mario Kart World randomizer. Generate random characters, karts, tracks, items, and knockout rallies for up to 24 players. No account required.",
    breadcrumbLabel: "Mario Kart World Randomizer",
    eyebrow: "Mario Kart World",
    status: "live",
    h1: "Mario Kart World Randomizer",
    heroSubhead:
      "Randomize characters, karts, tracks, items, and knockout rallies for Mario Kart World — for up to 24 players. Free and instant.",
    heroImage: "/images/bg/mkw-main-image.jpg",
    heroImageAlt: "Mario Kart World",
    toolHref: "/randomizers/mario-kart-world",
    toolCtaLabel: "Launch the randomizer",
    overview:
      "The GameShuffle Mario Kart World randomizer creates random character-and-kart pairings for up to 24 players, then shuffles tracks, items, and knockout rallies. It supports vehicle-type filters (Kart, Bike, and ATV), overworld map icons for tracks, and race counts of 4, 6, 8, 12, 16, or 32. Open it, randomize, and race.",
    featuresHeading: "What you can do",
    features: [
      { icon: "layout-grid", title: "Character & kart combos", description: "Random character-and-vehicle pairings for up to 24 players per round." },
      { icon: "bolt", title: "Vehicle-type filter", description: "Limit the pool to Karts, Bikes, or ATVs to match your house rules." },
      { icon: "compass", title: "Track shuffler with overworld icons", description: "Randomize courses, shown with Mario Kart World's overworld map icons." },
      { icon: "award", title: "Knockout rally support", description: "Shuffle setups for knockout rally formats, not just standard races." },
      { icon: "sparkles", title: "Item randomizer", description: "Mix up item rules to keep every race unpredictable." },
      { icon: "bookmark", title: "Save & share", description: "Save your setups and share a config link with the lobby." },
    ],
    crossSell: PRO_CROSS_SELL,
    ctaBackground: "/images/bg/mkw-randomizer-image.jpg",
    faqHeading: "Frequently asked questions",
    faq: [
      { q: "Is the Mario Kart World randomizer free?", a: "Yes. It is completely free and runs in your browser with no account required." },
      { q: "How many players does it support?", a: "Up to 24 players per round, each getting a random character and kart." },
      { q: "Does it support knockout rallies?", a: "Yes. The randomizer supports knockout rally formats in addition to standard races." },
      { q: "Can I filter by vehicle type?", a: "Yes. You can limit combos to Karts, Bikes, or ATVs." },
      { q: "What race counts are available?", a: "You can choose 4, 6, 8, 12, 16, or 32 races." },
    ],
    schemaName: "Mario Kart World Randomizer",
  },

  "competitive-mario-kart": {
    path: "/competitive-mario-kart",
    metaTitle: "Competitive Mario Kart — Live Lounge Scoring",
    metaDescription:
      "Run competitive Mario Kart 8 Deluxe game nights with live lounge scoring: normalized placements, FFA and team modes, per-player entry, and real-time results everyone can follow.",
    breadcrumbLabel: "Competitive Mario Kart",
    eyebrow: "Competitive · Beta",
    status: "beta",
    h1: "Competitive Mario Kart Lounge Scoring",
    heroSubhead:
      "Live lounge scoring for competitive Mario Kart 8 Deluxe — normalized placements, team modes, and real-time results everyone can follow.",
    heroImage: "/images/bg/MK8DX_Background_Music.jpg",
    heroImageAlt: "Competitive Mario Kart 8 Deluxe",
    toolHref: "/competitive/mario-kart-8-deluxe",
    toolCtaLabel: "Open the competitive hub",
    overview:
      "GameShuffle's competitive hub runs live scoring for Mario Kart 8 Deluxe lounges. Each player records their own placement every race, scores are normalized across the lobby so they're fair at any size, and results update in real time for everyone watching. It supports FFA and team formats from 2v2 to 6v6, with a full session flow from character select to final standings.",
    featuresHeading: "What you can do",
    features: [
      { icon: "activity", title: "Live, real-time scoring", description: "Placements and standings update instantly as each race is logged." },
      { icon: "chart-bar", title: "Normalized placements", description: "Scoring stays fair across different lobby sizes and formats." },
      { icon: "users", title: "Team modes", description: "FFA plus 2v2, 3v3, 4v4, and 6v6 team formats." },
      { icon: "checks", title: "Per-player entry", description: "Each racer logs their own result — no bottleneck and no race conditions." },
      { icon: "eye", title: "Public viewer", description: "Anyone can follow the live standings from a shareable link." },
      { icon: "clock", title: "Session phases", description: "A clear flow: waiting, character select, lobby, in progress, complete." },
    ],
    howItWorksHeading: "How it works",
    howItWorks: [
      { title: "Create a session", description: "Start a lounge session and pick your format (FFA or team)." },
      { title: "Players join & pick", description: "Racers join, choose characters, and ready up." },
      { title: "Race & log results", description: "Each player logs their placement per race and standings update live." },
    ],
    crossSell: PRO_CROSS_SELL,
    faqHeading: "Frequently asked questions",
    faq: [
      { q: "Is competitive lounge scoring free?", a: "Yes. The live lounge scoring hub is free to play; viewing is open to anyone with the link." },
      { q: "How does scoring stay fair across lobby sizes?", a: "Placements are normalized across the lobby, so scores are comparable whether you have a small or full lobby." },
      { q: "What team modes are supported?", a: "Free-for-all plus 2v2, 3v3, 4v4, and 6v6 team formats." },
      { q: "Do all players need accounts?", a: "Playing requires sign-in; following the live standings as a viewer does not." },
      { q: "Does it update in real time?", a: "Yes. Every table uses realtime sync, so standings update the moment a placement is logged." },
    ],
    schemaName: "Competitive Mario Kart Lounge",
  },

  "mario-kart-tournaments": {
    path: "/mario-kart-tournaments",
    metaTitle: "Mario Kart Tournaments — Create & Run Brackets",
    metaDescription:
      "Create and run Mario Kart tournaments. Set tracks, items, and build restrictions, add Picks & Bans, and invite participants with live updates. Free to create with an account.",
    breadcrumbLabel: "Mario Kart Tournaments",
    eyebrow: "Tournaments · Beta",
    status: "beta",
    h1: "Mario Kart Tournaments",
    heroSubhead:
      "Create or join Mario Kart tournaments — set tracks, rules, and build restrictions, then run them with live participant updates.",
    heroImage: "/images/fg/mario-holding-trophy.jpg",
    heroImageAlt: "Mario holding a trophy",
    toolHref: "/tournament",
    toolCtaLabel: "Browse & create tournaments",
    overview:
      "GameShuffle's tournament builder lets you create Mario Kart tournaments with custom track selection, item rules, and build restrictions — weight class, drift type, and character ban or allow lists — then invite participants who join with their profile and friend code. Track selection supports guided, FFA, randomized, and limited modes with drag-and-drop ordering, and participant updates are live. Browsing and joining are open; creating is free with an account.",
    featuresHeading: "What you can do",
    features: [
      { icon: "flag", title: "Custom track selection", description: "Guided, FFA, randomized, or limited modes with drag-and-drop ordering." },
      { icon: "bolt", title: "Build restrictions", description: "Weight class, drift type, and character ban or allow lists." },
      { icon: "checks", title: "Picks & bans", description: "Optional participant-driven track and item drafts." },
      { icon: "activity", title: "Live participant updates", description: "The bracket updates in real time as people join." },
      { icon: "circle-check", title: "Verified-only option", description: "Require email-verified participants for cleaner brackets." },
      { icon: "layout-dashboard", title: "Organizer dashboard", description: "Manage your tournament end to end from one place." },
    ],
    howItWorksHeading: "How it works",
    howItWorks: [
      { title: "Create your tournament", description: "Set tracks, items, build restrictions, and rules." },
      { title: "Invite participants", description: "Share it; players join with their profile and friend code." },
      { title: "Run it live", description: "Manage the bracket with real-time participant updates." },
    ],
    crossSell: PRO_CROSS_SELL,
    faqHeading: "Frequently asked questions",
    faq: [
      { q: "Is it free to create a Mario Kart tournament?", a: "Yes. Creating a tournament is free with an account; browsing and joining are open to everyone." },
      { q: "What track selection modes are supported?", a: "Guided, FFA, randomized, and limited — all with drag-and-drop track ordering." },
      { q: "Can I restrict builds?", a: "Yes. You can set weight class, drift type, and character ban or allow lists." },
      { q: "Can I require verified participants?", a: "Yes. Organizers can require email-verified participants for a tournament." },
      { q: "Do participant updates happen live?", a: "Yes. Participant lists and the bracket update in real time as people join." },
    ],
    schemaName: "Mario Kart Tournaments",
  },

  "pokemon-tcg-companion": {
    path: "/pokemon-tcg-companion",
    metaTitle: "Pokémon TCG Companion — Damage, Prizes & Counters",
    metaDescription:
      "A free digital companion for the Pokémon Trading Card Game: track damage, conditions, and prizes, and flip coins or roll dice without breaking up the table. Magic, Lorcana, One Piece and more coming.",
    breadcrumbLabel: "Pokémon TCG Companion",
    eyebrow: "TCG Companion · Beta",
    status: "beta",
    h1: "Pokémon TCG Companion",
    heroSubhead:
      "A digital game-night kit for the Pokémon Trading Card Game — damage counters, conditions, prizes, coin flips, and dice, all in one place.",
    heroImage: "https://cdn.empac.co/gameshuffle/images/standard/pokemon-cards.png",
    heroImageAlt: "Pokémon TCG cards spread on a table",
    toolHref: "/tcg-companion",
    toolCtaLabel: "Open the companion",
    overview:
      "The GameShuffle TCG Companion is a digital accessory kit for tabletop card games, with Pokémon Mode shipped first. It tracks damage counters, status conditions, prize counts, coin flips, and dice rolls so you can keep the game moving without scattered tokens. It's TCG-agnostic by design — Magic: The Gathering, Lorcana, One Piece, and more are on the way. Pokémon Mode is currently in beta.",
    featuresHeading: "What you can do",
    features: [
      { icon: "activity", title: "Damage & HP tracking", description: "Per-Pokémon damage counters you can adjust in a tap." },
      { icon: "eye", title: "Condition tracking", description: "Keep status conditions visible at a glance." },
      { icon: "award", title: "Prize counters", description: "Track prize counts for both players without loose tokens." },
      { icon: "sparkles", title: "Coin flips & dice", description: "Built-in randomizers for coin-flip and dice effects." },
      { icon: "bookmark", title: "Save states", description: "Save a game in progress and resume it later." },
      { icon: "device-mobile", title: "Built for touch", description: "Drag-and-drop interactions tuned for phones and tablets at the table." },
    ],
    howItWorksHeading: "How it works",
    howItWorks: [
      { title: "Open Pokémon Mode", description: "Launch the companion and set up your table." },
      { title: "Track as you play", description: "Adjust damage, conditions, and prizes in real time." },
      { title: "Flip & roll in-app", description: "Use the built-in coin flips and dice for in-game effects." },
    ],
    crossSell: {
      heading: "Pokémon first — more TCGs on the way",
      body: "Pokémon Mode shipped first, but the companion is built to be TCG-agnostic. Magic: The Gathering, Lorcana, One Piece, and more are on the roadmap. Want your game supported next? Tell us.",
      ctaLabel: "Suggest a TCG",
      ctaHref: "/contact-us",
      secondaryLabel: "Send beta feedback",
      secondaryHref: "/tcg-companion/feedback",
    },
    faqHeading: "Frequently asked questions",
    faq: [
      { q: "Is the Pokémon TCG Companion free?", a: "Yes. It is free and runs in your browser, with Pokémon Mode available first." },
      { q: "What does it track?", a: "Damage and HP, status conditions, prize counts, plus coin flips and dice rolls." },
      { q: "Does it support other card games?", a: "Pokémon is supported first. Magic: The Gathering, Lorcana, One Piece, and more are planned, since the companion is TCG-agnostic by design." },
      { q: "Do I need an account?", a: "Basic use is free; saving and resuming game states may require an account." },
      { q: "Is it finished?", a: "Pokémon Mode is currently in beta — we're actively improving it and welcome feedback." },
    ],
    schemaName: "Pokémon TCG Companion",
  },
};

export const MARKETING_APP_PATHS = Object.values(MARKETING_APPS).map((a) => a.path);
