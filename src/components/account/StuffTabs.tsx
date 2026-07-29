"use client";

/**
 * Client tab switcher for the account "My Stuff" section — Setups & Games,
 * Tournaments, and My Cards (the collection, moved here from the TCG Hub since
 * it's a private, auth-gated surface). The shared shell + sidebar live in
 * `src/app/account/layout.tsx`; the page server-resolves `isPro`.
 */

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { SetupsTab } from "@/components/account/SetupsTab";
import { TournamentsTab } from "@/components/account/TournamentsTab";
import { CollectionManager } from "@/components/tcg/CollectionManager";
import { TcgAttribution } from "@/components/tcg/TcgAttribution";

export function StuffTabs({ isPro }: { isPro: boolean }) {
  return (
    <Suspense>
      <StuffTabsContent isPro={isPro} />
    </Suspense>
  );
}

function StuffTabsContent({ isPro }: { isPro: boolean }) {
  const tab = useSearchParams().get("tab") || "setups";

  if (tab === "tournaments") return <TournamentsTab />;

  if (tab === "my-cards") {
    return (
      <div className="account-mycards">
        <h2 style={{ marginBottom: "var(--spacing-16)" }}>My Cards</h2>
        <CollectionManager isPro={isPro} />
        <footer className="account-mycards__attr">
          <TcgAttribution />
        </footer>
      </div>
    );
  }

  return <SetupsTab />;
}
