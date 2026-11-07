"use client";

/**
 * Account screens inside the Host pages (journeys picks 2026-11-06, 7A): Communities, and Tools' saved setups, decks
 * and payouts (CDS Tabs, `?tab=`). The tab above already names each screen, so its own title stays for screen readers.
 */

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Tabs } from "@empac/cascadeds";
import { CommunitiesTab } from "@/components/account/events/CommunitiesTab";
import { SetupsTab } from "@/components/account/SetupsTab";
import { DecksTab } from "@/components/account/stuff/DecksTab";
import { PayoutsTab } from "@/components/account/PayoutsTab";

export function HostCommunities() {
  return <div className="studio-screen"><CommunitiesTab /></div>;
}

export function HostTools(props: { isPro: boolean; showPayouts: boolean }) {
  return <Suspense><ToolsBody {...props} /></Suspense>;
}

function ToolsBody({ isPro, showPayouts }: { isPro: boolean; showPayouts: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const tabs = [
    { id: "setups", label: "Saved setups", render: () => <SetupsTab /> },
    { id: "decks", label: "Game night decks", render: () => <DecksTab isPro={isPro} /> },
    ...(showPayouts ? [{ id: "payouts", label: "Payouts", render: () => <PayoutsTab /> }] : []),
  ];
  const active = tabs.find((t) => t.id === params.get("tab"))?.id ?? tabs[0].id;
  return (
    <div className="platform-view studio-screen">
      <Tabs
        variant="underline"
        activeTab={active}
        onChange={(id) => router.replace(`/host/tools?tab=${id}`, { scroll: false })}
        tabs={tabs.map((t) => ({ id: t.id, label: t.label, content: t.id === active ? <div className="platform-view__body">{t.render()}</div> : null }))}
      />
    </div>
  );
}
