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
    title: `${name} Competitive Hub`,
    description: `The ${name} competitive hub: standard scoring, live lounge sets, crew battles and community resources.`,
    openGraph: {
      title: `${name} Competitive Hub | GameShuffle`,
      description: `Standard scoring, live lounge sets and crew battles for competitive ${name}.`,
      url,
      images: [{ url: "https://cdn.empac.co/gameshuffle/images/opengraph/mk-lounge-og.jpg", width: 1200, height: 630, alt: `${name} Competitive Hub` }],
    },
    alternates: { canonical: url },
  };
}

export default function CompetitiveLayout({ children }: { children: React.ReactNode }) {
  return children;
}
