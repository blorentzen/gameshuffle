import type { Metadata } from "next";
import { createPublicClient } from "@/lib/supabase/public";
import { loadCompetitiveConfig } from "@/lib/competitive/config";

/**
 * Metadata per game, since `[game]` now serves every competitive title rather
 * than MK8DX alone.
 */
export async function generateMetadata({ params }: { params: Promise<{ game: string }> }): Promise<Metadata> {
  const { game } = await params;
  const config = await loadCompetitiveConfig(createPublicClient() as never, game);
  const name = config?.displayName ?? "Competitive";
  const url = `https://www.gameshuffle.co/competitive/${game}`;
  return {
    title: `${name} live scoring`,
    description: `Live scoring for ${name}: a set between friends on the standard table, everyone logging their own finish from their phone.`,
    openGraph: {
      siteName: "GameShuffle",
      title: `${name} live scoring | GameShuffle`,
      description: `Live scoring for ${name}: the standard table, team modes and standings anyone can follow.`,
      url,
    },
    alternates: { canonical: url },
  };
}

export default function CompetitiveLayout({ children }: { children: React.ReactNode }) {
  return children;
}
