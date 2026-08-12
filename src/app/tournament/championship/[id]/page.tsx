import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getGameName } from "@/data/game-registry";
import { ChampionshipPublicClient } from "./ChampionshipPublicClient";

// Public season page — server shell for SEO metadata; the interactive season
// table + realtime live in the client component.
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("championships")
    .select("name, description, game_slug")
    .eq("id", id)
    .maybeSingle();

  if (!data) return { title: "Championship Not Found" };

  const game = getGameName(data.game_slug as string) || "Mario Kart";
  const title = `${data.name}: Championship Series`;
  const description =
    (data.description as string | null)?.trim() ||
    `Live season standings and events for ${data.name}, a ${game} championship series on GameShuffle.`;

  return {
    title,
    description,
    openGraph: { title, description, type: "website" },
    twitter: { card: "summary", title, description },
    alternates: { canonical: `/tournament/championship/${id}` },
  };
}

export default function ChampionshipPublicPage() {
  return <ChampionshipPublicClient />;
}
