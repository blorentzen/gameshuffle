"use client";

/**
 * The Streaming section (/account/streaming): Stream Setup and Community &
 * Chat merged on 2026-10-09 (mockups https://claude.ai/artifact/K23oSsSY9FJvFBKfVTfX6S).
 *
 *   Setup       Twitch · YouTube & Kick · Schedule · Mods (Discord moved to Account ▸ Discord, 2026-11-05)
 *   Overlay     Layout · Tool looks · Wheels · Chat feed
 *   Chat        Commands · Built-in · Modules · Game defaults
 *   Live games  Polls · Bingo · Chat Draft · Chat Brain
 *   Viewers     Engagement · Walk-up songs
 *
 * Free accounts get Get started; every other screen is left out of the map, so
 * its tab and sidebar item don't show. Views and tab ids live in src/lib/account/nav.ts.
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
import { ProTerms } from "@/components/billing/ProTerms";
import { TwitchHubTab } from "@/components/account/TwitchHubTab";
import { YouTubeConnectCard } from "@/components/account/YouTubeConnectCard";
import { IntegrationCard } from "@/components/account/IntegrationCard";
import { StreamScheduleEditor } from "@/components/account/StreamScheduleEditor";
import { ModsTab } from "@/components/account/ModsTab";
import { OverlayLayoutTab } from "@/components/account/OverlayLayoutTab";
import { StreamToolsTab } from "@/components/account/StreamToolsTab";
import { WheelsTab } from "@/components/account/WheelsTab";
import { ChatOverlaySettings } from "@/components/account/ChatOverlaySettings";
import { CommandsScreen } from "@/components/account/commands/CommandsScreen";
import { CommunityTab } from "@/components/account/CommunityTab";
import { GameModulesTab } from "@/components/account/GameModulesTab";
import { PollsTab } from "@/components/account/PollsTab";
import { StreamBingoTab } from "@/components/account/StreamBingoTab";
import { ChatDraftTab } from "@/components/account/ChatDraftTab";
import { ChatBrainStreamTab } from "@/components/account/ChatBrainStreamTab";
import { BreakModeTab } from "@/components/account/BreakModeTab";
import { EngagementTab } from "@/components/account/EngagementTab";
import { ChannelAnthemSettings } from "@/components/account/ChannelAnthemSettings";
import type { SetupStep } from "@/lib/streaming/setup";
import "@/styles/account-home.css";

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


export function proScreens(profileTimezone: string | null): ScreenMap {
  return {
    integrations: () => <Wrap title="Twitch" intro="Your channel's connection, the bot in your chat, and channel points."><TwitchHubTab /></Wrap>,
    youtube: () => <YouTubeKickScreen />,
    schedule: () => (
      <AdminScreen title="Schedule" intro="Your regular stream times. They show as a countdown and a weekly grid on your profile, community page and live page.">
        <StreamScheduleEditor bare profileTimezone={profileTimezone} />
      </AdminScreen>
    ),
    mods: () => <Wrap title="Mods"><ModsTab bare /></Wrap>,
    "overlay-layout": () => (
      <Wrap title="Layout" intro="Drag each piece where you want it on your OBS overlay, shown at real size with sample data. Each shape (16:9, 9:16) saves on its own; press Save when it looks right.">
        <OverlayLayoutTab bare />
      </Wrap>
    ),
    "stream-tools": () => <StreamToolsTab />,
    wheels: () => <Wrap title="Wheels" intro="Build wheels and spin them on your overlay, from the Hub or with !spin in chat. The default wheel is the one !spin uses."><WheelsTab bare /></Wrap>,
    "chat-feed": () => <Wrap title="Chat feed"><ChatOverlaySettings /></Wrap>,
    "chat-commands": () => <CommandsScreen />,
    community: () => <Wrap title="Modules"><CommunityTab /></Wrap>,
    "game-modules": () => <Wrap title="Game defaults"><GameModulesTab /></Wrap>,
    polls: () => <PollsTab />,
    bingo: () => <StreamBingoTab />,
    draft: () => <Wrap title="Chat Draft"><ChatDraftTab /></Wrap>,
    "chat-brain": () => <Wrap title="Chat Brain"><ChatBrainStreamTab /></Wrap>,
    "break-mode": () => (
      <Wrap title="Break mode" intro="Step away and GameShuffle keeps chat playing: quick games on your overlay, points, and a break champion when you're back.">
        <BreakModeTab />
      </Wrap>
    ),
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
export function GetStartedScreen() {
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
        <ProTerms className="streaming-hero__terms" hasUsedTrial={who?.hasUsedTrial} reassure />
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
        <p className="admin-field__help">The Discord bot already works on one server with a free account: see <Link href="/account/discord">Discord</Link>.</p>
      </AdminSection>
    </AdminScreen>
  );
}

const FREE_SCREENS: ScreenMap = {
  "get-started": () => <GetStartedScreen />,
};

/** GS Pro's setup checklist, on top of every Streaming screen until each step is done. */
function SetupChecklist({ steps }: { steps: SetupStep[] }) {
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return null;
  return (
    <section className="stream-setup" aria-labelledby="stream-setup-title">
      <h2 id="stream-setup-title">Finish setting up <span>{done} of {steps.length}</span></h2>
      <ol className="stream-setup__list">
        {steps.map((s, i) => (
          <li key={s.id} className={s.done ? "is-done" : undefined}>
            <span className="stream-setup__num" aria-hidden="true">{s.done ? <IconCheck size={14} stroke={3} /> : i + 1}</span>
            {s.done ? <span>{s.label}</span> : <Link href={s.href}>{s.label}</Link>}
            {s.done && <span className="sr-only"> (done)</span>}
          </li>
        ))}
      </ol>
    </section>
  );
}

export function StreamingTabs({ isPro, setup = null, profileTimezone }: { isPro: boolean; setup?: SetupStep[] | null; profileTimezone: string | null }) {
  return (
    <>
      {isPro && setup && <SetupChecklist steps={setup} />}
      <SectionTabs route="/account/streaming" screens={isPro ? proScreens(profileTimezone) : FREE_SCREENS} />
    </>
  );
}
