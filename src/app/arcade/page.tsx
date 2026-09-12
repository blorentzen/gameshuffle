import type { Metadata } from "next";
import { Container } from "@empac/cascadeds";
import { createClient } from "@/lib/supabase/server";
import { ARCADE_ITEMS } from "@/data/arcade-items";
import { getInventory, getEquippedNameColor } from "@/lib/economy/arcade";
import { getAccountBalance } from "@/lib/economy/accountWallet";
import { ArcadeShop } from "@/components/arcade/ArcadeShop";

export const metadata: Metadata = {
  title: "Arcade",
  description: "Spend your Arcade Tokens on cosmetic badges and flair. Earn tokens by playing, chatting, and joining communities.",
  alternates: { canonical: "https://www.gameshuffle.co/arcade" },
};

export default async function ArcadePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [owned, balance, equippedNameColor] = await Promise.all([
    user ? getInventory(user.id).catch(() => []) : Promise.resolve([]),
    user ? getAccountBalance(user.id).catch(() => 0) : Promise.resolve(0),
    user ? getEquippedNameColor(user.id).catch(() => null) : Promise.resolve(null),
  ]);

  return (
    <main style={{ background: "color-mix(in srgb, var(--text-primary) 4%, var(--surface-default))", minHeight: "100vh", paddingBottom: "var(--spacing-64)" }}>
      <Container>
        <section style={{ padding: "var(--spacing-48) 0 var(--spacing-24)" }}>
          <p className="marketing-eyebrow" style={{ marginBottom: "var(--spacing-8)" }}>Arcade</p>
          <h1 style={{ fontSize: "var(--font-size-36)", fontWeight: 800, margin: "0 0 var(--spacing-8)", lineHeight: 1.1 }}>Spend your tokens</h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "var(--font-size-16)", maxWidth: "52ch", margin: 0 }}>
            Earn Arcade Tokens by playing, chatting, and joining communities — then spend them here on badges and flair for your profile.
          </p>
        </section>
        <ArcadeShop items={ARCADE_ITEMS} initialOwned={owned} initialBalance={balance} initialEquippedNameColor={equippedNameColor} signedIn={!!user} />
      </Container>
    </main>
  );
}
