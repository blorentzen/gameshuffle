import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { IconArrowLeft } from "@tabler/icons-react";
import { Container } from "@empac/cascadeds";
import { createClient } from "@/lib/supabase/server";
import {
  effectiveTier,
  hasCapability,
  normalizeTier,
} from "@/lib/subscription";
import { CollectionManager } from "@/components/tcg/CollectionManager";
import { TcgAttribution } from "@/components/tcg/TcgAttribution";

export const metadata: Metadata = {
  title: "My Cards — Pokémon TCG",
  description:
    "Search the Pokémon card catalog and track the cards you own in your GameShuffle collection.",
  // Auth surface (redirects guests to sign in) — keep out of crawls.
  robots: { index: false, follow: false },
};

/**
 * "My Cards" collection surface — the canonical home under the Pokémon TCG
 * Hub. Gated on a signed-in GameShuffle account: collections belong to real
 * accounts, so guests are sent to sign in (browsing the catalog also requires
 * auth — the /api/tcg routes reject anon to prevent credit drain).
 *
 * Reached from the hub, the account "My Stuff" tab, and the Companion board's
 * "My Cards" doorway; `/tcg-companion/collection` 301s here (next.config.ts).
 *
 * Collecting is free (the `companion.collection` capability is granted to all
 * tiers); `isPro` is resolved server-side for presentation only — the real
 * control is on every /api/tcg/collection route.
 */
export default async function Page() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/pokemon-tcg/my-cards");

  const { data: profile } = await supabase
    .from("users")
    .select("subscription_tier, role")
    .eq("id", user.id)
    .maybeSingle();
  const capUser = {
    tier: normalizeTier(profile?.subscription_tier as string | null),
    role: (profile?.role as string | null) ?? null,
  };
  effectiveTier(capUser); // upgrades staff/admin for the capability check
  const isPro = hasCapability(capUser, "companion.collection");

  return (
    <main className="tcg-collection-page">
      <Container>
        <Link href="/pokemon-tcg" className="tcg-collection-page__back">
          <IconArrowLeft size={16} />
          Pokémon TCG
        </Link>
        <header className="tcg-collection-page__head">
          <h1>My Cards</h1>
          <p>
            Search the Pokémon card catalog and track the cards you own. Add
            cards here to play with them in the TCG Companion.
          </p>
        </header>

        <CollectionManager isPro={isPro} />

        <footer className="tcg-collection-page__footer">
          <TcgAttribution />
        </footer>
      </Container>
    </main>
  );
}
