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
    title: "Chat-driven randomizers",
    description:
      "Viewers reroll your kart with a chat command or channel points. Mario Kart 8 Deluxe and Mario Kart World, live on stream.",
    href: "/gs-pro",
    cta: "See it on Pro →",
    accent: "#2563eb",
  },
  {
    icon: "layout-list",
    title: "Overlay tools in OBS",
    description:
      "Wheels, an on-screen 8-ball, community bingo, tier lists, and a chat timeline composite straight into your scene and react to chat.",
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
    iconSrc: "/images/icons/discord.svg",
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
