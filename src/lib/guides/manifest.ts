/**
 * The guides catalog: the content side of the SEO plan.
 *
 * Shape is pillar-and-cluster. Each cluster points at a product page we want
 * ranking, and every guide in it answers a question someone asks just before
 * they need that page, then links back. The internal linking is most of the
 * value and the part that gets skipped, so `pillar` is a required field rather
 * than something an author remembers.
 *
 * `published` gates both rendering and the sitemap, so the full plan can live
 * here while only finished pieces go live. An unpublished slug 404s.
 *
 * WHY A MANIFEST AND NOT A DATABASE: this mirrors src/lib/help/manifest.ts,
 * which already works. The open question is whether guides should move to a
 * Supabase table with an editor so posts can be written from a phone without a
 * commit; that is a bigger change and it does not block the structure, the
 * URLs, or the first pieces. Nothing here assumes the manifest is permanent:
 * swap `GUIDES` for a query and the pages are unchanged.
 */

export type GuideClusterId = "hosting" | "fair-play" | "game-nights" | "streaming";

export interface GuideCluster {
  id: GuideClusterId;
  label: string;
  /** One line under the cluster heading on the index. */
  blurb: string;
  /** The product page every guide in this cluster links back to. */
  pillar: string;
  pillarLabel: string;
}

export const GUIDE_CLUSTERS: GuideCluster[] = [
  {
    id: "hosting",
    label: "Running a tournament",
    blurb: "Picking a format, filling a field, and getting through the night without a spreadsheet.",
    pillar: "/host-a-tournament",
    pillarLabel: "Host a tournament",
  },
  {
    id: "fair-play",
    label: "Making it fun for everyone",
    blurb: "Mixed skill levels, handicaps, and why a random draw beats both.",
    pillar: "/host-a-tournament",
    pillarLabel: "Host a tournament",
  },
  {
    id: "game-nights",
    label: "Hosting a game night",
    blurb: "The logistics nobody writes down: timing, food, and the person who hates losing.",
    pillar: "/game-nights",
    pillarLabel: "Browse game nights",
  },
  {
    id: "streaming",
    label: "Playing with your chat",
    blurb: "Turning an audience into participants without losing the run.",
    pillar: "/gs-pro",
    pillarLabel: "GameShuffle Pro",
  },
];

export interface GuideMeta {
  slug: string;
  title: string;
  /** Meta description and the index card's body. One sentence. */
  description: string;
  cluster: GuideClusterId;
  /** Live yet? Unpublished guides stay out of the index, the sitemap and routing. */
  published: boolean;
  /** Rough read time in minutes, shown on the card. */
  minutes: number;
  /** Is this guide about a specific game? Used by the balance check below. */
  gameSpecific?: "mario-kart" | "pokemon-tcg" | null;
}

/**
 * The full plan, published and not. Order within a cluster is publish order.
 *
 * DELIBERATE BALANCE: at most a third of these are tied to one game. The site
 * already leans Mario Kart on its highest-authority pages (two randomizers, a
 * competitive hub, a tournaments page), and a guides section that leaned the
 * same way would confirm to a search engine that GameShuffle is a Mario Kart
 * site rather than a game-night platform that is very good at Mario Kart.
 * Keep `gameSpecific` entries in the minority; `npm run guides:balance` checks.
 */
