"use client";

/**
 * Tab strip for the session detail page. URL state via `?tab=` so deep
 * links and refreshes preserve the active tab; local state mirrors the
 * URL for instant visual response on click.
 *
 * Unlike CDS `<Tabs>` (which unmounts inactive panels), this component
 * renders ALL panels and toggles visibility via the `hidden` attribute.
 * That preserves component state (form fields, picker selections,
 * scroll position, polled data) when the streamer flips between tabs —
 * tab switches are nearly free and unsaved edits survive. Borrows the
 * CDS `.empac-tabs__*` classes for visual parity.
 *
 * A tab mounts the first time it's opened and then stays mounted (2026-10-10:
 * the live stream page grew Lobby, Live games and Predictions tabs, each
 * polling its own data, so mounting them all up front was wasteful). The
 * opening tab mounts on the first render.
 */

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { KeyboardEvent, ReactNode } from "react";
import { SessionSaveProvider } from "./SessionSaveProvider";

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
  const [visited, setVisited] = useState<Set<string>>(() => new Set([initialTab]));
  if (!visited.has(activeTab)) setVisited(new Set(visited).add(activeTab));
  const tabListRef = useRef<HTMLDivElement>(null);
  const [indicatorStyle, setIndicatorStyle] = useState<{
    width: number;
    left: number;
  } | null>(null);

  // If the URL changes underneath us (e.g., user pastes a deep link in
  // the same tab), keep the local state in sync. Implemented as a
  // "derive state from prop during render" sync with a sentinel — the
  // official React pattern when avoiding setState-in-effect.
  const urlTab = searchParams.get("tab");
  const [lastSyncedUrlTab, setLastSyncedUrlTab] = useState<string | null>(
    initialTab,
  );
  if (urlTab !== lastSyncedUrlTab) {
    setLastSyncedUrlTab(urlTab);
    if (urlTab && urlTab !== activeTab) setActiveTab(urlTab);
  }

  // Position the underline indicator below the active tab. Recomputes
  // on tab change + on window resize (tab labels may reflow).
  useEffect(() => {
    const reposition = () => {
      const container = tabListRef.current;
      if (!container) return;
      const activeEl = container.querySelector<HTMLButtonElement>(
        `[data-tab-id="${activeTab}"]`,
      );
      if (!activeEl) return;
      const containerRect = container.getBoundingClientRect();
      const activeRect = activeEl.getBoundingClientRect();
      setIndicatorStyle({
        width: activeRect.width,
        left: activeRect.left - containerRect.left,
      });
    };
    reposition();
    window.addEventListener("resize", reposition);
    return () => window.removeEventListener("resize", reposition);
  }, [activeTab, tabs]);

  const onChange = (tabId: string, disabled?: boolean) => {
    if (disabled) return;
    setActiveTab(tabId);
    const next = new URLSearchParams(searchParams.toString());
    next.set("tab", tabId);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  // Roving tabindex: arrows, Home and End move between tabs (only the active
  // tab is in the Tab order).
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const usable = tabs.filter((t) => !t.disabled);
    const at = usable.findIndex((t) => t.id === activeTab);
    let next = -1;
    if (e.key === "ArrowRight") next = (at + 1) % usable.length;
    else if (e.key === "ArrowLeft") next = (at - 1 + usable.length) % usable.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = usable.length - 1;
    if (next < 0) return;
    e.preventDefault();
    onChange(usable[next].id);
    tabListRef.current?.querySelector<HTMLButtonElement>(`[data-tab-id="${usable[next].id}"]`)?.focus();
  };

  return (
    <SessionSaveProvider>
      <div className="empac-tabs empac-tabs--underline">
        <div
          className="empac-tabs__header"
          ref={tabListRef}
          role="tablist"
        >
          {tabs.map((tab) => {
            const isActive = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                id={`tab-${tab.id}`}
                data-tab-id={tab.id}
                role="tab"
                aria-selected={isActive}
                aria-controls={`panel-${tab.id}`}
                aria-disabled={tab.disabled}
                tabIndex={isActive ? 0 : -1}
                className={`empac-tabs__tab${
                  isActive ? " empac-tabs__tab--active" : ""
                }${tab.disabled ? " empac-tabs__tab--disabled" : ""}`}
                onClick={() => onChange(tab.id, tab.disabled)}
                onKeyDown={onKeyDown}
                disabled={tab.disabled}
              >
                <span className="empac-tabs__tab-label">{tab.label}</span>
                {tab.badge !== undefined && (
                  <span className="empac-tabs__tab-badge">{tab.badge}</span>
                )}
              </button>
            );
          })}
          {indicatorStyle && (
            <div
              className="empac-tabs__indicator"
              style={{
                width: `${indicatorStyle.width}px`,
                left: `${indicatorStyle.left}px`,
              }}
            />
          )}
        </div>
        <div className="empac-tabs__content">
          {tabs.map((tab) => {
            const isActive = tab.id === activeTab;
            return (
              <div
                key={tab.id}
                id={`panel-${tab.id}`}
                role="tabpanel"
                aria-labelledby={`tab-${tab.id}`}
                hidden={!isActive}
                className="empac-tabs__panel"
              >
                {(isActive || visited.has(tab.id)) && tab.content}
              </div>
            );
          })}
        </div>
      </div>
    </SessionSaveProvider>
  );
}
