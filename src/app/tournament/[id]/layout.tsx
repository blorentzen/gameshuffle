import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/admin";
import { getGameName } from "@/data/game-registry";
import { previewText, shareMeta } from "@/lib/og/meta";

type Row = { title: string; description: string | null; game_slug: string; status: string; settings: { game_label?: string } | null; archived_at?: string | null };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Read once per request for both the metadata and the existence check. The
 * service client, because a draft is private (RLS) yet still has to be told
 * apart from a link that never existed: a draft keeps its page (its organizer
 * works on it there) but shares nothing, and an unknown id is a real 404
 * instead of a 200 that says "not found".
 *
 * Returns the row, null when there's no such tournament, and undefined when
 * the lookup itself failed (a hiccup shouldn't 404).
 */
const loadTournament = cache(async (id: string): Promise<Row | null | undefined> => {
  if (!UUID.test(id)) return null;
  try {
    const { data, error } = await createServiceClient().from("tournaments").select("*").eq("id", id).maybeSingle();
    return error ? undefined : ((data as Row | null) ?? null);
  } catch {
    return undefined;
  }
});

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const tournament = await loadTournament(id);
  if (tournament === undefined) return { title: "Tournament" };
  if (!tournament) return { title: "Tournament not found", robots: { index: false, follow: false } };

  const status = tournament.status;
  if (status === "draft") {
    return { title: "Tournament", description: "This tournament isn't published yet.", robots: { index: false, follow: false } };
  }

  const game = tournament.settings?.game_label || getGameName(tournament.game_slug);
  const description = previewText(status === "cancelled"
    ? "This tournament was cancelled."
    : tournament.description?.trim() || (status === "in_progress"
      ? `This ${game} tournament is under way. Follow the bracket and results live on GameShuffle.`
      : status === "complete"
      ? `See the final standings and results of this ${game} tournament on GameShuffle.`
      : `Join this upcoming ${game} tournament on GameShuffle. See the details and who's in, and register.`));

  return {
    title: tournament.title,
    description,
    // Upcoming and live tournaments are worth finding. Finished, cancelled
    // and archived ones are not: the page still loads by link.
    ...(status === "complete" || status === "cancelled" || tournament.archived_at ? { robots: { index: false, follow: true } } : {}),
    ...shareMeta({ title: tournament.title, description, path: `/tournament/${id}` }),
  };
}

export default async function TournamentDetailLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  if ((await loadTournament(id)) === null) notFound();
  return children;
}
