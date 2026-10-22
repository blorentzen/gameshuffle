"use client";

/**
 * The lounge player page's tabs (lounge page picks, 2026-10-20): CascadeDS Tabs with the tab in
 * the address (`?tab=events`), so a link opens the right one. The server reads `?tab=` and passes
 * it as `initial`, so the first paint already shows that tab; switching rewrites the address with
 * history.replaceState (no navigation, no refetch), like the tournament manage page.
 * Panels are server-rendered nodes; CascadeDS mounts the active one.
 */

import { useState, type ReactNode } from "react";
import { Tabs } from "@empac/cascadeds";

export interface LoungeTab { id: string; label: string; badge?: string; content: ReactNode }

export function LoungeTabs({ tabs, initial }: { tabs: LoungeTab[]; initial: string }) {
  const [active, setActive] = useState(tabs.some((t) => t.id === initial) ? initial : tabs[0]?.id ?? "");
  const select = (id: string) => {
    setActive(id);
    const sp = new URLSearchParams(window.location.search);
    if (id === tabs[0]?.id) sp.delete("tab");
    else sp.set("tab", id);
    const q = sp.toString();
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${q ? `?${q}` : ""}`);
  };
  return (
    <div className="lounge-tabs">
      <Tabs tabs={tabs} variant="underline" activeTab={active} onChange={select} />
    </div>
  );
}
