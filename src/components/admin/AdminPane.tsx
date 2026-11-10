"use client";

/**
 * One admin view's body (admin like Settings, picks 2026-11-08): its screens as CDS Tabs (`?tab=`), or its one
 * screen, with a way back to the list on phones. The screens are the ones Platform admin always had, keyed by their
 * old ids (`src/lib/admin/items.ts`); add a new screen there and here.
 */

import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Tabs } from "@empac/cascadeds";
import { IconChevronLeft } from "@tabler/icons-react";
import { adminHref, adminItem } from "@/lib/admin/items";
import { PlatformHealthTab } from "@/components/account/PlatformHealthTab";
import { PlatformGrowthTab } from "@/components/account/PlatformGrowthTab";
import { PlatformSetupTab } from "@/components/account/PlatformSetupTab";
import { PlatformRevenueTab } from "@/components/account/PlatformRevenueTab";
import { PlatformSupportTab } from "@/components/account/PlatformSupportTab";
import { PlatformEventsTab } from "@/components/account/PlatformEventsTab";
import { PlatformVariablesTab } from "@/components/account/PlatformVariablesTab";
import { PlatformDefaultCommandsTab } from "@/components/account/PlatformDefaultCommandsTab";
import { PlatformComplianceTab } from "@/components/account/PlatformComplianceTab";
import { PlatformTournamentsTab } from "@/components/account/PlatformTournamentsTab";
import { PlatformSeriesTab } from "@/components/account/PlatformSeriesTab";
import { PlatformEngagementTab } from "@/components/account/PlatformEngagementTab";
import { PlatformTicketingTab } from "@/components/account/PlatformTicketingTab";
import { PlatformEconomyTab } from "@/components/account/PlatformEconomyTab";
import { PlatformPricingTab } from "@/components/account/PlatformPricingTab";
import { PlatformEconomySnapshotTab } from "@/components/account/PlatformEconomySnapshotTab";
import { PlatformStaffTab } from "@/components/account/PlatformStaffTab";
import { PlatformModerationTab } from "@/components/account/PlatformModerationTab";
import { PlatformGifsTab } from "@/components/account/PlatformGifsTab";
import { PlatformTimeTrialsTab } from "@/components/account/PlatformTimeTrialsTab";
import { PlatformLaddersTab } from "@/components/account/PlatformLaddersTab";
import { PlatformShopTab } from "@/components/account/PlatformShopTab";
import { PlatformGuidesTab } from "@/components/account/PlatformGuidesTab";
import { PlatformDecksTab } from "@/components/account/PlatformDecksTab";
import { PlatformWeeklyTab } from "@/components/account/PlatformWeeklyTab";
import { PlatformChatBrainTab } from "@/components/account/PlatformChatBrainTab";
import { PlatformTriviaTab } from "@/components/account/PlatformTriviaTab";
import { PlatformBreakTab } from "@/components/account/PlatformBreakTab";
import { PlatformShopOrdersTab, PlatformShopProductsTab, PlatformShopStatesTab } from "@/components/account/PlatformShopOrdersTab";
import { PlatformShopMerchTab } from "@/components/account/PlatformShopMerchTab";
import { PlatformSwitchesTab } from "@/components/account/PlatformSwitchesTab";
import { TokenActivityPanel, TokenStreamersPanel } from "@/components/account/TokenEconomyPanels";
import { PlatformOriginalsTab } from "@/components/account/PlatformOriginalsTab";
import { PlatformAiTab } from "@/components/account/PlatformAiTab";
import { PlatformGamesTab } from "@/components/account/PlatformGamesTab";

const SCREENS: Record<string, () => ReactNode> = {
  "platform-health": () => <PlatformHealthTab />,
  "platform-growth": () => <PlatformGrowthTab />,
  "platform-setup": () => <PlatformSetupTab />,
  "platform-revenue": () => <PlatformRevenueTab />,
  "platform-ai": () => <PlatformAiTab />,
  "platform-switches": () => <PlatformSwitchesTab />,
  "platform-shop-orders": () => <PlatformShopOrdersTab />,
  "platform-shop-merch": () => <PlatformShopMerchTab />,
  "platform-shop-products": () => <PlatformShopProductsTab />,
  "platform-shop-states": () => <PlatformShopStatesTab />,
  "platform-shop": () => <PlatformShopTab />,
  "platform-originals": () => <PlatformOriginalsTab />,
  "platform-chat-brain": () => <PlatformChatBrainTab />,
  "platform-weekly": () => <PlatformWeeklyTab />,
  "platform-trivia": () => <PlatformTriviaTab />,
  "platform-break": () => <PlatformBreakTab />,
  "platform-guides": () => <PlatformGuidesTab />,
  "platform-decks": () => <PlatformDecksTab />,
  "platform-games": () => <PlatformGamesTab />,
  "platform-default-commands": () => <PlatformDefaultCommandsTab />,
  "platform-variables": () => <PlatformVariablesTab />,
  "platform-events": () => <PlatformEventsTab />,
  "platform-engagement": () => <PlatformEngagementTab />,
  "platform-tournaments": () => <PlatformTournamentsTab />,
  "platform-ticketing": () => <PlatformTicketingTab />,
  "platform-series": () => <PlatformSeriesTab />,
  "platform-moderation": () => <PlatformModerationTab />,
  "platform-gifs": () => <PlatformGifsTab />,
  "platform-time-trials": () => <PlatformTimeTrialsTab />,
  "platform-ladders": () => <PlatformLaddersTab />,
  "platform-staff": () => <PlatformStaffTab />,
  "platform-pricing": () => <PlatformPricingTab />,
  "platform-support": () => <PlatformSupportTab />,
  "platform-snapshot": () => <PlatformEconomySnapshotTab part="overview" />,
  "platform-token-streamers": () => <TokenStreamersPanel />,
  "platform-token-history": () => <PlatformEconomySnapshotTab part="history"><TokenActivityPanel embedded /></PlatformEconomySnapshotTab>,
  "platform-economy": () => <PlatformEconomyTab />,
  "platform-compliance": () => <PlatformComplianceTab />,
};

export function AdminPane(props: { item: string; index?: boolean }) {
  return (
    <Suspense>
      <Body {...props} />
    </Suspense>
  );
}

function Body({ item: id, index = false }: { item: string; index?: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const item = adminItem(id);
  if (!item) return null;
  const tabs = item.tabs ?? [];
  const active = tabs.find((t) => t.id === params.get("tab")) ?? tabs[0] ?? null;
  const screen = SCREENS[active?.key ?? item.key ?? ""]?.() ?? null;

  return (
    <div className={`settings-pane${index ? " settings-pane--index" : ""}`}>
      {/* Phones: the list is its own page, so each view leads back to it. */}
      <Link href="/admin" className="settings-pane__back"><IconChevronLeft size={18} aria-hidden="true" />Admin</Link>
      {tabs.length > 1 && active ? (
        <div className="platform-view">
          <Tabs
            variant="underline"
            activeTab={active.id}
            onChange={(t) => router.replace(adminHref(item, tabs.find((x) => x.id === t)), { scroll: false })}
            tabs={tabs.map((t) => ({ id: t.id, label: t.label, content: t.id === active.id ? <div className="platform-view__body">{screen}</div> : null }))}
          />
        </div>
      ) : screen}
    </div>
  );
}
