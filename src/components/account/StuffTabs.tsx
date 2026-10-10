"use client";

/**
 * The My Stuff section: Events (Tournaments · Game nights) · Purchases
 * (Tickets · Shop orders · Payouts) · Saved configs · My Collection. Views and
 * tabs live in src/lib/account/nav.ts; My Games and Board Games moved to
 * Account ▸ Profile ▸ Games (their old links forward there). The page
 * server-resolves `isPro`, whether to show Payouts and the profile timezone
 * event times are shown in. Every screen is an AdminScreen; event lists use
 * the rows in ./stuff/StuffList.
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
import { AdminScreen } from "@/components/account/admin/AdminKit";
import { MAX_SHOWCASE } from "@/lib/scrydex/types";

export function StuffTabs({ isPro, unlimitedCards = false, showPayouts = false, timeZone = null }: { isPro: boolean; unlimitedCards?: boolean; showPayouts?: boolean; timeZone?: string | null }) {
  const screens: ScreenMap = {
    tournaments: () => <TournamentsTab timeZone={timeZone} />,
    "game-nights": () => <GameNightsTab timeZone={timeZone} />,
    tickets: () => <TicketsTab timeZone={timeZone} />,
    orders: () => <ShopOrdersTab />,
    // Organizer payouts only once paid entry is on, or for someone who has a payout account.
    ...(showPayouts ? { payouts: () => <PayoutsTab /> } : {}),
    setups: () => <SetupsTab />,
    "my-cards": () => (
      <AdminScreen title="My Collection" intro={`The Pokémon cards you own. Star your favorites: the top ${MAX_SHOWCASE} show on your public profile.`}>
        <CollectionManager isPro={isPro} unlimited={unlimitedCards} />
        <footer className="account-mycards__attr">
          <TcgAttribution />
        </footer>
      </AdminScreen>
    ),
  };
  return <SectionTabs route="/account/stuff" screens={screens} />;
}
