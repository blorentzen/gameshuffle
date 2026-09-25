/**
 * Why this person is at an auth page, derived from where they were headed.
 *
 * Both auth pages were bare forms with no reason on them. But we already know
 * a lot about intent at that moment — a visitor bounced off a tournament join,
 * a game-night RSVP or a mod surface, and `?redirect=` is already carried
 * through to the auth callback. Reading it lets the page answer "why am I
 * here" with the actual answer instead of a generic pitch.
 *
 * Signup and login want different words for the same intent. Signup is
 * selling ("here is what the account gets you"); login is explaining ("you
 * were doing a thing, sign in to carry on"), and someone who already has an
 * account does not need the benefit list. So a context carries both, and
 * `mode` picks.
 *
 * Pure and client-safe so both the page and its tests can use it. Unknown or
 * absent redirects fall back to the generic case, which is the common one.
 */

export type AuthMode = "signup" | "login";

export interface AuthContext {
  /** Replaces the page's default heading when we know the intent. */
  title: string;
  /** One line under the title. */
  lede: string;
  /**
   * What the account gets them. Signup only — someone logging in already has
   * it, so repeating the pitch is noise. Kept to four; longer reads as filler.
   */
  points: string[];
}

/** The short form of an intent, for login. `null` uses the page default. */
interface Intent {
  /** Completes "Log in to …" and "Create your account to …". */
  action: string | null;
  lede: string;
  loginLede?: string;
  points: string[];
}

const GENERIC: Record<AuthMode, AuthContext> = {
  signup: {
    title: "Create your account",
    lede: "Free, and it takes about a minute. The randomizers and tools stay free forever.",
    points: [
      "Save your kart builds, item sets and game-night setups",
      "Run and join tournaments, with live scoring",
      "Host game nights and RSVP to others",
      "A public profile at gameshuffle.co/u/you",
    ],
  },
  login: {
    title: "Log in to GameShuffle",
    lede: "Welcome back.",
    points: [],
  },
};

/**
 * Longest-prefix wins, so `/tournament/create` beats `/tournament`. Order here
 * is not significant; the match is by specificity.
 *
 * Every prefix below is a redirect the app actually produces — grep the repo
 * for `redirect=` before adding one, so this does not drift into a list of
 * paths nobody is sent from.
 */
