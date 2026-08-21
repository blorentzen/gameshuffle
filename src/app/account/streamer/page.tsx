"use client";

/**
 * Stream Setup section page — connect platforms, staff up, and build what
 * appears on the overlay. The viewer-facing tabs (chat, community, modules,
 * engagement, walk-up) live in the sibling "Community & Chat" section
 * (`/account/community`); a `?tab=` that belongs there is redirected.
 *
 * Each tab is a self-contained component; this page switches on `?tab=`.
 * The tab catalog + default live in `src/lib/account/nav.ts` — add new
 * Stream Setup tabs there and add their render block below.
 */

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { IntegrationsTab } from "@/components/account/IntegrationsTab";
import { DiscordBotTab } from "@/components/account/DiscordBotTab";
import { ModsTab } from "@/components/account/ModsTab";
import { WheelsTab } from "@/components/account/WheelsTab";
import { StreamToolsTab } from "@/components/account/StreamToolsTab";
import { OverlayLayoutTab } from "@/components/account/OverlayLayoutTab";
import { ThemeTab } from "@/components/account/ThemeTab";
import { AnthemSettings } from "@/components/account/AnthemSettings";
import { ACCOUNT_SECTIONS, ACCOUNT_TAB_ALIAS, sectionForTab, hrefForTab } from "@/lib/account/nav";

const THIS_ROUTE = "/account/streamer";

export default function StreamerAccountPage() {
  return (
    <Suspense>
      <StreamerContent />
    </Suspense>
  );
}

function StreamerContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawTab = searchParams.get("tab") || "integrations";
  const activeTab = ACCOUNT_TAB_ALIAS[rawTab] ?? rawTab;

  // A tab that belongs to another section (moved to Community & Chat, or a
  // legacy/return deep-link) is sent to its correct section route. A tab this
  // section owns — including a mirrored one like "theme" whose canonical home
  // is Account — renders in place and never redirects.
  const ownsTab = ACCOUNT_SECTIONS.find((s) => s.route === THIS_ROUTE)
    ?.items.some((i) => i.id === activeTab) ?? false;
  const elsewhere = sectionForTab(activeTab);
  const needsRedirect = !ownsTab && !!elsewhere && elsewhere.route !== THIS_ROUTE;
  useEffect(() => {
    if (needsRedirect) router.replace(hrefForTab(activeTab));
  }, [needsRedirect, activeTab, router]);

  return (
    <>
      {activeTab === "integrations" && (
        <IntegrationsTab onLearnMore={() => router.push("/account?tab=plans")} />
      )}
      {activeTab === "discord-bot" && <DiscordBotTab />}
      {activeTab === "mods" && <ModsTab />}
      {activeTab === "overlay-layout" && <OverlayLayoutTab />}
      {activeTab === "wheels" && <WheelsTab />}
      {activeTab === "stream-tools" && <StreamToolsTab />}
      {activeTab === "theme" && (
        <>
          <ThemeTab />
          <AnthemSettings />
        </>
      )}
    </>
  );
}
