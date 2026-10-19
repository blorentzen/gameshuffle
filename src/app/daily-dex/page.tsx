import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Container } from "@empac/cascadeds";
import { BrowseHero } from "@/components/events/BrowseHero";
import { DailiesBar, DailiesProvider } from "@/components/originals/Dailies";
import { DailyDex } from "@/components/originals/DailyDex";
import { isStaffRequest } from "@/lib/auth/raw";
import { DAILY_DEX_PUBLIC } from "@/lib/games-visibility";

export const metadata: Metadata = {
  title: "The Daily Dex: guess the Pokémon",
  description: "A daily Pokémon guessing game: one Pokémon a day from all 1,025. A new hint after every miss, arrows on generation, height and weight, five guesses and a last chance.",
  alternates: { canonical: "https://www.gameshuffle.co/daily-dex" },
  ...(DAILY_DEX_PUBLIC ? {} : { robots: { index: false, follow: false } }),
};

/** /daily-dex — the Daily Dex, a GameShuffle Original. Staff only until DAILY_DEX_PUBLIC. */
export default async function DailyDexPage() {
  if (!DAILY_DEX_PUBLIC && process.env.NODE_ENV === "production" && !(await isStaffRequest())) notFound();
  return (
    <main>
      <BrowseHero
        eyebrow="A GameShuffle Original · every day"
        title="The Daily Dex"
        sub="Guess today's Pokémon from all 1,025, with a new hint after every miss. Same Pokémon for everyone, a new one every day."
        subShort="Guess today's Pokémon from all 1,025."
        accent="dex"
        field="dex"
        compact
      />
      <Container className="tool-page daily-page">
        <DailiesProvider current="dex">
          <DailiesBar current="dex" />
          <DailyDex />
        </DailiesProvider>
      </Container>
    </main>
  );
}
