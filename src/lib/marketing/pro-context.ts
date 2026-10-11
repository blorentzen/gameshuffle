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
    lede: "Ticket sales open with GS Circuit, our plan for organizers: lower platform fees, payouts to your own Stripe account and promo codes.",
  },
  overlay: {
    headline: "Put GameShuffle on your stream.",
    lede: "Pro adds the OBS overlay: combos, wheels, polls and events on screen, driven by your chat.",
  },
  modules: {
    headline: "Turn your chat into players.",
    lede: "Pro adds the module layer: prediction markets, bounties, awards and the token economy your viewers play for.",
  },
  "discord-page": {
    headline: "Run your Discord with GameShuffle.",
    lede: "Pro adds the server tools: go-live alerts for the creators you follow, roles, AutoMod and logs, Question of the Day, and up to five servers.",
  },
  "discord-servers": {
    headline: "Run GameShuffle in more servers.",
    lede: "Free works in one server. Pro runs the bot in up to five, each with its own channels, roles and posts.",
  },
  draft: {
    headline: "Let chat draft your team.",
    lede: "Pro runs Chat Draft: chat votes your Pokémon team, kart combo or Smash fighter one pick at a time, live on your overlay.",
  },
  bingo: {
    headline: "Run Stream Bingo for your chat.",
    lede: "Pro deals every viewer a card on your live page, calls the numbers on your overlay and checks every bingo for you.",
  },
  "streaming-get-started": {
    headline: "Turn your stream into game night.",
    lede: "Pro connects Twitch: your overlay, chat commands, rolls for every game, live games and break mode, all run from one place.",
  },
  jackbox: {
    headline: "Let chat pick the Jackbox game.",
    lede: "Pro sends your three picks to one poll across your overlay, Twitch chat and Discord, and tallies every vote.",
  },
  decks: {
    headline: "Write your own cards.",
    lede: "Pro lets you write Chance cards, missions and house rules for your community, and draft a set with AI.",
  },
  "ai-pack": {
    headline: "Make a content pack with AI.",
    lede: "Pro drafts wheel slices, bingo prompts and tier lists from a theme you give it, and you keep the ones you like.",
  },
  "ai-recap": {
    headline: "Recap your stream with AI.",
    lede: "Pro writes the Discord post and a short post from what happened on stream; you edit them and share.",
  },
  "ai-deck": {
    headline: "Draft deck cards with AI.",
    lede: "Pro drafts Chance cards, missions and house rules from a theme, and you publish the ones that fit your table.",
  },
  "ai-trivia": {
    headline: "Draft trivia questions with AI.",
    lede: "Pro drafts questions for your trivia night with sources to check, and you approve every one before it's used.",
  },
};

/** Any other AI tool (`?from=ai-<feature>` from AiGate): the allowance pitch. */
const AI_ANY: ProContext = {
  headline: "Keep going with the AI tools.",
  lede: "Free accounts get a few tries a day. Pro gives you a monthly allowance across every AI tool, from setups and plans to packs and recaps.",
};

export function proContextFor(from: string | null | undefined): ProContext | null {
  if (!from) return null;
  return FROM[from] ?? (from.startsWith("ai-") ? AI_ANY : null);
}

/** The keys a link may pass, for the test and for anyone adding a new gate. */
export const PRO_CONTEXT_KEYS = Object.keys(FROM);
