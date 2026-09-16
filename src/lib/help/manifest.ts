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
    blurb: "The randomizers, competitive lounge scoring, and the TCG Companion.",
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
    description: "Shuffle karts, characters, and tracks for Mario Kart 8 Deluxe and Mario Kart World.",
    href: "/help/apps/randomizers",
    category: "apps",
    keywords: ["randomizer", "randomize", "kart", "combo", "shuffle", "tracks", "mk8dx", "mario kart world", "saved config", "setup"],
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
