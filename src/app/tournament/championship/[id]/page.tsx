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
    .select("name, description, game_slug, settings")
    .eq("id", id)
    .maybeSingle();

  if (!data) return { title: "Championship Not Found" };

  /* `settings.game_label` first, because a custom game's slug is a slugified
     version of whatever the organizer typed and getGameName returns it
     unchanged — so a Smash season advertised itself as
     "super-smash-bros-ultimate". The old `|| "Mario Kart"` fallback could
     never fire either, since a slug is always truthy. */
  const settings = (data.settings ?? {}) as { game_label?: string };
  const game = settings.game_label || getGameName(data.game_slug as string);
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
