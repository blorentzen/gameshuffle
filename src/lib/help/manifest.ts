/**
 * Single source of truth for the Help Center article catalog.
 *
 * Used by the landing page, sidebar nav, search component, and the sitemap.
 * Adding a new article is a two-step change: create its page.tsx, then
 * append an entry here.
 */

export type HelpCategoryId =
  | "getting-started"
  | "apps"
  | "tournaments"
  | "streaming"
  | "community"
  | "pro"
  | "troubleshooting"
  | "account";

export interface HelpArticleMeta {
  id: string;
  title: string;
  description: string;
  href: string;
  category: HelpCategoryId;
  /** Free-text keywords for client-side search. */
  keywords: string[];
}

export interface HelpCategory {
  id: HelpCategoryId;
  label: string;
  blurb: string;
}

export const HELP_CATEGORIES: HelpCategory[] = [
  {
    id: "getting-started",
    label: "Getting Started",
    blurb: "Account setup, integrations, and your first session.",
  },
  {
    id: "apps",
    label: "Apps & Tools",
    blurb: "The randomizers, game nights and party games, the Originals, AI tools, lounge scoring and the TCG Companion.",
  },
  {
    id: "tournaments",
    label: "Tournaments",
    blurb: "Create tournaments, pick a format, and run multi-crew events.",
  },
  {
    id: "streaming",
    label: "Streaming & Overlay",
    blurb: "Set up your OBS overlay and drive your stream from chat.",
  },
  {
    id: "community",
    label: "Community",
    blurb: "Communities, crews, your public profile, messages, and the Discord bot.",
  },
  {
    id: "pro",
    label: "GameShuffle Pro",
    blurb: "What Pro unlocks, the free trial, and managing your subscription.",
  },
  {
    id: "troubleshooting",
    label: "Troubleshooting",
    blurb: "Login issues, integration problems, and common fixes.",
  },
  {
    id: "account",
    label: "Account",
    blurb: "Email preferences, deleting your account, and privacy.",
  },
];

