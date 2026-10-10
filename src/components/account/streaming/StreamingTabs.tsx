"use client";

/**
 * The Streaming section (/account/streaming): Stream Setup and Community &
 * Chat merged on 2026-10-09 (mockups https://claude.ai/artifact/K23oSsSY9FJvFBKfVTfX6S).
 *
 *   Setup       Twitch · Discord · YouTube & Kick · Schedule · Mods
 *   Discord bot Channels & posts · Roles · AutoMod & logs · Question of the Day
 *   Overlay     Layout · Tool looks · Wheels · Chat feed
 *   Chat        Commands · Built-in · Modules · Game defaults
 *   Live games  Polls · Bingo · Chat Draft · Chat Brain
 *   Viewers     Engagement · Walk-up songs
 *
 * Free accounts get Get started and the Discord bot's first tab (one server
 * works on Free); every other screen is left out of the map, so its tab and
 * sidebar item don't show. Views and tab ids live in src/lib/account/nav.ts.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconCheck } from "@tabler/icons-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { SectionTabs, type ScreenMap } from "@/components/account/SectionTabs";
import { AdminScreen, AdminSection } from "@/components/account/admin/AdminKit";
import { ProUpgradeCtaButtons } from "@/components/account/ProUpgradeCtaButtons";
import { useToast } from "@/components/toast/ToastProvider";
import { useTrialEligibility } from "@/components/billing/useTrialEligibility";
import { TwitchHubTab } from "@/components/account/TwitchHubTab";
import { DiscordBotRoutingCard } from "@/components/account/DiscordBotRoutingCard";
import { YouTubeConnectCard } from "@/components/account/YouTubeConnectCard";
import { IntegrationCard } from "@/components/account/IntegrationCard";
import { StreamScheduleEditor } from "@/components/account/StreamScheduleEditor";
import { ModsTab } from "@/components/account/ModsTab";
import { DiscordBotTab } from "@/components/account/DiscordBotTab";
import { OverlayLayoutTab } from "@/components/account/OverlayLayoutTab";
import { StreamToolsTab } from "@/components/account/StreamToolsTab";
import { WheelsTab } from "@/components/account/WheelsTab";
import { ChatOverlaySettings } from "@/components/account/ChatOverlaySettings";
import { ChatCommandsTab } from "@/components/account/ChatCommandsTab";
import { CommunityTab } from "@/components/account/CommunityTab";
import { GameModulesTab } from "@/components/account/GameModulesTab";
import { PollsTab } from "@/components/account/PollsTab";
import { StreamBingoTab } from "@/components/account/StreamBingoTab";
import { ChatDraftTab } from "@/components/account/ChatDraftTab";
import { ChatBrainStreamTab } from "@/components/account/ChatBrainStreamTab";
import { EngagementTab } from "@/components/account/EngagementTab";
import { ChannelAnthemSettings } from "@/components/account/ChannelAnthemSettings";

/** A screen around an older tab component (its own title repeat is hidden in CSS). */
function Wrap({ title, intro, children }: { title: string; intro?: string; children: React.ReactNode }) {
  return <AdminScreen title={title} intro={intro} className="admin-screen--wrap">{children}</AdminScreen>;
}

function KickCard() {
  return (
    <IntegrationCard
      title="Kick"
      description="Bring GameShuffle lobbies to your Kick chat. Same commands, same overlay, same randomizer."
      status={{ label: "Coming soon", kind: "coming_soon" }}
      muted
    />
  );
}

const DISCORD_INTRO = {
  posts: "Which channel each kind of post goes to, and announcements you write yourself. Settings are per server.",
  roles: "Roles members pick for themselves, roles new members get, and a role for your GS Pro members.",
  moderation: "Block words with Discord's own AutoMod, and log edits, deletes, joins and role changes to a channel.",
  qotd: "A daily question for your server, posted at the hour you pick.",
};

