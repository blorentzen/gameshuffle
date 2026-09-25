/**
 * Which Pro feature sent someone to the pitch page.
 *
 * Every in-app upgrade link was a bare `/gs-pro`, so a free account that hit
 * the wall on Wheels landed on a page that never mentions wheels. The moment
 * someone clicks an upgrade button is the moment we know the most about what
 * they want, and it was being thrown away at the door.
 *
 * `?from=` is a short, stable key — not a path — because these links come from
 * inside the app and the key is what the page keys its copy on. An unknown or
 * missing key falls back to the page's own headline, which is the common case
 * (every marketing link into /gs-pro stays generic on purpose).
 */

export interface ProContext {
  /** The thing they were trying to do, e.g. "spin a wheel on stream". */
  headline: string;
  /** One line naming what Pro changes about it. */
  lede: string;
}

const FROM: Record<string, ProContext> = {
  wheels: {
    headline: "Put your wheel on the stream.",
    lede: "Pro spins it on your OBS overlay and lets chat trigger it with a command, instead of you sharing a browser tab.",
  },
  polls: {
    headline: "Run one poll everywhere at once.",
    lede: "Pro runs a single poll across your overlay, Twitch chat and Discord, and tallies every vote into one result.",
  },
  "discord-bot": {
    headline: "Bring GameShuffle into your Discord.",
    lede: "Pro adds the bot: announcements routed to the right channel, roles, QOTD and polls, in the server your community already uses.",
  },
  collection: {
    headline: "Go deeper on your collection.",
    lede: "Browsing and collecting stay free. Pro adds the bigger workspace for people running a shop or a league.",
  },
  ticketing: {
    headline: "Sell tickets to your events.",
    lede: "Pro drops the platform fee and pays out to your own Stripe account, so more of the door goes to the table.",
  },
  overlay: {
    headline: "Put GameShuffle on your stream.",
    lede: "Pro adds the OBS overlay: combos, wheels, polls and events on screen, driven by your chat.",
  },
  modules: {
    headline: "Turn your chat into players.",
    lede: "Pro adds the module layer: prediction markets, bounties, awards and the token economy your viewers play for.",
  },
};

export function proContextFor(from: string | null | undefined): ProContext | null {
  if (!from) return null;
  return FROM[from] ?? null;
}

/** The keys a link may pass, for the test and for anyone adding a new gate. */
export const PRO_CONTEXT_KEYS = Object.keys(FROM);
