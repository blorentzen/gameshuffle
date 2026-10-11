import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { TriviaHome } from "@/components/trivia/TriviaHome";

export const metadata: Metadata = {
  title: "Trivia Nights",
  description: "Run a trivia night in minutes: pick an occasion, fill the rounds from your library or draft them with AI, and teams play on their phones while the TV shows the rest. Free to host.",
  alternates: { canonical: "/trivia" },
};

export default async function TriviaPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return <TriviaHome signedIn={!!user} />;
}
