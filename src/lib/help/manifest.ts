/**
 * Single source of truth for the Help Center article catalog.
 *
 * Used by the landing page, sidebar nav, search component, and the sitemap.
 * Adding a new article is a two-step change: create its page.tsx, then
 * append an entry here.
 */

export type HelpCategoryId = "getting-started" | "pro" | "troubleshooting" | "account";

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
    description: "Host your first GameShuffle session — invite participants, run it, recap.",
    href: "/help/getting-started/your-first-session",
    category: "getting-started",
    keywords: ["session", "lobby", "randomizer", "first time", "getting started"],
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
