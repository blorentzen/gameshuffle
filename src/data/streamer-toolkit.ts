import type { IconName } from "@empac/cascadeds";

/**
 * The streamer toolkit at a glance — shared across the streamer marketing pages
 * (/for-streamers hub + the current/aspiring deep-dives) so the feature list
 * stays in one place. Each card links to the relevant surface.
 */
export interface ToolkitItem {
  icon?: IconName;
  iconSrc?: string;
  title: string;
  description: string;
  href: string;
  cta: string;
  accent: string;
}

export const STREAMER_TOOLKIT: ToolkitItem[] = [
  {
    icon: "bolt",
    title: "Chat rolls for every game",
    description:
      "Viewers roll their pick from the game you're streaming: Mario Kart, Smash, Mario Party, Splatoon, Kirby Air Riders, Overwatch, Marvel Rivals and more. !gs setup rolls the match itself.",
    href: "/gs-pro",
    cta: "See it on Pro →",
    accent: "#2563eb",
  },
  {
    icon: "layout-list",
    title: "Overlay tools in OBS",
    description:
      "Wheels, timers, an on-screen 8-ball, bingo, tier lists, chat drafts and a chat timeline composite straight into your scene and react to chat.",
    href: "/gs-pro",
    cta: "See it on Pro →",
    accent: "#7c3aed",
  },
  {
    icon: "rosette",
    title: "Channel-point rewards",
    description:
      "Wire your channel points to real actions: reroll the streamer, trigger a spin, fire an event. Redemptions play out on screen.",
    href: "/gs-pro",
    cta: "See it on Pro →",
    accent: "#db2777",
  },
  {
    icon: "chart-bar",
    title: "An economy your chat plays",
    description:
      "Arcade Tokens are a closed-loop currency your regulars earn by showing up and spend on markets, bounties, and awards. No real money.",
    href: "/gs-pro",
    cta: "See it on Pro →",
    accent: "#e0a106",
  },
  {
    icon: "checks",
    title: "Live polls your chat votes in",
    description:
      "Open one poll everywhere at once: dashboard, chat, and Discord all feed one live tally that renders on your overlay.",
    href: "/gs-pro",
    cta: "See it on Pro →",
    accent: "#0ea5e9",
  },
  {
    icon: "users",
    title: "Games with your chat",
    description:
      "Stream Bingo with prizes, Chat Draft where chat picks your team, and Who Said It? from your quote pool. GameShuffle Originals built for chat.",
    href: "/gs-pro",
    cta: "See it on Pro →",
    accent: "#ea580c",
  },
  {
    icon: "sparkles",
    title: "AI that drafts for you",
    description:
      "Wheel slices, bingo squares, tier lists and recap posts written from a theme or from what happened on stream. You approve everything.",
    href: "/gs-pro",
    cta: "See it on Pro →",
    accent: "#4f46e5",
  },
  {
    iconSrc: "/images/icons/discord.svg",
    title: "Discord bot and Activity",
    description:
      "Your server plays the Daily, the Weekly and Chat Brain together, results land in the channel as squares, and Pro adds polls, routing, roles and AutoMod.",
    href: "/discord",
    cta: "See the Discord bot →",
    accent: "#5865f2",
  },
  {
    icon: "layout-grid",
    title: "Cross-platform sessions",
    description:
      "One game night, everywhere. Twitch and Discord share the same lobby, picks, and results, with one overlay and one set of commands.",
    href: "/gs-pro",
    cta: "See it on Pro →",
    accent: "#5865f2",
  },
  {
    icon: "award",
    title: "Tournaments and series",
    description:
      "Run a bracket, a points night, the Heat to Mains ladder, or a full championship season with standings and build rules.",
    href: "/tournament",
    cta: "Browse tournaments →",
    accent: "#16a34a",
  },
  {
    icon: "layout-grid",
    title: "A public page for your community",
    description:
      "Your /live page shows the current game night in real time so viewers can join, reroll, vote, and predict from any device.",
    href: "/gs-pro",
    cta: "See it on Pro →",
    accent: "#2563eb",
  },
];