export const HELP_ARTICLES: HelpArticleMeta[] = [
  // Getting Started
  {
    id: "creating-an-account",
    title: "Creating an Account",
    description: "Sign up with email or your Twitch / Discord account in under a minute.",
    href: "/help/getting-started/creating-an-account",
    category: "getting-started",
    keywords: ["signup", "register", "account", "verify email", "age confirmation"],
  },
  {
    id: "connecting-twitch",
    title: "Connecting Your Twitch Account",
    description: "Connect Twitch to unlock the bot, channel-point reward, and OBS overlay.",
    href: "/help/getting-started/connecting-twitch",
    category: "getting-started",
    keywords: ["twitch", "integration", "oauth", "connect", "streaming", "chat bot", "eventsub"],
  },
  {
    id: "connecting-discord",
    title: "Connecting Your Discord Account",
    description: "Link Discord for bot commands, slash commands, and community coordination.",
    href: "/help/getting-started/connecting-discord",
    category: "getting-started",
    keywords: ["discord", "integration", "oauth", "bot", "slash commands"],
  },
  {
    id: "your-first-session",
    title: "Your First Session",
    description: "Host your first GameShuffle session: invite participants, run it, recap.",
    href: "/help/getting-started/your-first-session",
    category: "getting-started",
    keywords: ["session", "lobby", "randomizer", "first time", "getting started"],
  },

  // Apps & Tools
  {
    id: "randomizers",
    title: "Using the Randomizers",
    description: "How every randomizer works: rolling, options, locks, the rolling animation, saving and copying, for every game GameShuffle covers.",
    href: "/help/apps/randomizers",
    category: "apps",
    keywords: ["randomizer", "randomize", "kart", "combo", "shuffle", "tracks", "mk8dx", "mario kart world", "saved config", "setup", "options", "lock", "rolling animation", "all randomizers"],
  },
  {
    id: "mario-party-randomizers",
    title: "The Mario Party randomizers",
    description: "Roll the board, rules, turns, Bonus Stars, characters and minigames for Jamboree, Superstars and Mario Party 1 to 3.",
    href: "/help/apps/mario-party-randomizers",
    category: "apps",
    keywords: ["mario party", "jamboree", "superstars", "mario party 2", "mario party 3", "n64", "board", "bonus stars", "minigame", "set list", "lock", "collection"],
  },
  {
    id: "pokemon-randomizers",
    title: "The Pokémon randomizers",
    description: "Pokémon Stadium rental teams for every cup, and the Fire Red & Leaf Green run challenge: catches, level caps, twists and shareable runs.",
    href: "/help/apps/pokemon-randomizers",
    category: "apps",
    keywords: ["pokemon", "pokémon", "stadium", "stadium 2", "rental", "cup", "prime cup", "free battle", "fire red", "leaf green", "frlg", "run challenge", "nuzlocke", "level cap"],
  },
  {
    id: "goldeneye-randomizer",
    title: "The GoldenEye 007 randomizer",
    description: "Roll a GoldenEye multiplayer match: scenario, map, weapons and length, plus a character for everyone.",
    href: "/help/apps/goldeneye-randomizer",
    category: "apps",
    keywords: ["goldeneye", "007", "n64", "multiplayer", "scenario", "map", "weapons", "oddjob", "golden gun", "license to kill"],
  },
  {
    id: "mario-kart-64-randomizer",
    title: "The Mario Kart 64 randomizer",
    description: "Roll a different character for up to four players, races from all 16 tracks, battle courses and an item set for Mario Kart 64.",
    href: "/help/apps/mario-kart-64-randomizer",
    category: "apps",
    keywords: ["mario kart 64", "mk64", "n64", "character", "racer", "weight class", "tracks", "races", "battle", "battle courses", "items", "no duplicates", "saved setup"],
  },
  {
    id: "smash-ultimate-randomizer",
    title: "The Smash Ultimate randomizer",
    description: "Fighters and costumes for up to eight players, stages and rules, Custom Smash, Squad Strike squads, and only the DLC you own.",
    href: "/help/apps/smash-ultimate-randomizer",
    category: "apps",
    keywords: ["smash", "smash ultimate", "super smash bros", "fighter randomizer", "random fighter", "costume", "stage", "competitive rules", "custom smash", "squad strike", "smashdown", "echo fighters", "dlc"],
  },
  {
    id: "hero-shooter-randomizers",
    title: "The Overwatch and Marvel Rivals randomizers",
    description: "Random heroes for up to six players, with role queue, Team-Up teams, no repeats across a night and a random map.",
    href: "/help/apps/hero-shooter-randomizers",
    category: "apps",
    keywords: ["overwatch", "marvel rivals", "hero randomizer", "hero roulette", "random hero", "role queue", "team-up", "tank", "support", "vanguard", "strategist", "random map", "no repeats"],
  },
  {
    id: "perfect-dark-randomizer",
    title: "The Perfect Dark randomizer",
    description: "Roll a Perfect Dark Combat Simulator match: scenario, arena, weapons, time limit and simulants, plus a character for everyone.",
    href: "/help/apps/perfect-dark-randomizer",
    category: "apps",
    keywords: ["perfect dark", "n64", "combat simulator", "multiplayer", "scenario", "arena", "weapons", "simulants", "sims", "joanna", "teams", "new save"],
  },
  {
    id: "splatoon-randomizer",
    title: "The Splatoon 3 randomizer",
    description: "Hand out Splatoon 3 weapon kits for up to eight players, roll modes and stages or a Salmon Run stage, and split Alpha and Bravo teams.",
    href: "/help/apps/splatoon-randomizer",
    category: "apps",
    keywords: ["splatoon", "splatoon 3", "weapon kit", "weapons", "sub", "special", "replicas", "stages", "turf war", "anarchy", "salmon run", "private battle", "teams", "no repeats"],
  },
  {
    id: "kirby-air-riders-randomizer",
    title: "The Kirby Air Riders randomizer",
    description: "Put up to eight players on a random rider and machine, roll an Air Ride or Top Ride course and pick the City Trial Stadium.",
    href: "/help/apps/kirby-air-riders-randomizer",
    category: "apps",
    keywords: ["kirby", "kirby air riders", "air ride", "top ride", "city trial", "stadium", "riders", "machines", "legendary", "warp star", "new save", "switch 2"],
  },
  {
    id: "ai-tools",
    title: "AI tools",
    description: "Make wheels, bingo prompts and party packs from a theme, write recaps, set up randomizers in plain words, plan a night and draft a tournament.",
    href: "/help/apps/ai-tools",
    category: "apps",
    keywords: ["ai", "claude", "anthropic", "generate", "content pack", "recap", "describe your night", "night planner", "tournament helper", "allowance", "privacy"],
  },
  {
    id: "competitive-lounge",
    title: "Competitive Lounge Scoring",
    description: "Run normalized live scoring for a Mario Kart 8 Deluxe lounge across FFA and team modes.",
    href: "/help/apps/competitive-lounge",
    category: "apps",
    keywords: ["competitive", "lounge", "scoring", "placements", "ffa", "teams", "live scoring", "mk8dx"],
  },
  {
    id: "tcg-companion",
    title: "TCG Companion",
    description: "A digital accessory kit for tabletop card games, with Pokemon Mode and a card collection.",
    href: "/help/apps/tcg-companion",
    category: "apps",
    keywords: ["tcg", "companion", "pokemon", "damage counter", "coin flip", "dice", "prize", "my cards", "collection", "scrydex"],
  },
  {
    id: "live-game-nights",
    title: "Live game nights",
    description: "Run a night on everyone's phones: join by code, the TV view, one scoreboard, The Gauntlet, Chaos Cup, Hidden Agendas, Call It and King of the Couch.",
    href: "/help/apps/live-game-nights",
    category: "apps",
    keywords: ["live night", "party night", "game night", "room code", "tv", "scoreboard", "mvp", "gauntlet", "chaos cup", "hidden agendas", "call it", "wheel of consequences", "king of the couch", "crown"],
  },
  {
    id: "party-games",
    title: "Party games on your phones",
    description: "How to play Odd One Out, Most Likely To, Tier Wars, Draft Night and Number Bingo, and how each one scores.",
    href: "/help/apps/party-games",
    category: "apps",
    keywords: ["odd one out", "most likely to", "tier wars", "draft night", "draft", "bingo", "number bingo", "party games", "originals"],
  },
  {
    id: "daily-shuffle",
    title: "The Daily Shuffle",
    description: "Guess today's character in six tries, rotating through Mario Kart and Mario Party: the schedule, hints, sharing and streaks.",
    href: "/help/apps/daily-shuffle",
    category: "apps",
    keywords: ["daily", "daily shuffle", "puzzle", "guess", "streak", "wordle", "mario party", "mario kart world"],
  },
  {
    id: "weekly-challenge",
    title: "The Weekly Challenge",
    description: "A new challenge every Monday: rank the Tier War like the crowd, finish the game-night mission, climb the leaderboard.",
    href: "/help/apps/weekly-challenge",
    category: "apps",
    keywords: ["weekly", "weekly challenge", "tier war", "tier list", "leaderboard", "badge", "mission", "agenda"],
  },

  // Tournaments
  {
    id: "creating-a-tournament",
    title: "Creating a Tournament",
    description: "Set up a tournament from start to finish: format, tracks, rules, and sign-ups.",
    href: "/help/tournaments/creating-a-tournament",
    category: "tournaments",
    keywords: ["tournament", "create", "bracket", "organize", "host", "sign up", "registration", "championship"],
  },
  {
    id: "tournament-formats",
    title: "Tournament Formats",
    description: "FFA points, round robin, single/double elimination, heat to mains, and more.",
    href: "/help/tournaments/tournament-formats",
    category: "tournaments",
    keywords: ["format", "ffa points", "round robin", "single elimination", "double elimination", "heat mains", "bracket", "flights", "group knockout"],
  },
  {
    id: "multi-crew-tournaments",
    title: "Running a Multi-Crew Tournament",
    description: "Have communities battle as crews, with standings that roll up live on your overlay.",
    href: "/help/tournaments/multi-crew-tournaments",
    category: "tournaments",
    keywords: ["crew", "crews", "multi-crew", "community", "crew standings", "!crews", "team", "represent"],
  },

  // Streaming & Overlay
  {
    id: "obs-overlay",
    title: "Setting Up Your OBS Overlay",
    description: "Add your GameShuffle overlay to OBS and arrange your tools for 16:9 and 9:16.",
    href: "/help/streaming/obs-overlay",
    category: "streaming",
    keywords: ["obs", "overlay", "browser source", "stream", "layout", "overlay layout", "placement", "vertical", "portrait"],
  },
  {
    id: "chat-commands",
    title: "Twitch Chat Command Reference",
    description: "Every GameShuffle chat command: viewer lobby, stream tools, tournaments, tokens, and more.",
    href: "/help/streaming/chat-commands",
    category: "streaming",
    keywords: ["chat commands", "commands", "!gs", "!shuffle", "!spin", "!bet", "!crews", "!poll", "mod commands", "twitch bot"],
  },
  {
    id: "wheels",
    title: "Using the Wheel",
    description: "The free wheel spinner plus the Pro overlay wheel your chat spins from Twitch.",
    href: "/help/streaming/wheels",
    category: "streaming",
    keywords: ["wheel", "wheel spinner", "spin", "!spin", "!wheel", "overlay wheel", "raffle", "picker", "themes"],
  },
  {
    id: "polls",
    title: "Live Polls",
    description: "Run one poll across your dashboard, Twitch chat, Discord, and your OBS overlay.",
    href: "/help/streaming/polls",
    category: "streaming",
    keywords: ["poll", "polls", "!poll", "!vote", "voting", "live poll", "overlay poll", "discord poll"],
  },
  {
    id: "who-said-it",
    title: "Who Said It?",
    description: "Turn your !quote pool into a chat game: add quotes with a speaker, then run !whosaid.",
    href: "/help/streaming/who-said-it",
    category: "streaming",
    keywords: ["who said it", "!whosaid", "quote", "!quote", "quotes", "speaker", "chat game"],
  },
  {
    id: "stream-bingo",
    title: "Stream Bingo",
    description: "Number bingo for your viewers: cards on your live page, calls from chat or a timer, and a prize for the winner.",
    href: "/help/streaming/stream-bingo",
    category: "streaming",
    keywords: ["bingo", "stream bingo", "!bingo", "number bingo", "bingo card", "patterns", "blackout", "prize", "overlay"],
  },
  {
    id: "chat-draft",
    title: "Chat Draft",
    description: "Chat drafts your Pokémon team, Mario Kart combo or track list one vote at a time, live on your overlay.",
    href: "/help/streaming/chat-draft",
    category: "streaming",
    keywords: ["draft", "chat draft", "!draft", "pokemon", "pokémon team", "scarlet violet", "champions", "kart combo", "track list", "vote"],
  },
  {
    id: "token-economy",
    title: "The Token Economy",
    description: "Arcade Tokens, prediction markets, awards, bounties, and leaderboards for your chat.",
    href: "/help/streaming/token-economy",
    category: "streaming",
    keywords: ["tokens", "economy", "arcade tokens", "prediction markets", "!bet", "!give", "awards", "bounties", "leaderboard", "currency"],
  },

  // Community
  {
    id: "communities-and-crews",
    title: "Communities & Crews",
    description: "Your auto-created community page, joining others, and building game crews.",
    href: "/help/community/communities-and-crews",
    category: "community",
    keywords: ["community", "communities", "crew", "crews", "join community", "represent", "crew battle", "/c"],
  },
  {
    id: "public-profile",
    title: "Your Public Profile & Personalization",
    description: "Set up your /u profile, personalize it with an accent and featured content, and pick a theme.",
    href: "/help/community/public-profile",
    category: "community",
    keywords: ["profile", "public profile", "/u", "personalize", "accent", "brand theme", "banner", "bio", "favorite games", "dark mode", "theme"],
  },
  {
    id: "comms-center",
    title: "Notifications & Messages",
    description: "The Comms Center: your alerts and your direct messages, and how DMs work.",
    href: "/help/community/comms-center",
    category: "community",
    keywords: ["notifications", "messages", "dm", "direct message", "comms", "alerts", "chat", "mutual follow"],
  },
  {
    id: "discord-bot",
    title: "The Discord Bot",
    description: "Route posts, announcements, self-assign roles, AutoMod, QOTD, and slash commands.",
    href: "/help/community/discord-bot",
    category: "community",
    keywords: ["discord", "bot", "qotd", "automod", "announcements", "roles", "routing", "/gs-randomize", "/gs-poll", "slash commands"],
  },

  // Pro
  {
    id: "overview",
    title: "What is GameShuffle Pro?",
    description: "Everything Pro unlocks, the Free vs. Pro comparison, and pricing.",
    href: "/help/pro/overview",
    category: "pro",
    keywords: ["pro", "subscription", "features", "pricing", "plans"],
  },
  {
    id: "free-trial",
    title: "Pro Free Trial",
    description: "How the 14-day free trial works, reminders, and how to cancel.",
    href: "/help/pro/free-trial",
    category: "pro",
    keywords: ["free trial", "trial", "14 days", "payment method", "cancel before billed"],
  },
  {
    id: "managing-subscription",
    title: "Managing Your Subscription",
    description: "Update your card, view invoices, change billing details via the Stripe portal.",
    href: "/help/pro/managing-subscription",
    category: "pro",
    keywords: ["manage subscription", "payment method", "update card", "invoice", "billing portal"],
  },
  {
    id: "cancelling",
    title: "Cancelling Your Pro Subscription",
    description: "Cancel anytime. What happens after cancellation, and our refund policy.",
    href: "/help/pro/cancelling",
    category: "pro",
    keywords: ["cancel subscription", "refund", "end subscription", "downgrade"],
  },

  // Troubleshooting
  {
    id: "login-issues",
    title: "Login Issues",
    description: "Forgot password, email verification, OAuth sign-in problems, lockouts.",
    href: "/help/troubleshooting/login-issues",
    category: "troubleshooting",
    keywords: ["can't login", "login problem", "password reset", "account locked", "email verification"],
  },
  {
    id: "integration-issues",
    title: "Integration Issues",
    description: "Twitch bot not responding, Discord bot offline, missing slash commands, and more.",
    href: "/help/troubleshooting/integration-issues",
    category: "troubleshooting",
    keywords: ["twitch not working", "discord bot", "chat bot offline", "eventsub", "integration broken"],
  },

  // Account
  {
    id: "email-preferences",
    title: "Email Preferences",
    description: "Control which marketing, notification, and transactional emails you receive.",
    href: "/help/account/email-preferences",
    category: "account",
    keywords: ["email preferences", "marketing emails", "unsubscribe", "notifications"],
  },
  {
    id: "deleting-account",
    title: "Deleting Your Account",
    description: "Permanently delete your account and what gets removed when you do.",
    href: "/help/account/deleting-account",
    category: "account",
    keywords: ["delete account", "remove data", "GDPR", "CCPA", "permanent deletion"],
  },
];

export function articlesInCategory(categoryId: HelpCategoryId): HelpArticleMeta[] {
  return HELP_ARTICLES.filter((a) => a.category === categoryId);
}

export function findArticle(href: string): HelpArticleMeta | undefined {
  return HELP_ARTICLES.find((a) => a.href === href);
}

export function findCategory(categoryId: HelpCategoryId): HelpCategory | undefined {
  return HELP_CATEGORIES.find((c) => c.id === categoryId);
}
