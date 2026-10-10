"use client";

/**
 * The My Stuff section: Events (Tournaments · Game nights) · Purchases
 * (Tickets · Shop orders · Payouts) · Saved configs · My Collection. Views and
 * tabs live in src/lib/account/nav.ts; My Games and Board Games moved to
 * Account ▸ Profile ▸ Games (their old links forward there). The page
 * server-resolves `isPro` and whether to show Payouts.
 */

import { SectionTabs, type ScreenMap } from "@/components/account/SectionTabs";
import { SetupsTab } from "@/components/account/SetupsTab";
import { TournamentsTab } from "@/components/account/TournamentsTab";
import { CollectionManager } from "@/components/tcg/CollectionManager";
import { TcgAttribution } from "@/components/tcg/TcgAttribution";
import { GameNightsTab } from "@/components/account/GameNightsTab";
import { TicketsTab } from "@/components/account/TicketsTab";
import { PayoutsTab } from "@/components/account/PayoutsTab";
import { ShopOrdersTab } from "@/components/account/ShopOrdersTab";

export function StuffTabs({ isPro, unlimitedCards = false, showPayouts = false }: { isPro: boolean; unlimitedCards?: boolean; showPayouts?: boolean }) {
  const screens: ScreenMap = {
    tournaments: () => <TournamentsTab />,
    "game-nights": () => <GameNightsTab />,
    tickets: () => <TicketsTab />,
    orders: () => <ShopOrdersTab />,
    // Organizer payouts only once paid entry is on, or for someone who has a payout account.
    ...(showPayouts ? { payouts: () => <PayoutsTab /> } : {}),
    setups: () => <SetupsTab />,
    "my-cards": () => (
      <div className="account-mycards">
        <h2 style={{ marginBottom: "var(--spacing-16)" }}>My Collection</h2>
        <CollectionManager isPro={isPro} unlimited={unlimitedCards} />
        <footer className="account-mycards__attr">
          <TcgAttribution />
        </footer>
      </div>
    ),
  };
  return <SectionTabs route="/account/stuff" screens={screens} />;
}
