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
    lede: "The bot is free in one server. Pro adds up to five servers, posts routed to the right channel, roles, AutoMod, polls, reminders and Question of the Day.",
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
  "trivia-stream": {
    headline: "Play trivia on your stream.",
    lede: "Pro puts your trivia night on stream: chat answers with !a, viewers play on your live page, and the questions show on your overlay.",
  },
  "level-queue": {
    headline: "Run a level queue for your chat.",
    lede: "Pro takes Mario Maker 2, Fortnite and Fall Guys codes from chat with !add, keeps the line fair and shows what's next on your overlay.",
  },
  seasons: {
    headline: "Show every season you've played.",
    lede: "Pro keeps your past months on your profile and your community's page, for everyone who visits.",
  },
  "ai-trivia": {
    headline: "Draft trivia questions with AI.",
    lede: "Pro drafts questions for your trivia night with sources to check, and you approve every one before it's used.",
  },
  "banner-gif": {
    headline: "Make your banner move.",
    lede: "Pro turns one of your GIFs into an animated banner on your profile, along with brand themes, skins and your own CSS.",
  },
  "comp-lounge": {
    headline: "Give your server lounge division roles.",
    lede: "Pro has the bot hand out Iron to Grandmaster roles as members rank up and post a Monday board of the server's lounge players. Rank-up posts stay free.",
  },
  "comp-speedrun": {
    headline: "Ping your server when a run is on pace.",
    lede: "Pro posts an alert when a live runner is ahead of their PB with a quarter of the run left. PB posts stay free.",
  },
  "mmr-goal": {
    headline: "Set a goal for tonight's lounge.",
    lede: "Pro puts a number on your MMR card for the night, counts down to it as you play and plays a moment when you reach it.",
  },
  "mmr-recap": {
    headline: "Recap your lounge night.",
    lede: "Pro adds a card of tonight's run for your ending scene and a lounge report in your inbox every Monday.",
  },
  "home-competitive": {
    headline: "Get more from your MMR card.",
    lede: "Pro adds a goal for the night on your card, a recap card after it and a lounge report every Monday.",
  },
  "home-pokemon": {
    headline: "Keep your whole collection.",
    lede: "Pro keeps more than 250 cards and every deck list, and plays the TCG Companion together on two phones.",
  },
  "home-game-night": {
    headline: "Make your own party packs with AI.",
    lede: "Pro drafts packs from a theme you give it, like a Most Likely To deck about your family or a bingo card for the party.",
  },
};
// The welcome page's streaming section sends people to the same pitch as Streaming ▸ Get started.
FROM.welcome = FROM["streaming-get-started"];

/** A game space's "Chat rolls on stream" link (`?from=game-band-<space>`). */
const GAME_BAND: ProContext = {
  headline: "Let chat roll on your stream.",
  lede: "Pro connects Twitch: chat rolls picks and match setups for the game you're playing, and they show on your overlay.",
};

/** Any other AI tool (`?from=ai-<feature>` from AiGate): the allowance pitch. */
const AI_ANY: ProContext = {
  headline: "Keep going with the AI tools.",
  lede: "Free accounts get a few tries a day. Pro gives you a monthly allowance across every AI tool, from setups and plans to packs and recaps.",
};

export function proContextFor(from: string | null | undefined): ProContext | null {
  if (!from) return null;
  return FROM[from] ?? (from.startsWith("ai-") ? AI_ANY : from.startsWith("game-band-") ? GAME_BAND : null);
}

/** The keys a link may pass, for the test and for anyone adding a new gate. */
export const PRO_CONTEXT_KEYS = Object.keys(FROM);
