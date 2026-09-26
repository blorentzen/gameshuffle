"use client";

/**
 * Profile tabs — a thin wrapper over the CDS <Tabs> component that adds `?tab=`
 * URL sync for deep links. We standardize on the CDS component (consistent look,
 * keyboard + a11y handled) and only layer the URL-sync enhancement on top rather
 * than hand-rolling a tab bar. Panels are passed as server-rendered `content`
 * nodes; CDS renders the active one and switches instantly (no refetch).
 */

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Tabs } from "@empac/cascadeds";

export interface ProfileTab {
  id: string;
  label: string;
  content: React.ReactNode;
}

export function ProfileTabs({ tabs }: { tabs: ProfileTab[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const initial = tabs.find((t) => t.id === params.get("tab"))?.id ?? tabs[0]?.id ?? "";
  const [active, setActive] = useState(initial);

  function select(id: string) {
    setActive(id); // instant switch
    const sp = new URLSearchParams(Array.from(params.entries()));
    sp.set("tab", id);
    router.replace(`?${sp.toString()}`, { scroll: false });
  }

  // Pills in their own container rather than underline tabs floating on the
  // page. On a skinned profile the underline sat directly on the owner's
  // background, which is both the contrast problem and the reason the tab row
  // read as detached from the panel under it.
  return (
    <div className="profile-tabs">
      <Tabs tabs={tabs} variant="pills" activeTab={active} onChange={select} />
    </div>
  );
}
