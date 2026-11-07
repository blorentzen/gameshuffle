"use client";

/** A switch inside a space's tab (Boards: Time trials or Lounge): CDS Tabs as pills, no address change. */

import { Tabs } from "@empac/cascadeds";
import type { SpaceTabItem } from "./SpaceTabs";

export function SpaceSubTabs({ tabs }: { tabs: SpaceTabItem[] }) {
  return <Tabs tabs={tabs} variant="pills" defaultActiveTab={tabs[0]?.id} className="space-subtabs" />;
}
