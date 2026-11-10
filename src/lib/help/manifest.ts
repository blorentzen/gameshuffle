/**
 * Single source of truth for the Help Center article catalog.
 *
 * Used by the landing page, sidebar nav, search component, and the sitemap.
 * Adding a new article is a two-step change: create its page.tsx, then
 * append an entry here.
 */

import { RANKED_CATEGORY, RANKED_HELP, RANKED_HELP_JA, RANKED_HELP_PUBLIC } from "./ranked";

export type HelpCategoryId =
  | "getting-started"
  | "apps"
  | "tournaments"
  | "competitive"
  | "streaming"
  | "community"
  | "pro"
  | "troubleshooting"
  | "account"
  | "ranked";

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
    blurb: "Create tournaments, pick a format, run multi-crew events, and follow a team series.",
  },
  {
    id: "competitive",
    label: "Competitive Mario Kart",
    blurb: "Time trials and reviewing times, lounge stats, the MMR card, wars, and the GameShuffle Competitive Discord app.",
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
    blurb: "What Pro unlocks, the free trial, managing your subscription, and supporting GameShuffle.",
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
    title: "How to use the Mario Party randomizers",
    description: "Roll the board, rules, turns, Bonus Stars, characters and minigames for Jamboree, Superstars and Mario Party 1 to 3.",
    href: "/help/apps/mario-party-randomizers",
    category: "apps",
    keywords: ["mario party", "jamboree", "superstars", "mario party 2", "mario party 3", "n64", "board", "bonus stars", "minigame", "set list", "lock", "collection"],
  },
  {
    id: "pokemon-randomizers",
    title: "How to use the Pokémon randomizers",
    description: "The random Pokémon generator, Pokémon Stadium rental teams for every cup, and the Fire Red & Leaf Green run challenge: catches, level caps, twists and shareable runs.",
    href: "/help/apps/pokemon-randomizers",
    category: "apps",
    keywords: ["pokemon", "pokémon", "random pokemon generator", "generator", "stadium", "stadium 2", "rental", "cup", "prime cup", "free battle", "fire red", "leaf green", "frlg", "run challenge", "nuzlocke", "level cap"],
  },
  {
    id: "goldeneye-randomizer",
    title: "How to use the GoldenEye 007 randomizer",
    description: "Roll a GoldenEye multiplayer match: scenario, map, weapons and length, plus a character for everyone.",
    href: "/help/apps/goldeneye-randomizer",
    category: "apps",
    keywords: ["goldeneye", "007", "n64", "multiplayer", "scenario", "map", "weapons", "oddjob", "golden gun", "license to kill"],
  },
  {
    id: "mario-kart-64-randomizer",
    title: "How to use the Mario Kart 64 randomizer",
    description: "Roll a different character for up to four players, races from all 16 tracks, battle courses and an item set for Mario Kart 64.",
    href: "/help/apps/mario-kart-64-randomizer",
    category: "apps",
    keywords: ["mario kart 64", "mk64", "n64", "character", "racer", "weight class", "tracks", "races", "battle", "battle courses", "items", "no duplicates", "saved setup"],
  },
  {
    id: "smash-ultimate-randomizer",
    title: "How to use the Smash Ultimate randomizer",
    description: "Fighters and costumes for up to eight players, stages and rules, Custom Smash, Squad Strike squads, and only the DLC you own.",
    href: "/help/apps/smash-ultimate-randomizer",
    category: "apps",
    keywords: ["smash", "smash ultimate", "super smash bros", "fighter randomizer", "random fighter", "costume", "stage", "competitive rules", "custom smash", "squad strike", "smashdown", "echo fighters", "dlc"],
  },
  {
    id: "hero-shooter-randomizers",
    title: "How to use the hero shooter randomizers",
    description: "Random heroes for up to six players, with role queue, Team-Up teams, no repeats across a night and a random map.",
    href: "/help/apps/hero-shooter-randomizers",
    category: "apps",
    keywords: ["overwatch", "marvel rivals", "hero randomizer", "hero roulette", "random hero", "role queue", "team-up", "tank", "support", "vanguard", "strategist", "random map", "no repeats"],
  },
  {
    id: "perfect-dark-randomizer",
    title: "How to use the Perfect Dark randomizer",
    description: "Roll a Perfect Dark Combat Simulator match: scenario, arena, weapons, time limit and simulants, plus a character for everyone.",
    href: "/help/apps/perfect-dark-randomizer",
    category: "apps",
    keywords: ["perfect dark", "n64", "combat simulator", "multiplayer", "scenario", "arena", "weapons", "simulants", "sims", "joanna", "teams", "new save"],
  },
  {
    id: "splatoon-randomizer",
    title: "How to use the Splatoon 3 randomizer",
    description: "Hand out Splatoon 3 weapon kits for up to eight players, roll modes and stages or a Salmon Run stage, and split Alpha and Bravo teams.",
    href: "/help/apps/splatoon-randomizer",
    category: "apps",
    keywords: ["splatoon", "splatoon 3", "weapon kit", "weapons", "sub", "special", "replicas", "stages", "turf war", "anarchy", "salmon run", "private battle", "teams", "no repeats"],
  },
  {
    id: "kirby-air-riders-randomizer",
    title: "How to use the Kirby Air Riders randomizer",
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
    title: "Live scoring",
    description: "Score a set of Mario Kart between friends live, in FFA or team modes, with everyone logging their own finish.",
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
    description: "Guess today's character from 130 across Nintendo: how the hints work, five guesses and a last chance, sharing, streaks and playing in Discord.",
    href: "/help/apps/daily-shuffle",
    category: "apps",
    keywords: ["daily", "daily shuffle", "puzzle", "guess", "streak", "wordle", "mario party", "mario kart world"],
  },
  {
    id: "trivia-nights",
    title: "Trivia Nights",
    description: "Host a pub-style quiz: pick a template, fill it from the question pack, run it from your phone while teams play on theirs and the TV shows the rest.",
    href: "/help/apps/trivia-nights",
    category: "apps",
    keywords: ["trivia", "quiz", "pub quiz", "trivia night", "host", "teams", "picture round", "confidence round", "final wager", "joker", "question pack", "answer line", "stream trivia", "chat trivia", "!a", "overlay"],
  },
  {
    id: "weekly-challenge",
    title: "The Weekly Challenge",
    description: "A new challenge every Monday: answer the survey and guess the crowd (or rank the Tier War), finish the game-night mission, climb the leaderboard.",
    href: "/help/apps/weekly-challenge",
    category: "apps",
    keywords: ["weekly", "weekly challenge", "survey", "chat brain", "guesses", "tier war", "tier list", "leaderboard", "badge", "mission", "agenda"],
  },
  {
    id: "daily-dex",
    title: "The Daily Dex",
    description: "Guess today's Pokémon from all 1,025 in five guesses and a last chance, and keep your streak.",
    href: "/help/apps/daily-dex",
    category: "apps",
    keywords: ["daily dex", "pokemon", "guess", "pokedex", "generation", "streak", "last chance", "letters", "card of the day"],
  },
  {
    id: "fire-round",
    title: "Fire Round",
    description: "The daily trivia quiz: one counted round a day against the clock, plus rounds by category any time.",
    href: "/help/apps/fire-round",
    category: "apps",
    keywords: ["fire round", "daily trivia", "trivia quiz", "heat", "multiple choice", "categories", "daily"],
  },
  {
    id: "daily-duel",
    title: "The Daily Duel and Trainer Road",
    description: "Duel the trainer of the day with Pokémon cards, then battle any trainer any time on Trainer Road.",
    href: "/help/apps/daily-duel",
    category: "apps",
    keywords: ["daily duel", "trainer road", "pokemon", "trainer", "gym leader", "energy", "par", "easy", "hard", "stars", "professor", "tools"],
  },
  {
    id: "daily-leaderboards",
    title: "Daily leaderboards and sharing",
    description: "How the dailies' day, week and month boards score, token prizes, playing as a guest, and sharing your result.",
    href: "/help/apps/daily-leaderboards",
    category: "apps",
    keywords: ["leaderboard", "daily", "points", "tokens", "guest", "share", "streak", "invite link", "referral"],
  },
  {
    id: "tcg-deck-lists",
    title: "Pokémon TCG deck lists",
    description: "Save your deck lists, check they're legal, see which cards you own, and play them in the companion.",
    href: "/help/apps/tcg-deck-lists",
    category: "apps",
    keywords: ["deck list", "pokemon tcg", "tcg live", "legal", "standard", "my collection", "paste deck", "companion"],
  },
  {
    id: "trivia-leagues",
    title: "Trivia leagues and crews",
    description: "Run a weekly trivia league, enter as your crew, and follow the standings.",
    href: "/help/apps/trivia-leagues",
    category: "apps",
    keywords: ["trivia league", "crew", "standings", "weekly trivia", "team", "season", "bar trivia"],
  },

  // Tournaments
  {
    id: "creating-a-tournament",
    title: "Creating a Tournament",
    description: "Set up a tournament from start to finish: format, tracks, rules, sign-ups, sharing, and archiving when it's over.",
    href: "/help/tournaments/creating-a-tournament",
    category: "tournaments",
    keywords: ["tournament", "create", "bracket", "organize", "host", "sign up", "registration", "championship", "draft", "archive", "share"],
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
  {
    id: "team-series",
    title: "Team series and the GS Summer Series",
    description: "How a team series works for players and viewers: the track draft, your card, the overlay and predictions.",
    href: "/help/tournaments/team-series",
    category: "tournaments",
    keywords: ["summer series", "series", "team series", "track draft", "ban", "protect", "predictions", "teams of two", "pov", "champions"],
  },

  {
    id: "swiss-and-deck-lists",
    title: "Swiss tournaments and deck lists",
    description: "Run a Swiss event: pairings, reporting results, the top cut, and Pokémon TCG deck lists.",
    href: "/help/tournaments/swiss-and-deck-lists",
    category: "tournaments",
    keywords: ["swiss", "pairings", "top cut", "standings", "tiebreakers", "deck lists", "pokemon tcg", "play pokemon", "bye", "drop"],
  },
  {
    id: "time-trial-tournaments",
    title: "Time trial tournaments",
    description: "Run a Mario Kart time trial event, or decide Swiss and bracket matches by time: clips, verifiers, stations at a venue, and the overlay.",
    href: "/help/tournaments/time-trial-tournaments",
    category: "tournaments",
    keywords: ["time trial", "time trials", "leaderboard", "groups", "cut", "run-off", "clips", "verifiers", "stations", "runner", "in person", "overlay", "mario kart"],
  },
  {
    id: "bracket-tools",
    title: "Free bracket tools",
    description: "Make a bracket, round robin or Swiss pairings with no account, share the link, print it, or run it live.",
    href: "/help/tournaments/bracket-tools",
    category: "tournaments",
    keywords: ["bracket generator", "bracket maker", "round robin", "swiss pairings", "single elimination", "double elimination", "print", "no account"],
  },

  // Competitive Mario Kart
  {
    id: "time-trials",
    title: "Time trials",
    description: "Add your best times on every Mario Kart 8 Deluxe and Mario Kart World track and every Kirby Air Riders course, get them verified, and climb the boards.",
    href: "/help/competitive/time-trials",
    category: "competitive",
    keywords: ["time trials", "tt", "best times", "screenshot", "verified", "unverified", "legacy", "clip", "vouch", "country", "import", "quaxly", "report", "boards", "200cc", "no mushrooms", "kirby air riders", "time attack", "air ride", "machine", "legendary"],
  },
  {
    id: "reviewing-times",
    title: "Reviewing time trials",
    description: "What reviewers and updaters check, how to verify clips, fix a typed time and settle reports, and how review access is given.",
    href: "/help/competitive/reviewing-times",
    category: "competitive",
    keywords: ["reviewer", "updater", "review queue", "verify", "clip checks out", "fix the time", "legacy proof", "legacy claims", "reports", "team tab", "review access"],
  },
  {
    id: "competitive-discord-app",
    title: "The GameShuffle Competitive Discord app",
    description: "Add the Competitive app for /tt, /mmr, /room, /result, /war and the other competitive Mario Kart commands.",
    href: "/help/competitive/competitive-discord-app",
    category: "competitive",
    keywords: ["discord", "competitive app", "/tt", "/mmr", "/room", "/result", "/war", "/table", "/cans", "save to gameshuffle", "moved", "slash commands"],
  },
  {
    id: "lounge-stats",
    title: "Lounge stats",
    description: "Look up any Mario Kart lounge player, confirm your own lounge name, and read your season.",
    href: "/help/competitive/lounge-stats",
    category: "competitive",
    keywords: ["lounge", "mkcentral", "mmr", "season", "division", "confirm", "partners", "compare", "head to head", "nights", "tiers"],
  },
  {
    id: "mmr-card",
    title: "The MMR card",
    description: "Show your lounge MMR on stream, live, in the look you pick.",
    href: "/help/competitive/mmr-card",
    category: "competitive",
    keywords: ["mmr card", "obs", "overlay", "lounge", "division", "rolling", "goal", "recap", "!mmr", "layouts"],
  },
  {
    id: "wars",
    title: "Wars and the War room",
    description: "Score a clan war in Discord or on the web, play it in the War room, and show it on stream.",
    href: "/help/competitive/wars",
    category: "competitive",
    keywords: ["war", "clan war", "mogi", "/war", "war room", "scores", "war overlay", "/table", "/cans", "6v6"],
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
    id: "break-mode",
    title: "Break mode",
    description: "Step away and GameShuffle keeps chat playing: quick games on your overlay, points, and a break champion when you're back.",
    href: "/help/streaming/break-mode",
    category: "streaming",
    keywords: ["break mode", "brb", "!gs brb", "!gs back", "be right back", "break games", "words on stream", "higher or lower", "fact or fiction", "overlay"],
  },
  {
    id: "chat-brain-stream",
    title: "Chat Brain on stream",
    description: "Play Chat Brain boards on stream: chat as one team, a speed round, or 1v1 and teams with chat playing along. Add a prize or survey your chat.",
    href: "/help/streaming/chat-brain",
    category: "streaming",
    keywords: ["chat brain", "!cb", "!a", "survey", "!cb ask", "survey your chat", "1v1", "teams", "face-off", "steal", "trust chat", "play along", "speed round", "!cb start speed", "co-stream", "costream", "shared chat", "prize", "tokens", "live page", "guess what people said", "overlay"],
  },
  {
    id: "mods",
    title: "Mods for your stream",
    description: "Let your Twitch mods help run your stream: they join with one command, and you choose Standard or Full access for each.",
    href: "/help/streaming/mods",
    category: "streaming",
    keywords: ["mods", "moderators", "mod page", "!gs mod", "full access", "standard access", "kick", "lobby", "invite a mod"],
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
  {
    id: "stream-hub",
    title: "The stream hub",
    description: "Plan a stream, run it from the control room, and read the recap afterward.",
    href: "/help/streaming/stream-hub",
    category: "streaming",
    keywords: ["hub", "stream hub", "control room", "recap", "plan", "new stream", "live", "rolls", "running now"],
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
    title: "Your inbox",
    description: "Inbox: your alerts (follows, replies, invites, results) and reminders, and how to choose what reaches you.",
    href: "/help/community/comms-center",
    category: "community",
    keywords: ["notifications", "inbox", "comms", "alerts", "reminders", "bell"],
  },
  {
    id: "discord-bot",
    title: "The Discord Bot",
    description: "Add the bot, play the Daily inside Discord, route posts, announcements, self-assign roles, AutoMod, QOTD, and slash commands.",
    href: "/help/community/discord-bot",
    category: "community",
    keywords: ["discord", "bot", "servers", "multiple servers", "main server", "activity", "/gs-daily", "app launcher", "qotd", "automod", "announcements", "roles", "routing", "/gs-randomize", "/gs-poll", "slash commands"],
  },
  {
    id: "discord-alerts-and-reminders",
    title: "Go-live alerts, server replies and reminders",
    description: "Post go-live alerts for creators you pick, set up server replies with /gs-tag, and schedule reminders.",
    href: "/help/community/discord-alerts-and-reminders",
    category: "community",
    keywords: ["go-live alerts", "live alerts", "discord", "/gs-tag", "/gs-remind", "reminders", "server replies", "twitch"],
  },

  // Pro
  {
    id: "overview",
    title: "What is GameShuffle Pro?",
    description: "What GS Pro adds for streamers and organizers, how it compares with a free account, and what it costs.",
    href: "/help/pro/overview",
    category: "pro",
    keywords: ["pro", "subscription", "features", "pricing", "plans"],
  },
  {
    id: "free-trial",
    title: "Pro Free Trial",
    description: "How the 14-day GS Pro free trial works, when we remind you before it ends, and how to cancel any time.",
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
  {
    id: "supporting-gameshuffle",
    title: "Supporting GameShuffle",
    description: "Support GameShuffle once or monthly, what each support level includes, and the thank-yous supporters get.",
    href: "/help/pro/supporting-gameshuffle",
    category: "pro",
    keywords: ["support", "supporter", "backer", "champion", "monthly", "donate", "chip in", "credits", "badge"],
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
    description: "How to delete your GameShuffle account for good, what gets removed when you do, and what happens to a subscription.",
    href: "/help/account/deleting-account",
    category: "account",
    keywords: ["delete account", "remove data", "GDPR", "CCPA", "permanent deletion"],
  },
];

// GS Ranked's section joins the index, search and sitemap once it's announced (src/lib/help/ranked.ts).
if (RANKED_HELP_PUBLIC) {
  HELP_CATEGORIES.push(RANKED_CATEGORY);
  HELP_ARTICLES.push(...RANKED_HELP);
}

export function articlesInCategory(categoryId: HelpCategoryId): HelpArticleMeta[] {
  return HELP_ARTICLES.filter((a) => a.category === categoryId);
}

/** Any article, the GS Ranked pages included while they're unlisted. */
export function findArticle(href: string): HelpArticleMeta | undefined {
  return HELP_ARTICLES.find((a) => a.href === href) ?? RANKED_HELP.find((a) => a.href === href) ?? RANKED_HELP_JA.find((a) => a.href === href);
}

export function findCategory(categoryId: HelpCategoryId): HelpCategory | undefined {
  return HELP_CATEGORIES.find((c) => c.id === categoryId) ?? (categoryId === "ranked" ? RANKED_CATEGORY : undefined);
}
