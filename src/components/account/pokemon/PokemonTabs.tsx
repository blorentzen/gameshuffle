"use client";

/**
 * Account ▸ Pokémon (menus and account picks 2026-11-05, 4A/5A): My Cards and your deck lists (they were My Stuff ▸
 * My Collection; the tab ids are unchanged, so old links forward here).
 */

import { SectionTabs, type ScreenMap } from "@/components/account/SectionTabs";
import { AdminScreen } from "@/components/account/admin/AdminKit";
import { CollectionManager } from "@/components/tcg/CollectionManager";
import { TcgAttribution } from "@/components/tcg/TcgAttribution";
import { TcgDecksTab } from "@/components/tcg/decks/TcgDecksTab";
import { MAX_SHOWCASE } from "@/lib/scrydex/types";

export function PokemonTabs({ canCollect, isPro }: { canCollect: boolean; isPro: boolean }) {
  const screens: ScreenMap = {
    "my-cards": () => (
      <AdminScreen title="My Cards" intro={`The Pokémon cards you own. Star your favorites: the top ${MAX_SHOWCASE} show on your public profile.`}>
        <CollectionManager isPro={canCollect} unlimited={isPro} />
        <footer className="account-mycards__attr">
          <TcgAttribution />
        </footer>
      </AdminScreen>
    ),
    // GS Pro keeps unlimited deck lists (free accounts keep three); My Stuff used to pass the collection flag here.
    "tcg-decks": () => <TcgDecksTab isPro={isPro} />,
  };
  return <SectionTabs route="/account/pokemon" screens={screens} />;
}
