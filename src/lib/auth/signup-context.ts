/**
 * Why this person is signing up, derived from where they were headed.
 *
 * Signup is a bare form today: three fields and no reason. But we already know
 * a lot about intent at that moment — a visitor bounced off a tournament join,
 * a game-night RSVP or the collection, and `?redirect=` is already carried
 * through to the auth callback. Reading it lets the page answer "what am I
 * signing up for" with the actual answer instead of a generic pitch.
 *
 * Pure and client-safe so both the page and its tests can use it. Unknown or
 * absent redirects fall back to the generic case, which is the common one.
 */

export interface SignupContext {
  /** Replaces "Create your account" when we know the intent. */
  title: string;
  /** One line under the title. */
  lede: string;
  /** What the account gets them. Kept to four; a longer list reads as filler. */
  points: string[];
}

const GENERIC: SignupContext = {
  title: "Create your account",
  lede: "Free, and it takes about a minute. The randomizers and tools stay free forever.",
  points: [
    "Save your kart builds, item sets and game-night setups",
    "Run and join tournaments, with live scoring",
    "Host game nights and RSVP to others",
    "A public profile at gameshuffle.co/u/you",
  ],
};

/**
 * Longest-prefix wins, so `/tournament/create` beats `/tournament`. Order here
 * is not significant; the match is by specificity.
 */
const BY_PREFIX: { prefix: string; ctx: SignupContext }[] = [
  {
    prefix: "/tournament/create",
    ctx: {
      title: "Create your account to run a tournament",
      lede: "Free to host. Brackets, points or the Heat to Mains ladder.",
      points: [
        "Brackets, points races and championship seasons",
        "Randomized rounds nobody can argue with",
        "Live scoring your players update themselves",
        "A season table that keeps itself",
      ],
    },
  },
  {
    prefix: "/tournament",
    ctx: {
      title: "Create your account to join the tournament",
      lede: "Free, and it takes about a minute. You keep the account for every event after this one.",
      points: [
        "Claim your seat and see the bracket live",
        "Your results follow you across events",
        "Save the builds you race with",
        "A public profile at gameshuffle.co/u/you",
      ],
    },
  },
  {
    prefix: "/game-nights/create",
    ctx: {
      title: "Create your account to host a game night",
      lede: "Free to host. Set the games, the vibe and who it's for.",
      points: [
        "Publish a night people can find and RSVP to",
        "Track who is coming and how many spots are left",
        "Sell tickets if you want to cover the table",
        "Run it on the night with the game-night tools",
      ],
    },
  },
  {
    prefix: "/game-nights",
    ctx: {
      title: "Create your account to RSVP",
      lede: "Free, and it takes about a minute. Hosts can see who is coming.",
      points: [
        "RSVP to nights near you",
        "Get a reminder before it starts",
        "Tell hosts what you like to play",
        "Host your own whenever you want",
      ],
    },
  },
  {
    prefix: "/tcg-companion",
    ctx: {
      title: "Create your account to keep your collection",
      lede: "Free. The companion itself works without one; saving does not.",
      points: [
        "Track the cards you own",
        "Save a game in progress and come back to it",
        "Use the companion across your devices",
        "Free to browse and collect",
      ],
    },
  },
  {
    prefix: "/hub",
    ctx: {
      title: "Create your account to run your stream",
      lede: "Connect Twitch or Discord and your chat becomes your players.",
      points: [
        "Chat-driven randomizers and an OBS overlay",
        "Sessions your viewers join with a command",
        "Live polls, wheels and prediction markets",
        "Free to start; Pro adds the platform layer",
      ],
    },
  },
  {
    prefix: "/c/",
    ctx: {
      title: "Create your account to join the community",
      lede: "Free, and it takes about a minute.",
      points: [
        "Post, react and follow players",
        "See what the community is running",
        "Join crews and represent them",
        "A public profile at gameshuffle.co/u/you",
      ],
    },
  },
];

export function signupContextFor(redirect: string | null | undefined): SignupContext {
  if (!redirect) return GENERIC;
  // Only same-origin paths are meaningful here, and refusing anything else
  // keeps an attacker-supplied absolute URL from steering the copy.
  if (!redirect.startsWith("/") || redirect.startsWith("//")) return GENERIC;

  let best: { len: number; ctx: SignupContext } | null = null;
  for (const { prefix, ctx } of BY_PREFIX) {
    if (redirect.startsWith(prefix) && (!best || prefix.length > best.len)) {
      best = { len: prefix.length, ctx };
    }
  }
  return best?.ctx ?? GENERIC;
}
