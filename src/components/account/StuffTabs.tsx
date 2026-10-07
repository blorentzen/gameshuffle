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
import { BoardGamesManager } from "@/components/account/BoardGamesManager";
import { GameNightsTab } from "@/components/account/GameNightsTab";
import { TicketsTab } from "@/components/account/TicketsTab";
import { PayoutsTab } from "@/components/account/PayoutsTab";
import { MyGamesPanel } from "@/components/collection/CollectionEditor";
import { COLLECTION_GAMES } from "@/lib/collection/catalog";

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

  if (tab === "my-games") {
    return (
      <div className="account-card">
        <h2 className="account-tab__heading">My Games</h2>
        <p className="account-tab__intro">
          Tell us what you own or have unlocked, and the randomizers only roll what you can actually pick. The base game starts switched on; DLC and unlockables start off until you tick them.
        </p>
        <MyGamesPanel games={COLLECTION_GAMES} />
      </div>
    );
  }

  if (tab === "game-nights") return <GameNightsTab />;

  if (tab === "board-games") return <BoardGamesManager />;

  if (tab === "tickets") return <TicketsTab />;

  if (tab === "payouts") return <PayoutsTab />;

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
