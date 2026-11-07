"use client";

/**
 * Account ▸ Discord (menus and account picks 2026-11-05, 4A): both Discord apps in one place, by server. Servers (add
 * the bot, the default channel, and the Mario Kart bot's servers through the app switch) · Posts & roles (Channels &
 * posts · Roles · AutoMod & logs · Question of the Day · Server replies). These were Streaming ▸ Setup ▸ Discord and
 * Streaming ▸ Discord bot; the tab ids are unchanged, so old links forward here. A free account gets Servers and
 * Channels & posts (one server works on Free); the rest is GS Pro.
 */

import { SectionTabs, type ScreenMap } from "@/components/account/SectionTabs";
import { AdminScreen } from "@/components/account/admin/AdminKit";
import { DiscordBotRoutingCard } from "@/components/account/DiscordBotRoutingCard";
import { DiscordBotTab } from "@/components/account/DiscordBotTab";
import { DiscordAppSwitch } from "@/components/account/discord/DiscordAppSwitch";
import { DiscordTags } from "@/components/account/discord/DiscordTags";

/** A screen around an older tab component (its own title repeat is hidden in CSS). */
function Wrap({ title, intro, children }: { title: string; intro?: string; children: React.ReactNode }) {
  return <AdminScreen title={title} intro={intro} className="admin-screen--wrap">{children}</AdminScreen>;
}

const INTRO = {
  servers: "Add a bot to your server and pick where its posts go. Settings are per server.",
  posts: "Which channel each kind of post goes to, and announcements you write yourself. Settings are per server.",
  roles: "Roles members pick for themselves, roles new members get, and a role for your GS Pro members.",
  moderation: "Block words with Discord's own AutoMod, and log edits, deletes, joins and role changes to a channel.",
  qotd: "A daily question for your server, posted at the hour you pick.",
  tags: "Short replies members post with /gs-tag: rules, links, how to join. Every server you run the bot in shares them.",
};

export function DiscordTabs({ isPro }: { isPro: boolean }) {
  const screens: ScreenMap = {
    discord: () => <Wrap title="Servers" intro={INTRO.servers}><DiscordAppSwitch><DiscordBotRoutingCard /></DiscordAppSwitch></Wrap>,
    "discord-bot": () => <Wrap title="Channels & posts" intro={INTRO.posts}><DiscordBotTab part="posts" /></Wrap>,
    ...(isPro ? {
      "discord-roles": () => <Wrap title="Roles" intro={INTRO.roles}><DiscordBotTab part="roles" /></Wrap>,
      "discord-automod": () => <Wrap title="AutoMod & logs" intro={INTRO.moderation}><DiscordBotTab part="moderation" /></Wrap>,
      "discord-qotd": () => <Wrap title="Question of the Day" intro={INTRO.qotd}><DiscordBotTab part="qotd" /></Wrap>,
      "discord-tags": () => <Wrap title="Server replies" intro={INTRO.tags}><DiscordTags /></Wrap>,
    } : {}),
  };
  return <SectionTabs route="/account/discord" screens={screens} />;
}