const BY_PREFIX: { prefix: string; intent: Intent }[] = [
  {
    prefix: "/tournament/create",
    intent: {
      action: "run a tournament",
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
    prefix: "/tournament/sandbox",
    intent: { action: null, lede: "", points: [] },
  },
  {
    prefix: "/tournament",
    intent: {
      action: "join the tournament",
      lede: "Free, and it takes about a minute. You keep the account for every event after this one.",
      loginLede: "Sign in and we'll take you straight back to it.",
      points: [
        "Claim your seat and see the bracket live",
        "Your results follow you across events",
        "Save the builds you race with",
        "A public profile at gameshuffle.co/u/you",
      ],
    },
  },
  {
    prefix: "/championship/join",
    intent: {
      action: "join the championship",
      lede: "Free. Points carry across every event in the season.",
      loginLede: "Sign in and we'll add you to the roster.",
      points: [
        "A seat on the season roster",
        "Points that carry across every event",
        "Your standing in the season table",
        "Save the builds you race with",
      ],
    },
  },
  {
    prefix: "/game-nights/create",
    intent: {
      action: "host a game night",
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
    intent: {
      action: "RSVP",
      lede: "Free, and it takes about a minute. Hosts can see who is coming.",
      loginLede: "Sign in and we'll take you straight back to the night.",
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
    intent: {
      action: "keep your collection",
      lede: "Free. The companion itself works without an account; saving does not.",
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
    intent: {
      action: "run your stream",
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
    prefix: "/mod/",
    intent: {
      action: "moderate for this streamer",
      lede: "You were invited to help run someone's channel.",
      loginLede: "Sign in with the account the invite was sent to.",
      points: [
        "Run sessions on the streamer's behalf",
        "Only the permissions they grant you",
        "Your own account, kept separate",
        "Free",
      ],
    },
  },
  {
    prefix: "/communities",
    intent: {
      action: "join the conversation",
      lede: "Free, and it takes about a minute.",
      points: [
        "Post, react and follow players",
        "Find communities running the games you play",
        "Join crews and represent them",
        "A public profile at gameshuffle.co/u/you",
      ],
    },
  },
  {
    prefix: "/c/",
    intent: {
      action: "join the community",
      lede: "Free, and it takes about a minute.",
      points: [
        "Post, react and follow players",
        "See what the community is running",
        "Join crews and represent them",
        "A public profile at gameshuffle.co/u/you",
      ],
    },
  },
  {
    prefix: "/players",
    intent: {
      action: "find players",
      lede: "Free. Tell us what you play and we'll match you up.",
      points: [
        "Find people who play what you play",
        "Follow them and see what they run",
        "Get invited to nights and tournaments",
        "A public profile at gameshuffle.co/u/you",
      ],
    },
  },
  {
    prefix: "/beta",
    intent: {
      action: "apply for the Streamer Beta",
      lede: "Free to apply. The beta includes Pro for the run.",
      points: [
        "Pro included for the length of the beta",
        "A direct line into what gets built",
        "Chat-driven randomizers and the overlay",
        "Free",
      ],
    },
  },
  {
    prefix: "/ideas",
    intent: {
      action: "post and vote on ideas",
      lede: "Free. Tell us what to build next.",
      points: [
        "Post an idea and see what others want",
        "Vote on what gets built next",
        "Follow an idea and hear when it ships",
        "Free",
      ],
    },
  },
  {
    prefix: "/account/privacy/data-request",
    intent: {
      action: "make a data request",
      lede: "We need to know it's you before we can export or delete your data.",
      loginLede: "Sign in so we can confirm it's your data you're asking about.",
      points: [],
    },
  },
];

/**
 * Paths whose meaning sits AFTER a dynamic segment, which a prefix cannot
 * express: `/tournament/<id>/manage/check-in` is an organizer's job, not a
 * player's, but it starts with the same prefix as joining one. Checked before
 * the prefix table.
 */
const BY_PATTERN: { test: RegExp; intent: Intent }[] = [
  {
    test: /^\/tournament\/[^/]+\/manage\/check-in/,
    intent: {
      action: "check players in",
      lede: "You're running this one. Sign in to open the check-in desk.",
      loginLede: "You're running this one. Sign in to open the check-in desk.",
      points: [],
    },
  },
  {
    test: /^\/tournament\/[^/]+\/manage/,
    intent: {
      action: "manage your tournament",
      lede: "Sign in to open the organizer dashboard.",
      loginLede: "Sign in to open the organizer dashboard.",
      points: [],
    },
  },
  {
    test: /^\/game-nights\/[^/]+\/manage/,
    intent: {
      action: "manage your game night",
      lede: "Sign in to open the host tools.",
      loginLede: "Sign in to open the host tools.",
      points: [],
    },
  },
];

function intentFor(redirect: string | null | undefined): Intent | null {
  if (!redirect) return null;
  // Only same-origin paths are meaningful here, and refusing anything else
  // keeps an attacker-supplied absolute URL from steering the copy.
  if (!redirect.startsWith("/") || redirect.startsWith("//")) return null;

  for (const { test, intent } of BY_PATTERN) {
    if (test.test(redirect)) return intent;
  }

  let best: { len: number; intent: Intent } | null = null;
  for (const { prefix, intent } of BY_PREFIX) {
    if (redirect.startsWith(prefix) && (!best || prefix.length > best.len)) {
      best = { len: prefix.length, intent };
    }
  }
  return best?.intent ?? null;
}

export function authContextFor(redirect: string | null | undefined, mode: AuthMode): AuthContext {
  const intent = intentFor(redirect);
  const generic = GENERIC[mode];
  if (!intent || !intent.action) return generic;

  return mode === "signup"
    ? {
        title: `Create your account to ${intent.action}`,
        lede: intent.lede || generic.lede,
        // A manage/check-in intent carries no points of its own; the generic
        // account pitch is the right thing to show beside it.
        points: intent.points.length ? intent.points : generic.points,
      }
    : {
        title: `Log in to ${intent.action}`,
        lede: intent.loginLede || intent.lede || generic.lede,
        // Someone logging in already has the account; the pitch is noise.
        points: [],
      };
}