export const GUIDES: GuideMeta[] = [
  // ── Running a tournament (game-agnostic, the money cluster) ──────────────
  { slug: "how-to-run-a-tournament-with-friends", cluster: "hosting", published: true, minutes: 9,
    title: "How to run a tournament with your friends",
    description: "How many people you need, which format fits the evening, how long it really takes, and what to do when someone drops out halfway." },
  { slug: "tournament-formats-explained", cluster: "hosting", published: true, minutes: 11,
    title: "Tournament formats explained: bracket, round robin, points or heats",
    description: "An honest comparison of the four formats by player count and running time, including when a bracket is the wrong answer." },
  { slug: "how-to-seed-a-tournament", cluster: "hosting", published: false, minutes: 6,
    title: "How to seed a tournament fairly",
    description: "Byes, snake seeding, and why random is usually the right call when you are playing with friends." },
  { slug: "tournament-without-accounts", cluster: "hosting", published: false, minutes: 5,
    title: "How to run a tournament when half your players will not make an account",
    description: "Running a real bracket for a group where only some people will sign up for anything." },
  { slug: "how-many-players-for-a-tournament", cluster: "hosting", published: false, minutes: 4,
    title: "How many players do you need for a tournament?",
    description: "A format-by-player-count table, and the honest answer that six is plenty." },

  // ── Making it fun for everyone ───────────────────────────────────────────
  { slug: "mixed-skill-game-night", cluster: "fair-play", published: false, minutes: 8,
    title: "How to keep a game night fun when everyone is a different skill level",
    description: "Handicaps, house rules, and the random draw that beats both without anyone feeling patronised." },
  { slug: "mario-kart-mixed-skill", cluster: "fair-play", published: false, minutes: 7, gameSpecific: "mario-kart",
    title: "How to make Mario Kart fun when everyone is a different skill level",
    description: "Random builds take the specialist's crutch away and give the newcomer a chance, which beats handing out handicaps." },
  { slug: "mario-kart-tournament-formats", cluster: "fair-play", published: false, minutes: 9, gameSpecific: "mario-kart",
    title: "Ten Mario Kart tournament formats worth stealing",
    description: "Themed pools, bikes-only nights, one kart all evening, banned-meta runs. Each one loads as a real tournament." },

  // ── Hosting a game night ─────────────────────────────────────────────────
  { slug: "host-a-game-night", cluster: "game-nights", published: false, minutes: 8,
    title: "How to host a game night people come back to",
    description: "Timing, food, group size, and how to handle the person who hates losing. Logistics, not game lists." },
  { slug: "game-night-for-non-gamers", cluster: "game-nights", published: false, minutes: 7,
    title: "Game night ideas for people who do not play games",
    description: "What to put in front of a group where half the room has never held a controller." },
  { slug: "games-for-big-groups", cluster: "game-nights", published: false, minutes: 6,
    title: "What to play when you have more than six people",
    description: "The point where most games break, and the ones that do not." },
  { slug: "board-game-tournament", cluster: "game-nights", published: false, minutes: 7,
    title: "How to run a board game tournament",
    description: "Brackets and points work for tabletop too. Scoring, timing rounds, and handling games that run long." },

  // ── Playing with your chat ───────────────────────────────────────────────
  { slug: "twitch-chat-playing-along", cluster: "streaming", published: false, minutes: 8,
    title: "How to get your Twitch chat playing along",
    description: "Chat commands, channel points, picks and bans, and prediction markets, in the order worth adding them." },
  { slug: "channel-point-reward-ideas", cluster: "streaming", published: false, minutes: 6,
    title: "Channel point reward ideas that are not just text-to-speech",
    description: "Rewards that change what happens on screen instead of reading a message out." },
  { slug: "viewer-tournament", cluster: "streaming", published: false, minutes: 7,
    title: "How to run a tournament your viewers can enter",
    description: "Taking sign-ups from chat, seeding strangers, and keeping it moving on stream." },
  { slug: "stream-game-night", cluster: "streaming", published: false, minutes: 6,
    title: "How to stream a game night without it dragging",
    description: "Keeping dead air out of the gaps between rounds when the people playing are not all on camera." },
];

export const publishedGuides = (): GuideMeta[] => GUIDES.filter((g) => g.published);

export const guidesInCluster = (id: GuideClusterId): GuideMeta[] =>
  publishedGuides().filter((g) => g.cluster === id);

export const findGuide = (slug: string): GuideMeta | undefined =>
  GUIDES.find((g) => g.slug === slug && g.published);

export const clusterFor = (id: GuideClusterId): GuideCluster =>
  GUIDE_CLUSTERS.find((c) => c.id === id)!;

/** Share of the catalog tied to a single game. Kept under a third on purpose;
 *  see the note on GUIDES. */
export function gameSpecificShare(): { specific: number; total: number; pct: number } {
  const total = GUIDES.length;
  const specific = GUIDES.filter((g) => g.gameSpecific).length;
  return { specific, total, pct: Math.round((specific / total) * 100) };
}
