"use client";

/**
 * SectionTabs: the screen switcher every account section shares (Account,
 * My Stuff, Platform admin). The sidebar lists a section's views; a view with
 * several tabs gets CDS Tabs across its top. Views, tabs and defaults live in
 * `src/lib/account/nav.ts`; each tab keeps its own `?tab=` address, so old
 * links open the right screen. A `?tab=` that belongs to another section is
 * sent there (aliases included, e.g. My Stuff's old My Games → Profile ▸ Games).
 */

import { Suspense, useEffect, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Tabs } from "@empac/cascadeds";
import { ACCOUNT_SECTIONS, ACCOUNT_TAB_ALIAS, hrefForTab, sectionForTab, viewForTab } from "@/lib/account/nav";

export type ScreenMap = Record<string, () => ReactNode>;

export function SectionTabs(props: { route: string; screens: ScreenMap }) {
  return (
    <Suspense>
      <SectionTabsContent {...props} />
    </Suspense>
  );
}

function SectionTabsContent({ route, screens }: { route: string; screens: ScreenMap }) {
  const router = useRouter();
  const section = ACCOUNT_SECTIONS.find((s) => s.route === route)!;
  const params = useSearchParams();
  const raw = params.get("tab") || section.defaultTab;
  const requested = ACCOUNT_TAB_ALIAS[raw] ?? raw;
  const here = viewForTab(section, requested);
  const elsewhere = !here ? sectionForTab(requested) : undefined;
  // Forward to the owning section, keeping any other params (OAuth results, ?guild=).
  const rest = new URLSearchParams(params.toString());
  rest.delete("tab");
  const moveTo = elsewhere && elsewhere.route !== route ? `${hrefForTab(requested)}${rest.size ? `&${rest.toString()}` : ""}` : null;

  useEffect(() => {
    if (moveTo) router.replace(moveTo);
  }, [moveTo, router]);
  if (moveTo) return null;

  // A page leaves out the screens a person can't use (Streaming for a free
  // account), so fall back to the first view this page does render.
  const firstShown = section.items.find((i) => i.id && screens[i.id]);
  let view = here ?? section.items.find((i) => i.id === section.defaultTab) ?? section.items[0];
  if (!(here && screens[requested]) && !(view.id && screens[view.id]) && firstShown) view = firstShown;
  const activeTab = here && screens[requested] ? requested : (view.id ?? section.defaultTab);
  const screen = screens[activeTab]?.() ?? null;
  // A page can leave a tab out of `screens` to hide it (e.g. Payouts until paid entry is on).
  const tabs = (view.tabs ?? []).filter((t) => screens[t.id]);

  if (tabs.length < 2) return <>{screen}</>;
  return (
    <div className="platform-view">
      <Tabs
        variant="underline"
        activeTab={activeTab}
        onChange={(id) => router.push(`${route}?tab=${id}`, { scroll: false })}
        tabs={tabs.map((t) => ({ id: t.id, label: t.label, content: t.id === activeTab ? <div className="platform-view__body">{screen}</div> : null }))}
      />
    </div>
  );
}
