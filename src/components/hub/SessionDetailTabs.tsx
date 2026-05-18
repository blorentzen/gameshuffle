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
 * Tradeoff: every tab's effects run on mount. The session hub's panels
 * are intentionally cheap (one or two polled queries each) so the load
 * is acceptable for a streamer's command-center page. If a future tab
 * grows heavy enough to matter, gate its data fetching on a parent
 * "isActive" prop instead of re-introducing CDS's unmounting model.
 */

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
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
                aria-labelledby={tab.id}
                hidden={!isActive}
                className="empac-tabs__panel"
              >
                {tab.content}
              </div>
            );
          })}
        </div>
      </div>
    </SessionSaveProvider>
  );
}
