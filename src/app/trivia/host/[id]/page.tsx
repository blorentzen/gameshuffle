import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TriviaHostPage } from "@/components/trivia/TriviaHostPage";

export const metadata: Metadata = { title: "Host trivia", robots: { index: false, follow: false } };

export default async function TriviaHost({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirect=${encodeURIComponent(`/trivia/host/${id}`)}`);
  return <TriviaHostPage gameId={id} />;
}
