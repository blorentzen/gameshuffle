import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;

  try {
    const supabase = await createClient();
    const { data: tournament } = await supabase
      .from("tournaments")
      .select("title, description, game_slug, status")
      .eq("id", id)
      .single();

    if (!tournament) return { title: "Tournament Not Found" };

    const statusLabel = tournament.status === "in_progress"
      ? "In Progress"
      : tournament.status === "complete"
      ? "Completed"
      : "Upcoming";

    const description = tournament.description
      || `Join this ${statusLabel.toLowerCase()} GameShuffle tournament. View details, check participants, and register to race.`;

    return {
      title: tournament.title,
      description,
      openGraph: {
        title: `${tournament.title} | GameShuffle`,
        description,
        url: `https://gameshuffle.co/tournament/${id}`,
        images: ["/images/opengraph/gs-mk8dx-og.jpg"],
      },
      alternates: {
        canonical: `https://gameshuffle.co/tournament/${id}`,
      },
    };
  } catch {
    return { title: "Tournament" };
  }
}

export default function TournamentDetailLayout({ children }: { children: React.ReactNode }) {
  return children;
}
