"use client";

/**
 * Streamer section page — the second of the three /account section PAGES
 * (Account · Streamer · Platform Admin). Renders the streamer-facing tabs;
 * the shared shell + sidebar live in `src/app/account/layout.tsx`.
 *
 * Each tab is a self-contained component; this page just switches on `?tab=`.
 * The tab catalog + default live in `src/lib/account/nav.ts` — add new
 * streamer tabs there and add their render block below.
 */

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { IntegrationsTab } from "@/components/account/IntegrationsTab";
import { ModsTab } from "@/components/account/ModsTab";
import { GameModulesTab } from "@/components/account/GameModulesTab";
import { WheelsTab } from "@/components/account/WheelsTab";
import { StreamToolsTab } from "@/components/account/StreamToolsTab";
import { ChatCommandsTab } from "@/components/account/ChatCommandsTab";
import { CommunityTab } from "@/components/account/CommunityTab";
import { EngagementTab } from "@/components/account/EngagementTab";
import { ChannelAnthemSettings } from "@/components/account/ChannelAnthemSettings";
import { ACCOUNT_TAB_ALIAS } from "@/lib/account/nav";

export default function StreamerAccountPage() {
  return (
    <Suspense>
      <StreamerContent />
    </Suspense>
  );
}

function StreamerContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawTab = searchParams.get("tab") || "integrations";
  const activeTab = ACCOUNT_TAB_ALIAS[rawTab] ?? rawTab;

  return (
    <>
      {activeTab === "integrations" && (
        <IntegrationsTab onLearnMore={() => router.push("/account?tab=plans")} />
      )}
      {activeTab === "mods" && <ModsTab />}
      {activeTab === "game-modules" && <GameModulesTab />}
      {activeTab === "wheels" && <WheelsTab />}
      {activeTab === "stream-tools" && <StreamToolsTab />}
      {activeTab === "chat-commands" && <ChatCommandsTab />}
      {activeTab === "community" && <CommunityTab />}
      {activeTab === "engagement" && <EngagementTab />}
      {activeTab === "anthems" && <ChannelAnthemSettings />}
    </>
  );
}
