import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PokemonTabs } from "@/components/account/pokemon/PokemonTabs";
import { accountPageData } from "@/lib/account/pageData";
import { youTabFor } from "@/lib/games/youForward";

export const metadata: Metadata = { title: "Pokémon" };

/**
 * Account ▸ Pokémon (menus and account picks 2026-11-05): see PokemonTabs. Once the Pokémon space is open to the
 * account, My Cards and Deck lists open in its You tab instead (journeys picks 2026-11-06, step 6).
 */
export default async function PokemonPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const d = await accountPageData("/account/pokemon");
  const to = await youTabFor(d.userId, "pokemon").catch(() => null);
  if (to) redirect(`${to}&part=${(await searchParams).tab === "tcg-decks" ? "decks" : "cards"}`);
  return <PokemonTabs canCollect={d.canCollect} isPro={d.isPro} />;
}
