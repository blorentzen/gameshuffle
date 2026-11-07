"use client";

/**
 * A game space's tabs (phone picks 2026-11-05, 1A and 2A): CDS Tabs (underline), with `?tab=` kept in the address so a
 * tab can be linked, staying at the top as you scroll (below the slim title bar on phones).
 */

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Tabs } from "@empac/cascadeds";
import { EVENTS, track } from "@/lib/analytics/events";

export interface SpaceTabItem { id: string; label: string; content: React.ReactNode }

export function SpaceTabs({ tabs, space }: { tabs: SpaceTabItem[]; space: string }) {
  const params = useSearchParams();
  const [active, setActive] = useState(() => tabs.find((t) => t.id === params.get("tab"))?.id ?? tabs[0]?.id ?? "");
  const wrap = useRef<HTMLDivElement>(null);
  // On a phone the row is wider than the screen and scrolls sideways: keep the open tab in view (a link to ?tab=posts
  // opened with Posts past the edge). Only the row scrolls, never the page.
  useEffect(() => {
    const tab = wrap.current?.querySelector<HTMLElement>(".empac-tabs__tab--active");
    const row = tab?.parentElement;
    if (!tab || !row || row.scrollWidth <= row.clientWidth) return;
    const pad = 24;
    if (tab.offsetLeft + tab.offsetWidth > row.scrollLeft + row.clientWidth) row.scrollLeft = tab.offsetLeft + tab.offsetWidth - row.clientWidth + pad;
    else if (tab.offsetLeft < row.scrollLeft) row.scrollLeft = Math.max(0, tab.offsetLeft - pad);
  }, [active]);
  function select(id: string) {
    setActive(id);
    const sp = new URLSearchParams(Array.from(params.entries()));
    if (id === tabs[0]?.id) sp.delete("tab"); else sp.set("tab", id);
    const q = sp.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${q ? `?${q}` : ""}`);
    track(EVENTS.homeSectionClicked, { to: `space-tab-${id}`, from: `space-${space}` });
  }
  return <div ref={wrap} className="space-tabs-wrap"><Tabs tabs={tabs} variant="underline" activeTab={active} onChange={select} className="space-tabs" /></div>;
}