function proScreens(profileTimezone: string | null): ScreenMap {
  return {
    integrations: () => <Wrap title="Twitch" intro="Your channel's connection, the bot in your chat, and channel points."><TwitchHubTab /></Wrap>,
    discord: () => <Wrap title="Discord" intro="Add the GameShuffle bot to your server and pick where its posts go."><DiscordBotRoutingCard /></Wrap>,
    youtube: () => <YouTubeKickScreen />,
    schedule: () => (
      <AdminScreen title="Schedule" intro="Your regular stream times. They show as a countdown and a weekly grid on your profile, community page and live page.">
        <StreamScheduleEditor bare profileTimezone={profileTimezone} />
      </AdminScreen>
    ),
    mods: () => <Wrap title="Mods"><ModsTab bare /></Wrap>,
    "discord-bot": () => <Wrap title="Channels & posts" intro={DISCORD_INTRO.posts}><DiscordBotTab part="posts" /></Wrap>,
    "discord-roles": () => <Wrap title="Roles" intro={DISCORD_INTRO.roles}><DiscordBotTab part="roles" /></Wrap>,
    "discord-automod": () => <Wrap title="AutoMod & logs" intro={DISCORD_INTRO.moderation}><DiscordBotTab part="moderation" /></Wrap>,
    "discord-qotd": () => <Wrap title="Question of the Day" intro={DISCORD_INTRO.qotd}><DiscordBotTab part="qotd" /></Wrap>,
    "overlay-layout": () => (
      <Wrap title="Layout" intro="Drag each piece where you want it on your OBS overlay, shown at real size with sample data. Each shape (16:9, 9:16) saves on its own; press Save when it looks right.">
        <OverlayLayoutTab bare />
      </Wrap>
    ),
    "stream-tools": () => <StreamToolsTab />,
    wheels: () => <Wrap title="Wheels" intro="Build wheels and spin them on your overlay, from the Hub or with !spin in chat. The default wheel is the one !spin uses."><WheelsTab bare /></Wrap>,
    "chat-feed": () => <Wrap title="Chat feed"><ChatOverlaySettings /></Wrap>,
    "chat-commands": () => <ChatCommandsTab part="custom" />,
    "built-in": () => <ChatCommandsTab part="builtin" />,
    community: () => <Wrap title="Modules"><CommunityTab /></Wrap>,
    "game-modules": () => <Wrap title="Game defaults"><GameModulesTab /></Wrap>,
    polls: () => <PollsTab />,
    bingo: () => <Wrap title="Bingo"><StreamBingoTab /></Wrap>,
    draft: () => <Wrap title="Chat Draft"><ChatDraftTab /></Wrap>,
    "chat-brain": () => <Wrap title="Chat Brain"><ChatBrainStreamTab /></Wrap>,
    engagement: () => <Wrap title="Engagement"><EngagementTab /></Wrap>,
    anthems: () => (
      <Wrap title="Walk-up songs" intro="Let viewers walk out to their own song when they show up in your chat. Viewers pick their song on their profile; you choose who gets one, when it plays and how loud.">
        <ChannelAnthemSettings bare />
      </Wrap>
    ),
  };
}

function YouTubeKickScreen() {
  const router = useRouter();
  return (
    <Wrap title="YouTube & Kick" intro="Run the same lobbies, commands and overlay on more platforms.">
      <YouTubeConnectCard onLearnMore={() => router.push("/account?tab=plans")} />
      <KickCard />
    </Wrap>
  );
}

const UNLOCKS = [
  "Chat rolls for every game",
  "An OBS overlay in your theme",
  "Polls on Twitch, Discord and your page",
  "Stream Bingo and Chat Draft",
  "Chat Brain on stream",
  "Channel point rerolls",
  "Wheels spun from chat",
  "The Discord bot on up to 5 servers",
  "AI packs and recaps",
];

/** What a free account sees: what streaming with GameShuffle does, then the trial. */
function GetStartedScreen() {
  const { user } = useAuth();
  const toast = useToast();
  const who = useTrialEligibility();
  const twitchLinked = !!user?.identities?.some((i) => i.provider === "twitch");
  const steps = [
    { done: twitchLinked, title: "Link Twitch", body: twitchLinked ? "Done." : <>Free, on <Link href="/account?tab=security">Settings ▸ Sign-in &amp; security</Link>.</> },
    { done: false, title: who?.hasUsedTrial ? "Start GS Pro" : "Start your trial", body: "Unlocks the bot, the overlay and channel points." },
    { done: false, title: "Add the overlay to OBS", body: "One link, sized for your stream." },
  ];
  return (
    <AdminScreen title="Stream with GameShuffle" intro="Turn your stream into game night: viewers join from chat, roll their own picks, vote, play bingo and drafts, and it all shows on your overlay.">
      <div className="streaming-hero">
        <span className="streaming-hero__badge">GS Pro</span>
        <p className="streaming-hero__terms">{who?.hasUsedTrial ? "Upgrade any time, and cancel whenever you like." : "14 days free, then $9 a month. Cancel any time before it ends and you won't be charged."}</p>
        <ProUpgradeCtaButtons hasUsedTrial={who?.hasUsedTrial} from="streaming-get-started" onError={(m) => toast.error(m)} />
        <Link href="/gs-pro?from=streaming-get-started" className="streaming-hero__more">See everything in GS Pro</Link>
      </div>
      <AdminSection title="Three steps">
        <ol className="streaming-steps">
          {steps.map((s, i) => (
            <li key={s.title} className={`streaming-step${s.done ? " is-done" : ""}`}>
              <span className="streaming-step__num" aria-hidden>{s.done ? <IconCheck size={14} /> : i + 1}</span>
              <strong>{s.title}</strong>
              <span>{s.body}</span>
            </li>
          ))}
        </ol>
      </AdminSection>
      <AdminSection title="What you get">
        <ul className="streaming-unlocks">
          {UNLOCKS.map((u) => <li key={u}><IconCheck size={16} aria-hidden />{u}</li>)}
        </ul>
        <p className="admin-field__help">The Discord bot already works on one server with a free account: see Discord bot in the menu.</p>
      </AdminSection>
    </AdminScreen>
  );
}

const FREE_SCREENS: ScreenMap = {
  "get-started": () => <GetStartedScreen />,
  "discord-bot": () => <Wrap title="Discord bot" intro="The GameShuffle bot posts to one channel in one server on a free account."><DiscordBotTab part="posts" /></Wrap>,
};

export function StreamingTabs({ isPro, profileTimezone }: { isPro: boolean; profileTimezone: string | null }) {
  return <SectionTabs route="/account/streaming" screens={isPro ? proScreens(profileTimezone) : FREE_SCREENS} />;
}
