import { redirect } from "next/navigation";
import { Container } from "@empac/cascadeds";
import { createClient } from "@/lib/supabase/server";
import { PlayersDirectory } from "@/components/social/PlayersDirectory";

export const metadata = {
  title: "Find Players",
  // Member feature over public accounts — keep the directory itself out of the
  // index (individual /u profiles remain indexable).
  robots: { index: false, follow: false },
};

export default async function PlayersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/players");

  return (
    <Container className="players-page">
      <h1 className="players-page__title">Find players</h1>
      <p className="players-page__lead">
        Discover other players to game with. Filter by favorite game, who&apos;s online, and streamers.
      </p>
      <PlayersDirectory />
    </Container>
  );
}
