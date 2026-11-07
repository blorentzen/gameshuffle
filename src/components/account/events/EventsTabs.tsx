"use client";

/**
 * Account ▸ Your events (menus and account picks 2026-11-05, 4A/5A): what you run and join. Events (Tournaments ·
 * Game nights · Trivia) · Communities · Saved setups · Game night decks · Payouts. These lived in My Stuff; their tab
 * ids are unchanged, so old links forward here. The page works out Payouts and the profile timezone.
 */

import { SectionTabs, type ScreenMap } from "@/components/account/SectionTabs";
import { TournamentsTab } from "@/components/account/TournamentsTab";
import { GameNightsTab } from "@/components/account/GameNightsTab";
import { TriviaTab } from "@/components/account/events/TriviaTab";
import { CommunitiesTab } from "@/components/account/events/CommunitiesTab";
import { SetupsTab } from "@/components/account/SetupsTab";
import { DecksTab } from "@/components/account/stuff/DecksTab";
import { PayoutsTab } from "@/components/account/PayoutsTab";

export function EventsTabs({ isPro, showPayouts, timeZone }: { isPro: boolean; showPayouts: boolean; timeZone: string | null }) {
  const screens: ScreenMap = {
    tournaments: () => <TournamentsTab timeZone={timeZone} />,
    "game-nights": () => <GameNightsTab timeZone={timeZone} />,
    trivia: () => <TriviaTab />,
    communities: () => <CommunitiesTab />,
    setups: () => <SetupsTab />,
    decks: () => <DecksTab isPro={isPro} />,
    // Organizer payouts only once paid entry is on, or for someone who has a payout account.
    ...(showPayouts ? { payouts: () => <PayoutsTab /> } : {}),
  };
  return <SectionTabs route="/account/events" screens={screens} />;
}
