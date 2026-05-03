"use client";

/**
 * Tab strip for the session detail page. URL state via `?tab=` so deep
 * links and refreshes preserve the active tab; local state mirrors the
 * URL for instant visual response on click.
 *
 * The tab strip itself is game-agnostic — each tab represents an
 * aspect of the session (Overview / Configure / Modules / Redemptions /
 * Activity). Game-specific surfaces (race randomizer config, etc.)
 * live INSIDE tabs but the tab structure itself stays general.
 */

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Tabs } from "@empac/cascadeds";
import type { ReactNode } from "react";

export interface SessionDetailTabDef {
  id: string;
  label: string;
  content: ReactNode;
  /** When true, the tab is rendered but not selectable. */
  disabled?: boolean;
  /** Optional small-count indicator next to the label. */
  badge?: string | number;
}

interface SessionDetailTabsProps {
  tabs: SessionDetailTabDef[];
  initialTab: string;
}

export function SessionDetailTabs({ tabs, initialTab }: SessionDetailTabsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState(initialTab);

  // If the URL changes underneath us (e.g., user pastes a deep link in
  // the same tab), keep the local state in sync. Avoids the controlled-
  // tabs case where activeTab and the URL drift.
  useEffect(() => {
    const fromUrl = searchParams.get("tab");
    if (fromUrl && fromUrl !== activeTab) {
      setActiveTab(fromUrl);
    }
  }, [searchParams, activeTab]);

  const onChange = (tabId: string) => {
    setActiveTab(tabId);
    const next = new URLSearchParams(searchParams.toString());
    next.set("tab", tabId);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  return (
    <Tabs
      tabs={tabs}
      activeTab={activeTab}
      onChange={onChange}
      variant="underline"
    />
  );
}
