"use client";

/**
 * PlatformTabs — client tab switcher for the Platform Admin section page
 * (`src/app/account/platform/page.tsx`). The page server-gates on staff/admin
 * before rendering this, so these tabs never reach a non-staff session.
 *
 * The views, their tabs and the default live in `src/lib/account/nav.ts`. A
 * view with several tabs gets CDS Tabs across its top; each tab keeps its own
 * `?tab=` address. Add a new screen to nav.ts and to SCREENS below.
 */

import { Suspense, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Tabs } from "@empac/cascadeds";
import { ACCOUNT_SECTIONS, viewForTab } from "@/lib/account/nav";
import { PlatformHealthTab } from "@/components/account/PlatformHealthTab";
import { PlatformGrowthTab } from "@/components/account/PlatformGrowthTab";
import { PlatformEventsTab } from "@/components/account/PlatformEventsTab";
import { PlatformVariablesTab } from "@/components/account/PlatformVariablesTab";
import { PlatformDefaultCommandsTab } from "@/components/account/PlatformDefaultCommandsTab";
import { PlatformComplianceTab } from "@/components/account/PlatformComplianceTab";
import { PlatformTournamentsTab } from "@/components/account/PlatformTournamentsTab";
import { PlatformEngagementTab } from "@/components/account/PlatformEngagementTab";
import { PlatformTicketingTab } from "@/components/account/PlatformTicketingTab";
import { PlatformEconomyTab } from "@/components/account/PlatformEconomyTab";
import { PlatformPricingTab } from "@/components/account/PlatformPricingTab";
import { PlatformEconomySnapshotTab } from "@/components/account/PlatformEconomySnapshotTab";
import { PlatformStaffTab } from "@/components/account/PlatformStaffTab";
import { PlatformModerationTab } from "@/components/account/PlatformModerationTab";
import { PlatformShopTab } from "@/components/account/PlatformShopTab";
import { PlatformGuidesTab } from "@/components/account/PlatformGuidesTab";
import { PlatformDecksTab } from "@/components/account/PlatformDecksTab";
import { PlatformWeeklyTab } from "@/components/account/PlatformWeeklyTab";
import { PlatformChatBrainTab } from "@/components/account/PlatformChatBrainTab";
import { PlatformTriviaTab } from "@/components/account/PlatformTriviaTab";
import { PlatformShopOrdersTab, PlatformShopProductsTab } from "@/components/account/PlatformShopOrdersTab";
import { PlatformSwitchesTab } from "@/components/account/PlatformSwitchesTab";
import { TokenActivityPanel, TokenStreamersPanel } from "@/components/account/TokenEconomyPanels";
import { PlatformOriginalsTab } from "@/components/account/PlatformOriginalsTab";
import { PlatformAiTab } from "@/components/account/PlatformAiTab";
import { PlatformGamesTab } from "@/components/account/PlatformGamesTab";

export function PlatformTabs() {
  return (
    <Suspense>
      <PlatformTabsContent />
    </Suspense>
  );
}

const SCREENS: Record<string, () => ReactNode> = {
  "platform-health": () => <PlatformHealthTab />,
  "platform-growth": () => <PlatformGrowthTab />,
  "platform-ai": () => <PlatformAiTab />,
  "platform-switches": () => <PlatformSwitchesTab />,
  "platform-shop-orders": () => <PlatformShopOrdersTab />,
  "platform-shop-products": () => <PlatformShopProductsTab />,
  "platform-shop": () => <PlatformShopTab />,
  "platform-originals": () => <PlatformOriginalsTab />,
  "platform-chat-brain": () => <PlatformChatBrainTab />,
  "platform-weekly": () => <PlatformWeeklyTab />,
  "platform-trivia": () => <PlatformTriviaTab />,
  "platform-guides": () => <PlatformGuidesTab />,
  "platform-decks": () => <PlatformDecksTab />,
  "platform-games": () => <PlatformGamesTab />,
  "platform-default-commands": () => <PlatformDefaultCommandsTab />,
  "platform-variables": () => <PlatformVariablesTab />,
  "platform-events": () => <PlatformEventsTab />,
  "platform-engagement": () => <PlatformEngagementTab />,
  "platform-tournaments": () => <PlatformTournamentsTab />,
  "platform-ticketing": () => <PlatformTicketingTab />,
  "platform-moderation": () => <PlatformModerationTab />,
  "platform-staff": () => <PlatformStaffTab />,
  "platform-pricing": () => <PlatformPricingTab />,
  "platform-snapshot": () => <PlatformEconomySnapshotTab part="overview" />,
  "platform-token-streamers": () => <TokenStreamersPanel />,
  "platform-token-history": () => <><PlatformEconomySnapshotTab part="history" /><TokenActivityPanel /></>,
  "platform-economy": () => <PlatformEconomyTab />,
  "platform-compliance": () => <PlatformComplianceTab />,
};

const PLATFORM = ACCOUNT_SECTIONS.find((s) => s.route === "/account/platform")!;

function PlatformTabsContent() {
  const router = useRouter();
  const requested = useSearchParams().get("tab") || PLATFORM.defaultTab;
  const view = viewForTab(PLATFORM, requested) ?? PLATFORM.items[0];
  const activeTab = SCREENS[requested] ? requested : (view.id ?? PLATFORM.defaultTab);
  const screen = SCREENS[activeTab]?.() ?? null;

  if (!view.tabs || view.tabs.length < 2) return <>{screen}</>;
  return (
    <div className="platform-view">
      <Tabs
        variant="underline"
        activeTab={activeTab}
        onChange={(id) => router.push(`${PLATFORM.route}?tab=${id}`, { scroll: false })}
        tabs={view.tabs.map((t) => ({ id: t.id, label: t.label, content: t.id === activeTab ? <div className="platform-view__body">{screen}</div> : null }))}
      />
    </div>
  );
}
