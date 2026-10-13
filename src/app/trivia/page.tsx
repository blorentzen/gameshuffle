import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { TriviaHome } from "@/components/trivia/TriviaHome";
import { TriviaLanding } from "@/components/trivia/seo/TriviaLanding";
import { liveTopics } from "@/lib/trivia/topics";
import { triviaMetadata } from "@/lib/trivia/seoMeta";

export const metadata: Metadata = triviaMetadata({
  title: "Free Trivia Night App: Teams Play on Their Phones",
  description: "Host a trivia night in minutes: pick a template, fill the rounds from a checked question pack or your own, and teams answer on their phones while the TV shows the rest. Free to host.",
  path: "/trivia",
});

export default async function TriviaPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const topics = user ? [] : await liveTopics().catch(() => []);
  return (
    <TriviaHome signedIn={!!user}>
      {!user && <TriviaLanding topics={topics} />}
    </TriviaHome>
  );
}
