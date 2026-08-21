"use client";

/**
 * Community & Chat section page — the viewer-facing half of the streamer
 * tools: chat commands, the community/economy modules, per-game modules,
 * engagement insights, and walk-up anthems. The setup/production tabs
 * (integrations, Discord bot, mods, overlay, wheels, stream tools) live in
 * the sibling "Stream Setup" section (`/account/streamer`); a `?tab=` that
 * belongs there is redirected.
 *
 * Each tab is a self-contained component; this page switches on `?tab=`.
 * The tab catalog + default live in `src/lib/account/nav.ts`.
 */

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChatCommandsTab } from "@/components/account/ChatCommandsTab";
import { PollsTab } from "@/components/account/PollsTab";
import { CommunityTab } from "@/components/account/CommunityTab";
import { GameModulesTab } from "@/components/account/GameModulesTab";
import { EngagementTab } from "@/components/account/EngagementTab";
import { ChannelAnthemSettings } from "@/components/account/ChannelAnthemSettings";
import { ACCOUNT_TAB_ALIAS, sectionForTab, hrefForTab } from "@/lib/account/nav";

export default function CommunityAccountPage() {
  return (
    <Suspense>
      <CommunityContent />
    </Suspense>
  );
}

function CommunityContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawTab = searchParams.get("tab") || "chat-commands";
  const activeTab = ACCOUNT_TAB_ALIAS[rawTab] ?? rawTab;

  // A tab that belongs to another section (e.g. a Stream Setup tab, or a
  // legacy deep-link) is sent to its correct section route.
  const section = sectionForTab(activeTab);
  const needsRedirect = !!section && section.route !== "/account/community";
  useEffect(() => {
    if (needsRedirect) router.replace(hrefForTab(activeTab));
  }, [needsRedirect, activeTab, router]);

  return (
    <>
      {activeTab === "chat-commands" && <ChatCommandsTab />}
      {activeTab === "polls" && <PollsTab />}
      {activeTab === "community" && <CommunityTab />}
      {activeTab === "game-modules" && <GameModulesTab />}
      {activeTab === "engagement" && <EngagementTab />}
      {activeTab === "anthems" && <ChannelAnthemSettings />}
    </>
  );
}
