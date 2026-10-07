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

    const status = tournament.status as string;
    const description = status === "cancelled"
      ? "This tournament was cancelled."
      : tournament.description || (status === "in_progress"
        ? "This GameShuffle tournament is under way. Follow the bracket and results live."
        : status === "complete"
        ? "See the final standings and results of this GameShuffle tournament."
        : "Join this upcoming GameShuffle tournament. View details, check participants, and register.");

    return {
      title: tournament.title,
      description,
      // Upcoming and live tournaments are worth finding. Finished, cancelled
      // and unpublished (draft) ones are not: the page still loads by link.
      ...(status === "complete" || status === "cancelled" || status === "draft" ? { robots: { index: false, follow: true } } : {}),
      openGraph: {
        title: `${tournament.title} | GameShuffle`,
        description,
        url: `https://www.gameshuffle.co/tournament/${id}`,
        images: ["https://cdn.empac.co/gameshuffle/images/opengraph/mk-tournaments-og.jpg"],
      },
      alternates: {
        canonical: `https://www.gameshuffle.co/tournament/${id}`,
      },
    };
  } catch {
    return { title: "Tournament" };
  }
}

export default function TournamentDetailLayout({ children }: { children: React.ReactNode }) {
  return children;
}
