import type { Metadata } from "next";
import Link from "next/link";
import { Container, Button } from "@empac/cascadeds";
import { createClient } from "@/lib/supabase/server";
import { listOnlineFollowing } from "@/lib/social/follows";
import { listFeed } from "@/lib/social/feed";
import { listDiscoverCommunities, listHubTournaments } from "@/lib/communities/discover";
import { CommunityHubShell } from "@/components/social/CommunityHubShell";

export const metadata: Metadata = {
  title: "Community Hub",
  description: "The GameShuffle community feed — posts, live and upcoming tournaments, communities to join, and the players online right now.",
  alternates: { canonical: "https://www.gameshuffle.co/communities" },
};

export default async function CommunitiesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [discover, tournaments, online, previewPosts] = await Promise.all([
    listDiscoverCommunities(user?.id ?? null).catch(() => []),
    listHubTournaments().catch(() => ({ live: [], upcoming: [] })),
    user ? listOnlineFollowing(user.id).catch(() => []) : Promise.resolve([]),
    // Signed-out prospects get a small read-only taste of the feed.
    user ? Promise.resolve([]) : listFeed({ viewerId: "", scope: "for_you", limit: 5 }).catch(() => []),
  ]);

  return (
    <main style={{ background: "color-mix(in srgb, var(--text-primary) 4%, var(--surface-default))", minHeight: "100vh", paddingBottom: "var(--spacing-64)" }}>
      <Container>
        <section style={{ padding: "var(--spacing-32) 0 var(--spacing-24)", display: "flex", alignItems: "center", gap: "var(--spacing-12)", flexWrap: "wrap" }}>
          <h1 style={{ fontSize: "var(--font-size-32)", fontWeight: 800, margin: 0, lineHeight: 1.1 }}>Community Hub</h1>
          <span className="hub__beta">Beta</span>
          {user && (
            <Link href="/communities/new" style={{ textDecoration: "none", marginLeft: "auto" }}>
              <Button variant="primary" size="small">Create a community</Button>
            </Link>
          )}
        </section>

        {!user && (
          <div className="hub-cta">
            <div className="hub-cta__copy">
              <h2 className="hub-cta__title">Join the conversation</h2>
              <p className="hub-cta__lead">
                Log in or create a free GameShuffle account to post, react, follow players, and join communities.
              </p>
            </div>
            <div className="hub-cta__actions">
              <Link href="/login?redirect=/communities"><Button variant="secondary">Log in</Button></Link>
              <Link href="/signup?redirect=/communities"><Button variant="primary">Sign up</Button></Link>
            </div>
          </div>
        )}

        <CommunityHubShell
          discover={discover}
          tournaments={tournaments}
          online={online}
          isAuthed={!!user}
          previewPosts={previewPosts}
        />
      </Container>
    </main>
  );
}
