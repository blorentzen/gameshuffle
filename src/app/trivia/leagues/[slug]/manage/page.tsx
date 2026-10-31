import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { leagueBySlug } from "@/lib/trivia/leagues";
import { LeagueManage } from "@/components/trivia/leagues/LeagueManage";
import "@/styles/trivia.css";
import "@/styles/trivia-seo.css";

export const metadata: Metadata = { title: "Manage league", robots: { index: false, follow: false } };

export default async function ManageLeaguePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirect=${encodeURIComponent(`/trivia/leagues/${slug}/manage`)}`);
  const league = await leagueBySlug(slug);
  if (!league || league.owner_user_id !== user.id) notFound();
  return (
    <main className="trivia-page">
      <div className="trivia-page__body">
        <LeagueManage leagueId={league.id} />
      </div>
    </main>
  );
}
